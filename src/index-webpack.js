import HDSModel from './HDSModel/HDSModel';
import appTemplates from './appTemplates/appTemplates';
import pryv from './patchedPryv';
import { localizeText, setPreferredLocale } from './localizeText';
const l = localizeText;
/**
 * Export for webpack build
 */
export {
  HDSModel,
  appTemplates,
  pryv,
  localizeText,
  setPreferredLocale,
  l
};
