import { Application } from './Application.ts';

/**
 * App that manages a CMC-enabled HDS account (doctor / researcher side).
 *
 * Post-plan-61 Phase C, all form-storage and patient-invite management
 * lives in CMC: form templates are `hds-form-spec/v1` events on
 * `:_cmc:apps:hds-collector:<collectorId>` (use `cmcFormSpec.listFormSpecs`
 * + `getFormSpecById` + the consumer-side `cmcDoctor.saveFormSpec`), and
 * patient invites go through `cmc.createInvite` / `listInvites` /
 * `acceptInvite`.
 *
 * AppManagingAccount itself now provides only the base `Application`
 * surface (init, connection, baseStreamId) — no legacy Collector
 * lifecycle.
 */
export class AppManagingAccount extends Application {
  // used by Application.init();
  get appSettings (): any {
    return {
      canBePersonnal: true,
      mustBeMaster: true,
      appNameFromAccessInfo: true // application name will be taken from Access-Info Name
    };
  }
}
