import { AppManagingAccount } from './AppManagingAccount.ts';
import { AppClientAccount } from './AppClientAccount.ts';
import { Application } from './Application.ts';
import { Collector } from './Collector.ts';
import { CollectorClient } from './CollectorClient.ts';
import { CollectorInvite } from './CollectorInvite.ts';
import { CollectorRequest } from './CollectorRequest.ts';
import { Contact } from './Contact.ts';
export type { ContactInvite } from './Contact.ts';
export type { AccessUpdateRequest, AccessUpdateRequestContent, AccessUpdateAction } from './interfaces.ts';
export { getOrCreateBridgeAccess, recreateBridgeAccess, ensureBridgeAccess } from './bridgeAccess.ts';
export type { BridgeAccessOptions, BridgeAccessResult } from './bridgeAccess.ts';
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
export { AppManagingAccount, AppClientAccount, Application, Collector, CollectorClient, CollectorInvite, CollectorRequest, Contact };

// Plan 45 — custom-fields & system-stream resolvers + types.
export {
  buildStreamMap,
  resolveStreamCustomField,
  resolveStreamCustomFieldDetailed,
  resolveStreamSystemFeature,
  resolveStreamSystemFeatureDetailed,
  streamCustomFieldToVirtualItem,
  customFieldDeclarationToVirtualItem
} from './resolveStream.ts';
export type {
  CustomFieldResolution,
  SystemFeatureResolution,
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
  SystemMessageType,
  HDSSystemAlertDef,
  HDSSystemAckDef,
  HDSSystemFeature
} from './systemFeatureTypes.ts';
export type {
  StreamPermission,
  ExistingStreamRef,
  CustomFieldDeclaration,
  AppTemplateSection,
  AppTemplate
} from './templateTypes.ts';
