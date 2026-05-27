import { Application } from './Application.ts';

/**
 * Patient-side HDS account wrapper.
 *
 * Post-plan-61 Phase C, the patient flow is CMC-only:
 * - Incoming invites are accepted via `cmc.acceptInvite`
 * - Active relationships are read via `cmc.listAcceptedRelationships` +
 *   the patient's local counterparty accesses, aggregated into Contacts
 *   by `Contact.aggregateCmc()`
 *
 * AppClientAccount now provides only the base `Application` surface
 * (init, connection, baseStreamId) — no legacy CollectorClient lifecycle.
 * Useful primarily as the target of `HDSSettings.hookToApplication()`.
 */
export class AppClientAccount extends Application {
  get appSettings (): any {
    return {
      canBePersonnal: true,
      mustBeMaster: true
    };
  }
}
