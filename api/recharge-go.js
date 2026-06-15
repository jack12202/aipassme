const { CHANNELS } = require('../lib/channels');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.redirect(302, CHANNELS.czgpt.url);
};
