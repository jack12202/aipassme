const CHANNELS = {
  czgpt: {
    name: '廖的通道',
    url: 'https://czgpt.plus',
  },
  internal: {
    name: '站内充值系统',
    url: '/activate/?v=20260606',
  },
  ow800: {
    name: '三哥通道',
    url: 'https://ow800.com/auto',
  },
  dnscon: {
    name: '白的通道',
    url: 'https://dnscon.xyz/',
  },
  '987ai': {
    name: '阿妍的通道',
    url: 'https://987ai.vip/recharge',
  },
  '9977ai': {
    name: '七七的通道',
    url: 'https://9977ai.vip/',
  },
};

const DEFAULT_CHANNEL = 'czgpt';
const KV_KEY = 'aipass:recharge-active-channel:v2';

function normalizeChannel(value) {
  return Object.prototype.hasOwnProperty.call(CHANNELS, value) ? value : DEFAULT_CHANNEL;
}

async function kvCommand(command) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    throw new Error(`KV request failed: ${response.status}`);
  }

  return response.json();
}

async function getActiveChannel() {
  const data = await kvCommand(['GET', KV_KEY]);
  return normalizeChannel(data?.result);
}

async function setActiveChannel(channel) {
  const active = normalizeChannel(channel);
  const result = await kvCommand(['SET', KV_KEY, active]);
  if (!result) {
    throw new Error('KV is not configured.');
  }
  await kvCommand(['SET', `${KV_KEY}:updated-at`, new Date().toISOString()]);
  return active;
}

async function getUpdatedAt() {
  const data = await kvCommand(['GET', `${KV_KEY}:updated-at`]);
  return typeof data?.result === 'string' ? data.result : '';
}

module.exports = {
  CHANNELS,
  DEFAULT_CHANNEL,
  getActiveChannel,
  getUpdatedAt,
  normalizeChannel,
  setActiveChannel,
};
