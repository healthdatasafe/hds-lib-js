import { localizeText } from './localizeText';
import * as settings from './settings';
import { pryv } from './patchedPryv';
import { HDSModel } from './HDSModel/HDSModel';
import * as appTemplates from './appTemplates/appTemplates';
import * as logger from './logger';
import { HDSService } from './HDSService';
import * as HDSModelInitAndSingleton from './HDSModel/HDSModelInitAndSingleton';
import * as toolkit from './toolkit';
import { durationToSeconds, durationToLabel } from './utils/duration';
import { computeReminders } from './HDSModel/reminders';
import { eventToShortText, formatEventDate } from './HDSModel/eventToShortText';
import { MonitorScope } from './MonitorScope';
import { HDSSettings, SETTING_TYPES } from './settings/HDSSettings';
export type { MonitorScopeConfig, MonitorScopeCallbacks } from './MonitorScope';
export type { ReminderConfig } from './HDSModel/HDSItemDef';
export type { ReminderSource, ReminderStatus } from './HDSModel/reminders';
export type { SettingKey, SettingsValues, DateFormat, UnitSystem, Theme } from './settings/HDSSettings';

export const model = (() => {
  console.warn('HDSLib.model is deprecated use getHDSModel() instead');
  return HDSModelInitAndSingleton.getModel();
})();

export const getHDSModel = HDSModelInitAndSingleton.getModel;
export const initHDSModel = HDSModelInitAndSingleton.initHDSModel;
export { pryv, settings, HDSService, HDSModel, appTemplates, localizeText, localizeText as l, toolkit, logger, durationToSeconds, durationToLabel, computeReminders, eventToShortText, formatEventDate, MonitorScope, HDSSettings, SETTING_TYPES };

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
  SETTING_TYPES
};
export default HDSLib;
