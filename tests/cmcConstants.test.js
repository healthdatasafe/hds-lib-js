import { assert } from './test-utils/deps-node.js';
import {
  CMC_APP_CODES,
  CMC_EVENT_TYPES,
  appSubScope,
  extractAppSubScopeSuffix
} from '../ts/cmc/constants.ts';

/**
 * Unit tests for the Plan 60 B2 shared CMC constants + scope helpers.
 *
 * The constants are locked per Plan 59 Decisions; tests assert the exact
 * values so any drift becomes a deliberate change with an explicit diff.
 */

describe('[CCST] cmcConstants', function () {
  describe('[CCSA] CMC_APP_CODES', function () {
    it('[CCS01] PATIENT, COLLECTOR, BRIDGE_MIRA, BRIDGE_ATHENA match locked values', () => {
      assert.equal(CMC_APP_CODES.PATIENT, 'hds-patient');
      assert.equal(CMC_APP_CODES.COLLECTOR, 'hds-collector');
      assert.equal(CMC_APP_CODES.BRIDGE_MIRA, 'hds-bridge-mira');
      assert.equal(CMC_APP_CODES.BRIDGE_ATHENA, 'hds-bridge-athena');
    });
  });

  describe('[CCSE] CMC_EVENT_TYPES', function () {
    it('[CCS10] INVITE_TRIGGER + ACCEPT match the CMC plugin convention', () => {
      assert.equal(CMC_EVENT_TYPES.INVITE_TRIGGER, 'consent/request-cmc');
      assert.equal(CMC_EVENT_TYPES.ACCEPT, 'consent/accept-cmc');
    });
  });

  describe('[CCSB] appSubScope', function () {
    it('[CCS20] builds the canonical sub-scope id', () => {
      assert.equal(
        appSubScope(CMC_APP_CODES.COLLECTOR, 'abc123'),
        ':_cmc:apps:hds-collector:abc123'
      );
    });
    it('[CCS21] composes deeper paths via colon-joined sub', () => {
      assert.equal(
        appSubScope(CMC_APP_CODES.PATIENT, 'chats:dr-smith'),
        ':_cmc:apps:hds-patient:chats:dr-smith'
      );
    });
  });

  describe('[CCSX] extractAppSubScopeSuffix', function () {
    it('[CCS30] strips the appScope prefix', () => {
      assert.equal(
        extractAppSubScopeSuffix(':_cmc:apps:hds-collector:abc123', CMC_APP_CODES.COLLECTOR),
        'abc123'
      );
    });
    it('[CCS31] tolerates leading prefix (matches original .*? regex behavior)', () => {
      assert.equal(
        extractAppSubScopeSuffix('peer:_cmc:apps:hds-collector:abc123', CMC_APP_CODES.COLLECTOR),
        'abc123'
      );
    });
    it('[CCS32] returns streamId unchanged when prefix absent', () => {
      assert.equal(
        extractAppSubScopeSuffix(':some-other-stream', CMC_APP_CODES.COLLECTOR),
        ':some-other-stream'
      );
    });
    it('[CCS33] does not cross-match a different appCode', () => {
      assert.equal(
        extractAppSubScopeSuffix(':_cmc:apps:hds-collector:abc', CMC_APP_CODES.PATIENT),
        ':_cmc:apps:hds-collector:abc'
      );
    });
  });
});
