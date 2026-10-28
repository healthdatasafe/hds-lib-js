import { localizeText } from './localizeText.ts';
import * as settings from './settings.ts';
import { pryv, cmc, encryption, delegation } from './patchedPryv.ts';
import { HDSModel } from './HDSModel/HDSModel.ts';
import * as appTemplates from './appTemplates/appTemplates.ts';
import * as logger from './logger.ts';
import { HDSService } from './HDSService.ts';
import * as HDSModelInitAndSingleton from './HDSModel/HDSModelInitAndSingleton.ts';
import * as toolkit from './toolkit/index.ts';
import { durationToSeconds, durationToLabel } from './utils/duration.ts';
import { cycleDayAt } from './utils/calendarDay.ts';
import { cyclePhaseAt } from './utils/cyclePhase.ts';
import { shiftOf, shiftInCycle, coverlinesOf, temperatureRuleOf, isManualTemperatureRule, TEMPERATURE_RULES } from './utils/temperatureShift.ts';
import { computeReminders } from './HDSModel/reminders.ts';
import { eventToShortText, eventToShortTextWithOrigin, formatEventDate } from './HDSModel/eventToShortText.ts';
import { LAB_RESULT_CODED, LAB_COMPARATORS, labComparatorOf, isExactLabValue, labUnitText, labResultCodedText, labValueToFhir, labSeriesKey, isValidLoincCode, checkLabResultCoded } from './HDSModel/labResults.ts';
import { ENTERABLE_ITEM_TYPES } from './HDSModel/HDSItemDef.ts';
import { MonitorScope } from './MonitorScope.ts';
import { HDSSettings, SETTING_TYPES } from './settings/HDSSettings.ts';
import { HDSProfile, PROFILE_FIELDS } from './settings/HDSProfile.ts';
import { resolveAccountPreference, hasAccountPreference, saveLanguage } from './settings/accountPreferences.ts';
import { HDSModelConversions } from './HDSModel/HDSModel-Conversions.ts';
import { HDSModelConverters } from './HDSModel/HDSModel-Converters.ts';
import { HDSModelPreferred, getPreferredInput, getPreferredDisplay, CERVICAL_FLUID_METHOD_KEY, CERVICAL_FLUID_METHOD_LEGACY_KEY } from './HDSModel/HDSModel-Preferred.ts';
import { HDSModelAppStreams } from './HDSModel/HDSModel-AppStreams.ts';
import { EuclidianDistanceEngine } from './converters/EuclidianDistanceEngine.ts';
import { HDSLibError } from './errors.ts';
import { extractOverloadAsDefinitions } from './HDSModel/overloadExtract.ts';
import * as cmcFormSpec from './cmc/formSpec.ts';
import * as cmcAppScope from './cmc/appScope.ts';
import * as cmcConstants from './cmc/constants.ts';
import * as cmcDataExport from './cmc/dataExport.ts';
import * as cmcScope from './cmc/scope.ts';
export type { Localizable, localizableText } from './localizeText.ts';
export type { FormatEventDateOptions, EventDateSource, ShortTextOrigin, ShortTextResult } from './HDSModel/eventToShortText.ts';
export type { LabComparator, LabFhirValue, LabResultCodedIssue } from './HDSModel/labResults.ts';
export type { MonitorScopeConfig, MonitorScopeCallbacks } from './MonitorScope.ts';
export type { ReminderConfig } from './HDSModel/HDSItemDef.ts';
export type { ReminderSource, ReminderStatus } from './HDSModel/reminders.ts';
export type { CyclePhase, CycleBasis, CyclePhaseResult, CycleEventLike } from './utils/cyclePhase.ts';
export type { TemperatureRule, TemperatureRuleId, CalculatedTemperatureRule, ManualTemperatureRule, TemperatureShift, TemperaturePoint, TemperatureSeries, TemperatureShiftOptions, TemperatureShiftInCycle, Coverline } from './utils/temperatureShift.ts';
export type { SettingKey, SettingsValues, DateFormat, UnitSystem, Theme } from './settings/HDSSettings.ts';
export type { ProfileKey, ProfileValues } from './settings/HDSProfile.ts';
export type { AccountPreferenceKey, SaveLanguageResult } from './settings/accountPreferences.ts';
export type { ConverterPack, ConversionResult as ConverterConversionResult, ObservationVector, SourceBlock, MethodDef, TemperatureRuleDef } from './converters/types.ts';
export type { PreferredConfig } from './HDSModel/HDSModel-Preferred.ts';
export type { AppStreamDef } from './HDSModel/HDSModel-AppStreams.ts';
export type { HDSModelOverload } from './HDSModel/HDSModel-Overload.ts';
export type { InitHDSModelOptions } from './HDSModel/HDSModelInitAndSingleton.ts';

export const getHDSModel = HDSModelInitAndSingleton.getModel;
export const initHDSModel = HDSModelInitAndSingleton.initHDSModel;
export { pryv, cmc, encryption, delegation, settings, HDSService, HDSModel, appTemplates, localizeText, localizeText as l, toolkit, logger, durationToSeconds, durationToLabel, cycleDayAt, cyclePhaseAt, shiftOf, shiftInCycle, coverlinesOf, temperatureRuleOf, isManualTemperatureRule, TEMPERATURE_RULES, computeReminders, eventToShortText, eventToShortTextWithOrigin, formatEventDate, LAB_RESULT_CODED, LAB_COMPARATORS, labComparatorOf, isExactLabValue, labUnitText, labResultCodedText, labValueToFhir, labSeriesKey, isValidLoincCode, checkLabResultCoded, ENTERABLE_ITEM_TYPES, MonitorScope, HDSSettings, SETTING_TYPES, HDSProfile, PROFILE_FIELDS, resolveAccountPreference, hasAccountPreference, saveLanguage, HDSModelConversions, HDSModelConverters, HDSModelPreferred, getPreferredInput, getPreferredDisplay, CERVICAL_FLUID_METHOD_KEY, CERVICAL_FLUID_METHOD_LEGACY_KEY, HDSModelAppStreams, EuclidianDistanceEngine, HDSLibError, extractOverloadAsDefinitions, cmcFormSpec, cmcAppScope, cmcConstants, cmcDataExport, cmcScope };
export type { FormSpec, FormSpecRecord, FormSpecItemKeyIssue, FormSpecItemKeyIssueReason, FormSpecSource, FormSpecOpenLink } from './cmc/formSpec.ts';
export type { TemplateScopeDiff, TemplateBump, TemplateToFormSpecResult } from './appTemplates/datasetTemplate.ts';
export type { LoadTemplateFromUrlOptions } from './appTemplates/loader.ts';
export type { DataExportRequest, DataExportRequestParams } from './cmc/dataExport.ts';
export type { ScopePermission, ScopeMessage, ScopeRelationship, ScopeUpdateHds, ScopeChangeOptions, ScopeChangeResult, StopSharingRefusal, StopSharingPlan, SharingNote } from './cmc/scope.ts';
export type { PermissionView, PermissionLabelOptions } from './appTemplates/permissionLabels.ts';
export type { LegacyChatSource, LegacyChatEventLike, LegacyChatMessage } from './appTemplates/legacyChat.ts';
export type {
  Delegation, DelegateRecord, ControlledRecord, DelegationRecord, DelegateIdentity,
  RelationshipStatus, DelegationError, DelegationErrorId, TokenResult,
  CreateAccountParams, CreateAccountResult
} from '@pryv/delegation';
// Group membership (@pryv/cmc 3.21): a group account's members and its offboarding sweeps.
export type { MemberRecord, SweepRecord } from '@pryv/cmc';

// Plan 45 — top-level type re-exports so consumers can `import type { CustomFieldDeclaration } from 'hds-lib'`.
export type {
  CustomFieldEventType,
  EmptyDef,
  HDSCustomFieldDef,
  HDSCustomField
} from './appTemplates/customFieldTypes.ts';
export type {
  StreamPermission,
  ExistingStreamRef,
  CustomFieldDeclaration,
  AppTemplateSection,
  AppTemplate,
  DatasetTemplate,
  DatasetTemplateApp
} from './appTemplates/templateTypes.ts';
export type {
  CustomFieldResolution,
  ResolutionKind,
  VirtualItemDef,
  VirtualItemFieldType
} from './appTemplates/resolveStream.ts';

// also exporting default for typescript to capture HDSLib.. there is surely a nicer way to do
const HDSLib = {
  getHDSModel,
  initHDSModel,
  pryv,
  cmc,
  encryption,
  delegation,
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
  cycleDayAt,
  cyclePhaseAt,
  shiftOf,
  shiftInCycle,
  coverlinesOf,
  temperatureRuleOf,
  isManualTemperatureRule,
  TEMPERATURE_RULES,
  computeReminders,
  eventToShortText,
  eventToShortTextWithOrigin,
  formatEventDate,
  LAB_RESULT_CODED,
  LAB_COMPARATORS,
  labComparatorOf,
  isExactLabValue,
  labUnitText,
  labResultCodedText,
  labValueToFhir,
  labSeriesKey,
  isValidLoincCode,
  checkLabResultCoded,
  ENTERABLE_ITEM_TYPES,
  MonitorScope,
  HDSSettings,
  SETTING_TYPES,
  HDSProfile,
  PROFILE_FIELDS,
  resolveAccountPreference,
  hasAccountPreference,
  saveLanguage,
  HDSModelConversions,
  HDSModelConverters,
  EuclidianDistanceEngine,
  extractOverloadAsDefinitions,
  cmcFormSpec,
  cmcAppScope,
  cmcConstants,
  cmcDataExport,
  cmcScope
};
export default HDSLib;
