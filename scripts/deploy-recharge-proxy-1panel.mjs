import crypto from "node:crypto";

const PANEL_BASE = process.env.PANEL_BASE;
const PANEL_ENTRANCE = process.env.PANEL_ENTRANCE;
const PANEL_USER = process.env.PANEL_USER;
const PANEL_PASS = process.env.PANEL_PASS;
const PANEL_TARGET_DIR = process.env.PANEL_TARGET_DIR || "";

const API_PREFIX = "/api/v1";

for (const [name, value] of Object.entries({
  PANEL_BASE,
  PANEL_ENTRANCE,
  PANEL_USER,
  PANEL_PASS
})) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

class PanelClient {
  constructor() {
    this.cookies = new Map();
    this.token = "";
  }

  cookieHeader() {
    return Array.from(this.cookies.entries())
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  storeSetCookie(headers) {
    const setCookies = headers.getSetCookie?.() || [];
    for (const line of setCookies) {
      const pair = line.split(";", 1)[0];
      const idx = pair.indexOf("=");
      if (idx > 0) {
        this.cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
      }
    }
  }

  async request(pathname, { method = "GET", headers = {}, body } = {}) {
    const finalHeaders = {
      EntranceCode: Buffer.from(PANEL_ENTRANCE).toString("base64"),
      ...headers
    };
    if (this.token) {
      finalHeaders.Authorization = this.token;
      finalHeaders["1Panel-Token"] = this.token;
      finalHeaders["X-Panel-Token"] = this.token;
      finalHeaders["X-Token"] = this.token;
    }
    const cookie = this.cookieHeader();
    if (cookie) finalHeaders.Cookie = cookie;

    const response = await fetch(`${PANEL_BASE}${pathname}`, {
      method,
      headers: finalHeaders,
      body
    });
    this.storeSetCookie(response.headers);

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    if (!response.ok) {
      throw new Error(`Panel request failed (${response.status}): ${text}`);
    }
    if (parsed?.code && parsed.code !== 200) {
      throw new Error(`Panel API failed (${parsed.code}): ${parsed.message || text}`);
    }

    return parsed;
  }

  async init() {
    await this.request(`/${PANEL_ENTRANCE}`);
  }

  get panelPublicKeyPem() {
    const encoded = this.cookies.get("panel_public_key");
    if (!encoded) throw new Error("panel_public_key cookie missing");
    return Buffer.from(decodeURIComponent(encoded), "base64").toString("utf8");
  }

  encryptPassword(plain) {
    const aesKeyHex = crypto.randomBytes(16).toString("hex");
    const iv = crypto.randomBytes(16);
    const rsaCipher = crypto.publicEncrypt(
      {
        key: this.panelPublicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PADDING
      },
      Buffer.from(aesKeyHex, "utf8")
    ).toString("base64");

    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(aesKeyHex, "utf8"),
      iv
    );
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]).toString("base64");
    return `${rsaCipher}:${iv.toString("base64")}:${encrypted}`;
  }

  async login() {
    await this.init();
    const result = await this.request(`${API_PREFIX}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: PANEL_USER,
        password: this.encryptPassword(PANEL_PASS),
        authMethod: "session",
        language: "zh"
      })
    });

    if (result?.data?.token) {
      this.token = result.data.token;
    }

    if (!this.token && this.cookies.size === 0) {
      throw new Error(`1Panel login did not return session credentials: ${JSON.stringify(result)}`);
    }
  }

  async searchCronjobs(info = "") {
    const result = await this.request(`${API_PREFIX}/cronjobs/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        info,
        page: 1,
        pageSize: 50,
        orderBy: "created_at",
        order: "null"
      })
    });
    return result?.data?.items || [];
  }

  async deleteCronjobs(ids) {
    if (!ids.length) return;
    await this.request(`${API_PREFIX}/cronjobs/del`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, cleanData: true, cleanRemoteData: true })
    });
  }

  async createCronjob(payload) {
    const result = await this.request(`${API_PREFIX}/cronjobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return result?.data;
  }

  async runCronjob(id) {
    await this.request(`${API_PREFIX}/cronjobs/handle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
  }

  async searchRecords(cronjobID) {
    const result = await this.request(`${API_PREFIX}/cronjobs/search/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: 1,
        pageSize: 10,
        cronjobID,
        startTime: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        endTime: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        status: ""
      })
    });
    return result?.data?.items || [];
  }

  async readRecordLog(id) {
    const result = await this.request(`${API_PREFIX}/cronjobs/records/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    return (result?.data || "").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "").replace(/\r/g, "");
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function buildDeployScript() {
  const staticTargetDir = shellQuote(PANEL_TARGET_DIR);
  return `#!/bin/sh
set -eu

STATIC_TARGET_DIR=${staticTargetDir}
BLOCK_FILE="/tmp/aipass-recharge-proxy-locations.conf"

cat > "$BLOCK_FILE" <<'EOF'
# BEGIN AIPASS RECHARGE PROXY
location ^~ /api/recharge/ {
    proxy_pass http://127.0.0.1:8788;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
# END AIPASS RECHARGE PROXY
EOF

patch_site_conf() {
  conf_file="$1"
  backup="$conf_file.bak.$(date +%Y%m%d%H%M%S)"
  tmp="$conf_file.tmp.$$"

  echo "[aipass] patching $conf_file"
  cp "$conf_file" "$backup"

  awk -v block_file="$BLOCK_FILE" '
    function delta(text, open_count, close_count) {
      open_count = gsub(/\\{/, "{", text)
      close_count = gsub(/\\}/, "}", text)
      return open_count - close_count
    }
    BEGIN {
      while ((getline line < block_file) > 0) block = block line ORS
      managed = 0
      skip = 0
      skip_depth = 0
      server_depth = 0
      in_server = 0
      server_has_aipass = 0
      inserted = 0
    }
    {
      line = $0
      line_delta = delta(line)

      if (managed) {
        if (line ~ /END AIPASS RECHARGE PROXY/) managed = 0
        next
      }
      if (line ~ /BEGIN AIPASS RECHARGE PROXY/) {
        managed = 1
        next
      }

      if (!in_server && line ~ /^[[:space:]]*server[[:space:]]*\\{/) {
        in_server = 1
        server_depth = 0
        server_has_aipass = 0
      }
      if (in_server && line ~ /server_name/ && line ~ /aipass\\.me/) {
        server_has_aipass = 1
      }

      if (skip) {
        skip_depth += line_delta
        if (skip_depth <= 0) skip = 0
        next
      }
      if (in_server && server_has_aipass && line ~ /^[[:space:]]*location[[:space:]]/ && index(line, "/api/recharge/")) {
        skip = 1
        skip_depth = line_delta
        if (skip_depth <= 0) skip = 0
        next
      }

      if (in_server && server_has_aipass && server_depth + line_delta == 0) {
        printf "%s", block
        inserted += 1
      }
      print line
      if (in_server) {
        server_depth += line_delta
        if (server_depth <= 0) in_server = 0
      }
    }
    END {
      if (inserted == 0) exit 42
    }
  ' "$conf_file" > "$tmp" || {
    status="$?"
    mv "$backup" "$conf_file"
    rm -f "$tmp"
    echo "[aipass] failed to patch $conf_file, restored backup"
    exit "$status"
  }

  mv "$tmp" "$conf_file"
}

FOUND_FILES="/tmp/aipass-recharge-proxy-files.txt"
: > "$FOUND_FILES"

SEARCH_ROOTS=""
if [ -n "$STATIC_TARGET_DIR" ]; then
  SITE_DIR="$(dirname "$(dirname "$STATIC_TARGET_DIR")")"
  SEARCH_ROOTS="$SITE_DIR $(dirname "$SITE_DIR")"
fi

for root in $SEARCH_ROOTS /opt/1panel/apps/openresty/openresty /www /etc/nginx; do
  [ -d "$root" ] || continue
  find "$root" -maxdepth 8 -type f -name "*.conf" -exec grep -slE 'server_name[[:space:]][^;]*(^|[[:space:]])(www\\.)?aipass\\.me([[:space:];]|$)' {} + 2>/dev/null || true
done | sort -u > "$FOUND_FILES"

if [ ! -s "$FOUND_FILES" ]; then
  echo "[aipass] could not locate OpenResty server config for aipass.me"
  find /opt/1panel /www /etc/nginx -maxdepth 6 -type f -name "*.conf" 2>/dev/null | head -80 || true
  exit 1
fi

while IFS= read -r conf_file; do
  patch_site_conf "$conf_file"
done < "$FOUND_FILES"

if command -v docker >/dev/null 2>&1; then
  OPENRESTY_CONTAINER="$(docker ps --format '{{.Names}}' | grep -E 'openresty|1panel-openresty' | head -n1 || true)"
else
  OPENRESTY_CONTAINER=""
fi

run_openresty_test() {
  if [ -n "$OPENRESTY_CONTAINER" ]; then
    docker exec "$OPENRESTY_CONTAINER" nginx -t || docker exec "$OPENRESTY_CONTAINER" openresty -t
    return
  fi
  if command -v openresty >/dev/null 2>&1; then
    openresty -t
  else
    nginx -t
  fi
}

run_openresty_reload() {
  if [ -n "$OPENRESTY_CONTAINER" ]; then
    docker exec "$OPENRESTY_CONTAINER" nginx -s reload || docker exec "$OPENRESTY_CONTAINER" openresty -s reload
    return
  fi
  if command -v openresty >/dev/null 2>&1; then
    openresty -s reload
  else
    nginx -s reload
  fi
}

echo "[aipass] testing OpenResty config"
run_openresty_test
echo "[aipass] reloading OpenResty"
run_openresty_reload

echo "[aipass] checking recharge backend health"
curl -fsS http://127.0.0.1:8788/health >/tmp/aipass-recharge-health.json
cat /tmp/aipass-recharge-health.json
echo
echo "[aipass] proxy deployment finished"
`;
}

async function waitForCompletion(client, cronjobID) {
  const startedAt = Date.now();
  let latestRecordId = null;
  let latestStatus = "";
  let latestLog = "";

  while (Date.now() - startedAt < 10 * 60 * 1000) {
    const records = await client.searchRecords(cronjobID);
    if (records.length) {
      const latest = records[0];
      latestRecordId = latest.id;
      latestStatus = latest.status || "";
      latestLog = latest.records ? await client.readRecordLog(latest.id) : latestLog;
      if (latestStatus === "Success") {
        console.log(latestLog);
        return;
      }
      if (latestStatus === "Failed") {
        console.log(latestLog);
        throw new Error(`AIPass recharge proxy deploy task failed, record ${latestRecordId}`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  if (latestLog) console.log(latestLog);
  throw new Error(`Timed out waiting for AIPass recharge proxy deploy task. Last status: ${latestStatus || "none"}`);
}

async function main() {
  const client = new PanelClient();
  await client.login();

  const taskName = "aipass-recharge-proxy-deploy";
  const existing = await client.searchCronjobs(taskName);
  const matchingIds = existing
    .filter(item => item.name === taskName)
    .map(item => item.id)
    .filter(Boolean);
  await client.deleteCronjobs(matchingIds);

  await client.createCronjob({
    name: taskName,
    type: "shell",
    spec: "30 1 * * 1",
    specObjs: [{ specType: "perWeek", week: 1, day: 0, hour: 1, minute: 30, second: 0 }],
    command: "sh",
    script: buildDeployScript(),
    retainCopies: 3,
    status: "Enable",
    defaultDownload: "LOCAL",
    backupAccounts: "LOCAL",
    backupAccountList: ["LOCAL"],
    inContainer: false,
    containerName: "",
    hasAlert: false,
    alertCount: 0,
    alertTitle: ""
  });

  const created = await client.searchCronjobs(taskName);
  const task = created.find(item => item.name === taskName);
  if (!task?.id) {
    throw new Error("Created cronjob was not found");
  }

  console.log(`Running 1Panel cronjob ${taskName} (${task.id})`);
  await client.runCronjob(task.id);
  await waitForCompletion(client, task.id);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
