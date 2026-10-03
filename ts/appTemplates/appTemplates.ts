import { AppManagingAccount } from './AppManagingAccount.ts';
import { AppClientAccount } from './AppClientAccount.ts';
import { Application } from './Application.ts';
import { CollectorRequest } from './CollectorRequest.ts';
import { Contact } from './Contact.ts';
import { Questionnaire } from './Questionnaire.ts';
export { getOrCreateBridgeAccess, ensureBridgeAccess } from './bridgeAccess.ts';
export type { BridgeAccessOptions, BridgeAccessResult } from './bridgeAccess.ts';

// Catalogue connectors: matching rule, connector access, status; hook executor; offer streams.
export {
  CONNECTOR_STATUS_TYPE,
  connectorCmcAppCode,
  connectorIdFromCmcAppCode,
  findConnectorAccesses,
  connectorAccessName,
  syncStatusLeafFor,
  connectorAccessRefusal,
  getOrCreateConnectorAccess,
  disconnectedStatusContent,
  markConnectorDisconnected
} from './connectors.ts';
export type { ConnectorAccessLike, ConnectorConnection, ConnectorStatusContent } from './connectors.ts';
export {
  expand,
  executeHook,
  executeDisconnect,
  UnresolvedVariableError,
  HookInitiateError
} from './hookExecutor.ts';
export type {
  HookHttpStep,
  HookOpenStep,
  HookResyncStep,
  HookDescriptor,
  HookContext,
  HookResult
} from './hookExecutor.ts';
export { offerStreamsToCreate, offerStreamsToApiCalls } from './offerStreams.ts';
export type { ModelStreams, StreamToCreate } from './offerStreams.ts';
export {
  getSectionItemLabels,
  collectItemLabelsFromSections,
  collectItemLabels
} from './itemLabels.ts';
export type {
  ItemLabels,
  ItemCustomization,
  ItemLabelSource,
  ItemLabelsWithSource,
  CollectItemLabelsOptions
} from './itemLabels.ts';
export { AppManagingAccount, AppClientAccount, Application, CollectorRequest, Contact, Questionnaire };

// Plan 71 — questionnaire shapes (used by hds-forms-js renderer + dashboards)
export type {
  QuestionScope,
  QuestionSubField,
  QuestionDef,
  AnswerStatus,
  AnswerEntry,
  QuestionnaireRequestContent,
  QuestionnaireAnswerContent
} from './interfaces.ts';

// Plan 71 — Questionnaire coverage check against a CollectorRequest's permissions.
export { checkQuestionnaireCoverage } from './questionnaireCoverage.ts';
export type {
  QuestionCoverage,
  QuestionnaireCoverageReport,
  RequestCoverageLike
} from './questionnaireCoverage.ts';

// Plan 45 — custom-fields resolvers + types.
export {
  buildStreamMap,
  resolveStreamCustomField,
  resolveStreamCustomFieldDetailed,
  streamCustomFieldToVirtualItem,
  customFieldDeclarationToVirtualItem
} from './resolveStream.ts';
export type {
  CustomFieldResolution,
  ResolutionKind,
  VirtualItemDef,
  VirtualItemFieldType
} from './resolveStream.ts';

export { isEmptyDef } from './customFieldTypes.ts';
export {
  loadTemplate,
  loadTemplateFromUrl,
  isCustomFieldDeclaration,
  isExistingStreamRef
} from './loader.ts';
export type {
  CustomFieldEventType,
  EmptyDef,
  HDSCustomFieldDef,
  HDSCustomField
} from './customFieldTypes.ts';
export type {
  StreamPermission,
  ExistingStreamRef,
  CustomFieldDeclaration,
  AppTemplateSection,
  AppTemplate
} from './templateTypes.ts';
