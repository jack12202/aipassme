const { CHANNELS, getActiveChannel } = require('../lib/channels');

module.exports = async function handler(req, res) {
  try {
    const active = await getActiveChannel();

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.redirect(302, CHANNELS[active].url);
  } catch (error) {
    console.error(error);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.redirect(302, CHANNELS.ow800.url);
  }
};
