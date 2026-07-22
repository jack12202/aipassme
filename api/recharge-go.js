const { CHANNELS, getActiveChannel } = require('../lib/channels');

const SOURCE_BY_HOST = {
  'aipass.me': 'aipass',
  'www.aipass.me': 'aipass',
  'gplus.cc': 'gplus',
  'www.gplus.cc': 'gplus',
  'gpt4.pro': 'gpt4pro',
  'www.gpt4.pro': 'gpt4pro',
  'gptc.cc': 'gptc',
  'www.gptc.cc': 'gptc',
};

function sourceFromRequest(req) {
  const requested = String(req.query?.source || '').trim().toLowerCase();
  if (Object.values(SOURCE_BY_HOST).includes(requested)) return requested;

  try {
    const referer = new URL(String(req.headers?.referer || ''));
    return SOURCE_BY_HOST[referer.hostname.toLowerCase()] || 'aipass';
  } catch {
    return 'aipass';
  }
}

function targetForRequest(channel, req) {
  const target = new URL(channel.url);
  if (target.hostname === 'gptc.cc' || target.hostname === 'www.gptc.cc') {
    target.searchParams.set('source', sourceFromRequest(req));
  }
  return target.toString();
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  const active = await getActiveChannel();
  res.redirect(302, targetForRequest(CHANNELS[active], req));
};
