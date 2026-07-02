import { setPreferredLocales } from './localizeText.ts';

// Production HDS registry. Apps targeting another platform (demo, local
// backloop) must call setServiceInfoURL() before any HDSService/HDSModel use.
let serviceInfoUrl: string = 'https://reg.api.datasafe.dev/service/info';

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
