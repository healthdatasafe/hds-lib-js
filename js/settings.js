"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setPreferredLocales = void 0;
exports.setServiceInfoURL = setServiceInfoURL;
exports.getServiceInfoURL = getServiceInfoURL;
const localizeText_1 = require("./localizeText");
Object.defineProperty(exports, "setPreferredLocales", { enumerable: true, get: function () { return localizeText_1.setPreferredLocales; } });
// todo change when in production
let serviceInfoUrl = 'https://demo.datasafe.dev/reg/service/info';
/**
 * Set default service info URL
 */
function setServiceInfoURL(url) {
    serviceInfoUrl = url;
}
/**
 * Get default service info URL
 */
function getServiceInfoURL() {
    return serviceInfoUrl;
}
//# sourceMappingURL=settings.js.map