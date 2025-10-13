import { setPreferredLocales } from './localizeText';

// todo change when in production
let serviceInfoUrl: string = 'https://demo.datasafe.dev/reg/service/info';

/**
 * Set default service info URL
 */
export function setServiceInfoURL (url: string): void {
  serviceInfoUrl = url;
}

/**
 * Get default service info URL
 */
export function getServiceInfoURL (): string {
  return serviceInfoUrl;
}

export { setPreferredLocales };
