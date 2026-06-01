import { assert } from './test-utils/deps-node.js';
import { ensureAppScope, pryvErrorCode } from '../ts/cmc/appScope.ts';

/**
 * Unit tests for `cmcAppScope.ensureAppScope`.
 *
 * Behaviour post-2026-05-26 plan-61 upstream fix: the per-app leaf
 * `:_cmc:apps:<appCode>` is auto-provisioned by the CMC plugin's
 * `cmcAccessProvisionAppScopeHook` on `accesses.create` / `accesses.update`.
 * So this helper only does the sub-scope `streams.create` — the no-subPath
 * case returns the leaf id without any API call.
 */

const APP_CODE = 'hds-collector';
const EXPECTED_APP_SCOPE = ':_cmc:apps:' + APP_CODE;

function makeConn (responder) {
  const calls = [];
  return {
    calls,
    async apiOne (method, params) {
      calls.push({ method, params });
      return responder(method, params, calls.length - 1);
    }
  };
}

function pryvError (id) {
  const e = new Error('pryv-api: ' + id);
  e.innerObject = { id };
  return e;
}

describe('[CAS] cmcAppScope.ensureAppScope', function () {
  describe('[CASE] pryvErrorCode', function () {
    it('[CAS01] reads innerObject.id when present', () => {
      assert.equal(pryvErrorCode(pryvError('item-already-exists')), 'item-already-exists');
    });
    it('[CAS02] falls back to top-level id when no innerObject', () => {
      assert.equal(pryvErrorCode({ id: 'forbidden' }), 'forbidden');
    });
    it('[CAS03] returns undefined for unrelated values', () => {
      assert.equal(pryvErrorCode(new Error('x')), undefined);
      assert.equal(pryvErrorCode(null), undefined);
      assert.equal(pryvErrorCode(undefined), undefined);
    });
  });

  describe('[CASH] happy paths', function () {
    it('[CAS10] no-subPath returns appScope id without any API call', async () => {
      const conn = makeConn(() => { throw new Error('should not be called'); });
      const out = await ensureAppScope(conn, APP_CODE);
      assert.equal(out, EXPECTED_APP_SCOPE);
      assert.equal(conn.calls.length, 0);
    });

    it('[CAS11] subPath provisions sub-scope only (no leaf call)', async () => {
      const conn = makeConn(() => ({ stream: {} }));
      const out = await ensureAppScope(conn, APP_CODE, 'abc123');
      assert.equal(out, EXPECTED_APP_SCOPE + ':abc123');
      assert.equal(conn.calls.length, 1);
      assert.equal(conn.calls[0].method, 'streams.create');
      assert.deepEqual(conn.calls[0].params, {
        id: EXPECTED_APP_SCOPE + ':abc123',
        parentId: EXPECTED_APP_SCOPE,
        name: 'abc123'
      });
    });
  });

  describe('[CAST] tolerated errors', function () {
    it('[CAS22] tolerates item-already-exists on subPath', async () => {
      const conn = makeConn(() => { throw pryvError('item-already-exists'); });
      const out = await ensureAppScope(conn, APP_CODE, 'abc123');
      assert.equal(out, EXPECTED_APP_SCOPE + ':abc123');
      assert.equal(conn.calls.length, 1);
    });
  });

  describe('[CASR] rethrows on unrelated errors', function () {
    it('[CAS31] rethrows forbidden on subPath', async () => {
      const conn = makeConn(() => { throw pryvError('forbidden'); });
      await assert.rejects(
        ensureAppScope(conn, APP_CODE, 'abc123'),
        (e) => e.innerObject?.id === 'forbidden'
      );
    });

    it('[CAS32] rethrows plain Errors with no pryv id', async () => {
      const conn = makeConn(() => { throw new Error('boom'); });
      await assert.rejects(ensureAppScope(conn, APP_CODE, 'abc123'), /boom/);
    });
  });
});
