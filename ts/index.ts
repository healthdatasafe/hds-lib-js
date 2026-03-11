import { localizeText } from './localizeText.js';
import * as settings from './settings.js';
import { pryv } from './patchedPryv.js';
import { HDSModel } from './HDSModel/HDSModel.js';
import * as appTemplates from './appTemplates/appTemplates.js';
import * as logger from './logger.js';
import { HDSService } from './HDSService.js';
import * as HDSModelInitAndSingleton from './HDSModel/HDSModelInitAndSingleton.js';
import * as toolkit from './toolkit/index.js';
import { durationToSeconds, durationToLabel } from './utils/duration.js';
import { computeReminders } from './HDSModel/reminders.js';
import { eventToShortText, formatEventDate } from './HDSModel/eventToShortText.js';
import { MonitorScope } from './MonitorScope.js';
import { HDSSettings, SETTING_TYPES } from './settings/HDSSettings.js';
import { HDSModelConversions } from './HDSModel/HDSModel-Conversions.js';
export type { MonitorScopeConfig, MonitorScopeCallbacks } from './MonitorScope.js';
export type { ReminderConfig } from './HDSModel/HDSItemDef.js';
export type { ReminderSource, ReminderStatus } from './HDSModel/reminders.js';
export type { SettingKey, SettingsValues, DateFormat, UnitSystem, Theme } from './settings/HDSSettings.js';

export const model = (() => {
  console.warn('HDSLib.model is deprecated use getHDSModel() instead');
  return HDSModelInitAndSingleton.getModel();
})();

export const getHDSModel = HDSModelInitAndSingleton.getModel;
export const initHDSModel = HDSModelInitAndSingleton.initHDSModel;
export { pryv, settings, HDSService, HDSModel, appTemplates, localizeText, localizeText as l, toolkit, logger, durationToSeconds, durationToLabel, computeReminders, eventToShortText, formatEventDate, MonitorScope, HDSSettings, SETTING_TYPES, HDSModelConversions };

// also exporting default for typescript to capture HDSLib.. there is surely a nicer way to do
const HDSLib = {
  getHDSModel,
  initHDSModel,
  pryv,
  settings,
  HDSService,
  HDSModel,
  appTemplates,
  localizeText,
  l: localizeText,
  toolkit,
  logger,
  durationToSeconds,
  durationToLabel,
  computeReminders,
  eventToShortText,
  formatEventDate,
  MonitorScope,
  HDSSettings,
  SETTING_TYPES,
  HDSModelConversions
};
export default HDSLib;
