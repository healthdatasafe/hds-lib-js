import { assert } from './test-utils/deps-node.js';
import { ensureAppScope, pryvErrorCode } from '../ts/cmc/appScope.ts';

/**
 * Unit tests for the Plan 60 B1 hoisted `cmcAppScope.ensureAppScope`.
 *
 * The helper wraps two `streams.create` calls (appScope + optional subPath)
 * and tolerates idempotency / permission errors against the `:_cmc:apps`
 * plugin-managed namespace. See `ts/cmc/appScope.ts` for the rationale.
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
    it('[CAS10] provisions appScope only (no subPath)', async () => {
      const conn = makeConn(() => ({ stream: { id: EXPECTED_APP_SCOPE } }));
      const out = await ensureAppScope(conn, APP_CODE);
      assert.equal(out, EXPECTED_APP_SCOPE);
      assert.equal(conn.calls.length, 1);
      assert.equal(conn.calls[0].method, 'streams.create');
      assert.deepEqual(conn.calls[0].params, {
        id: EXPECTED_APP_SCOPE,
        parentId: ':_cmc:apps',
        name: APP_CODE
      });
    });

    it('[CAS11] provisions appScope + subPath', async () => {
      const conn = makeConn(() => ({ stream: {} }));
      const out = await ensureAppScope(conn, APP_CODE, 'abc123');
      assert.equal(out, EXPECTED_APP_SCOPE + ':abc123');
      assert.equal(conn.calls.length, 2);
      assert.deepEqual(conn.calls[1].params, {
        id: EXPECTED_APP_SCOPE + ':abc123',
        parentId: EXPECTED_APP_SCOPE,
        name: 'abc123'
      });
    });
  });

  describe('[CAST] tolerated errors', function () {
    it('[CAS20] tolerates item-already-exists on appScope', async () => {
      const conn = makeConn(() => { throw pryvError('item-already-exists'); });
      const out = await ensureAppScope(conn, APP_CODE);
      assert.equal(out, EXPECTED_APP_SCOPE);
    });

    it('[CAS21] tolerates forbidden on appScope (OAuth-narrow access)', async () => {
      const conn = makeConn(() => { throw pryvError('forbidden'); });
      const out = await ensureAppScope(conn, APP_CODE);
      assert.equal(out, EXPECTED_APP_SCOPE);
    });

    it('[CAS22] tolerates item-already-exists on subPath', async () => {
      const conn = makeConn((method, params, idx) => {
        if (idx === 0) return { stream: {} };
        throw pryvError('item-already-exists');
      });
      const out = await ensureAppScope(conn, APP_CODE, 'abc123');
      assert.equal(out, EXPECTED_APP_SCOPE + ':abc123');
      assert.equal(conn.calls.length, 2);
    });
  });

  describe('[CASR] rethrows on unrelated errors', function () {
    it('[CAS30] rethrows non-tolerated pryv error on appScope', async () => {
      const conn = makeConn(() => { throw pryvError('invalid-parameters-format'); });
      await assert.rejects(
        ensureAppScope(conn, APP_CODE),
        (e) => e.innerObject?.id === 'invalid-parameters-format'
      );
    });

    it('[CAS31] rethrows forbidden on subPath (only appScope tolerates forbidden)', async () => {
      const conn = makeConn((method, params, idx) => {
        if (idx === 0) return { stream: {} };
        throw pryvError('forbidden');
      });
      await assert.rejects(
        ensureAppScope(conn, APP_CODE, 'abc123'),
        (e) => e.innerObject?.id === 'forbidden'
      );
    });

    it('[CAS32] rethrows plain Errors with no pryv id', async () => {
      const conn = makeConn(() => { throw new Error('boom'); });
      await assert.rejects(ensureAppScope(conn, APP_CODE), /boom/);
    });
  });
});
