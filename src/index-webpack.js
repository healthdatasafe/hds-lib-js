import HDSModel from './HDSModel/HDSModel';
import appTemplates from './appTemplates/appTemplates';
import pryv from './patchedPryv';
import { localizeText, setPreferredLocales } from './localizeText';
import logger from './logger';
const l = localizeText;

/**
 * Export for webpack build
 */
export {
  HDSModel,
  appTemplates,
  pryv,
  localizeText,
  setPreferredLocales,
  l,
  logger
};
