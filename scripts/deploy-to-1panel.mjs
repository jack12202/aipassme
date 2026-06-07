import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PANEL_BASE = process.env.PANEL_BASE;
const PANEL_ENTRANCE = process.env.PANEL_ENTRANCE;
const PANEL_USER = process.env.PANEL_USER;
const PANEL_PASS = process.env.PANEL_PASS;
const PANEL_TARGET_DIR = process.env.PANEL_TARGET_DIR;

const API_PREFIX = "/api/v1";

for (const [name, value] of Object.entries({
  PANEL_BASE,
  PANEL_ENTRANCE,
  PANEL_USER,
  PANEL_PASS,
  PANEL_TARGET_DIR
})) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const repoRoot = process.cwd();

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
    const payload = {
      name: PANEL_USER,
      password: this.encryptPassword(PANEL_PASS),
      authMethod: "session",
      language: "zh"
    };
    const result = await this.request(`${API_PREFIX}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (result?.data?.token) {
      this.token = result.data.token;
    }

    if (!this.token && this.cookies.size === 0) {
      throw new Error(`1Panel login did not return session credentials: ${JSON.stringify(result)}`);
    }
  }

  async uploadFile(remoteDir, localFile, remoteName) {
    const form = new FormData();
    const fileBuffer = fs.readFileSync(localFile);
    const fileName = remoteName.replaceAll(path.sep, "/");

    form.append("path", remoteDir);
    form.append("file", new Blob([fileBuffer]), fileName);

    const result = await this.request(`${API_PREFIX}/files/upload`, {
      method: "POST",
      body: form
    });

    if (result?.code !== 200) {
      throw new Error(`Failed to upload ${fileName}: ${JSON.stringify(result)}`);
    }
  }

  async saveTextFile(remoteFile, content) {
    const result = await this.request(`${API_PREFIX}/files/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        path: remoteFile,
        content
      })
    });

    if (result?.code !== 200) {
      throw new Error(`Failed to save ${remoteFile}: ${JSON.stringify(result)}`);
    }
  }
}

function walkHtmlFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || ["api", "lib", "scripts"].includes(entry.name)) {
        continue;
      }
      result.push(...walkHtmlFiles(fullPath));
      continue;
    }
    if (entry.name.endsWith(".html") && !["prototype.html", "index-plus-redesign.html"].includes(entry.name)) {
      result.push(fullPath);
    }
  }
  return result.sort();
}

function listRootAssets() {
  return fs.readdirSync(repoRoot)
    .filter(name => /\.(png|jpg|jpeg|webp)$/i.test(name))
    .map(name => path.join(repoRoot, name))
    .sort();
}

function relativeFile(localFile) {
  return path.relative(repoRoot, localFile).replaceAll(path.sep, "/");
}

function remoteDirectoryFor(relativeName) {
  const dirName = path.posix.dirname(relativeName);
  if (!dirName || dirName === ".") {
    return PANEL_TARGET_DIR;
  }
  return `${PANEL_TARGET_DIR}/${dirName}`;
}

function remoteFileFor(relativeName) {
  return `${PANEL_TARGET_DIR}/${relativeName}`;
}

async function main() {
  const client = new PanelClient();
  await client.login();

  const htmlFiles = walkHtmlFiles(repoRoot);
  const textFiles = ["robots.txt", "sitemap.xml"]
    .map(file => path.join(repoRoot, file))
    .filter(file => fs.existsSync(file));
  const assetFiles = listRootAssets();

  for (const localFile of [...htmlFiles, ...textFiles]) {
    const relativeName = relativeFile(localFile);
    const remoteFile = remoteFileFor(relativeName);
    console.log(`Saving ${relativeName} -> ${remoteFile}`);
    await client.saveTextFile(remoteFile, fs.readFileSync(localFile, "utf8"));
  }

  for (const localFile of assetFiles) {
    const relativeName = relativeFile(localFile);
    const remoteDir = remoteDirectoryFor(relativeName);
    const remoteName = path.posix.basename(relativeName);
    console.log(`Uploading ${relativeName} -> ${remoteDir}/${remoteName}`);
    await client.uploadFile(remoteDir, localFile, remoteName);
  }

  console.log(`Uploaded ${htmlFiles.length + textFiles.length + assetFiles.length} files to 1Panel.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
