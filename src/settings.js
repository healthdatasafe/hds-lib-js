const { setPreferredLocales } = require('./localizeText');

module.exports = {
  setPreferredLocales,
  setServiceInfoURL,
  getServiceInfoURL
};

// todo change when in production
let serviceInfoUrl = 'https://demo.datasafe.dev/reg/service/info';
/**
 * Set default service info URL
 * @param {string} url
 */
function setServiceInfoURL (url) {
  serviceInfoUrl = url;
}

/**
 * Get default service info URL
 * @returns {string}
 */
function getServiceInfoURL () {
  return serviceInfoUrl;
}
