import { localizeText } from './localizeText.ts';
import * as settings from './settings.ts';
import { pryv } from './patchedPryv.ts';
import { HDSModel } from './HDSModel/HDSModel.ts';
import * as appTemplates from './appTemplates/appTemplates.ts';
import * as logger from './logger.ts';
import { HDSService } from './HDSService.ts';
import * as HDSModelInitAndSingleton from './HDSModel/HDSModelInitAndSingleton.ts';
import * as toolkit from './toolkit/index.ts';
import { durationToSeconds, durationToLabel } from './utils/duration.ts';
import { computeReminders } from './HDSModel/reminders.ts';
import { eventToShortText, formatEventDate } from './HDSModel/eventToShortText.ts';
import { MonitorScope } from './MonitorScope.ts';
import { HDSSettings, SETTING_TYPES } from './settings/HDSSettings.ts';
import { HDSProfile, PROFILE_FIELDS } from './settings/HDSProfile.ts';
import { HDSModelConversions } from './HDSModel/HDSModel-Conversions.ts';
import { HDSModelConverters } from './HDSModel/HDSModel-Converters.ts';
import { EuclidianDistanceEngine } from './converters/EuclidianDistanceEngine.ts';
import { HDSLibError } from './errors.ts';
export type { MonitorScopeConfig, MonitorScopeCallbacks } from './MonitorScope.ts';
export type { ReminderConfig } from './HDSModel/HDSItemDef.ts';
export type { ReminderSource, ReminderStatus } from './HDSModel/reminders.ts';
export type { SettingKey, SettingsValues, DateFormat, UnitSystem, Theme } from './settings/HDSSettings.ts';
export type { ProfileKey, ProfileValues } from './settings/HDSProfile.ts';
export type { ConverterPack, ConversionResult as ConverterConversionResult, ObservationVector, SourceBlock } from './converters/types.ts';

export const model = (() => {
  console.warn('HDSLib.model is deprecated use getHDSModel() instead');
  return HDSModelInitAndSingleton.getModel();
})();

export const getHDSModel = HDSModelInitAndSingleton.getModel;
export const initHDSModel = HDSModelInitAndSingleton.initHDSModel;
export { pryv, settings, HDSService, HDSModel, appTemplates, localizeText, localizeText as l, toolkit, logger, durationToSeconds, durationToLabel, computeReminders, eventToShortText, formatEventDate, MonitorScope, HDSSettings, SETTING_TYPES, HDSProfile, PROFILE_FIELDS, HDSModelConversions, HDSModelConverters, EuclidianDistanceEngine, HDSLibError };

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
  HDSProfile,
  PROFILE_FIELDS,
  HDSModelConversions,
  HDSModelConverters,
  EuclidianDistanceEngine
};
export default HDSLib;
