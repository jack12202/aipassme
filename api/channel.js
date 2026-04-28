const {
  CHANNELS,
  getActiveChannel,
  getUpdatedAt,
  normalizeChannel,
  setActiveChannel,
} = require('../lib/channels');

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  if (typeof req.body === 'string' && req.body.trim() !== '') {
    return JSON.parse(req.body);
  }

  return {};
}

function checkAdminKey(req, body) {
  const adminKey = process.env.ADMIN_CHANNEL_KEY;

  if (!adminKey) {
    return { ok: false, status: 500, message: 'ADMIN_CHANNEL_KEY is not configured.' };
  }

  const providedKey = String(
    req.headers['x-admin-key'] || req.query?.key || body.key || ''
  );

  if (providedKey !== adminKey) {
    return { ok: false, status: 401, message: 'Unauthorized.' };
  }

  return { ok: true };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

  try {
    if (req.method === 'GET') {
      const active = await getActiveChannel();
      const updatedAt = await getUpdatedAt();

      res.status(200).json({
        active,
        updatedAt,
        activeChannel: CHANNELS[active],
        channels: CHANNELS,
      });
      return;
    }

    if (req.method === 'POST') {
      const body = readJsonBody(req);
      const auth = checkAdminKey(req, body);

      if (!auth.ok) {
        res.status(auth.status).json({ error: auth.message });
        return;
      }

      const next = normalizeChannel(String(body.channel || ''));
      const active = await setActiveChannel(next);

      res.status(200).json({
        active,
        activeChannel: CHANNELS[active],
        channels: CHANNELS,
      });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Channel API failed.' });
  }
};
