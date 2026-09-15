import { assert } from './test-utils/deps-node.js';

import HDSLib, { delegation, pryv } from '../ts/index.ts';

/**
 * The delegation client reaches consumers through hds-lib for one reason: a
 * consumer that did `import Pryv from 'pryv'` alongside hds-lib would hold a
 * SECOND, UNPATCHED pryv instance, with neither @pryv/monitor nor
 * @pryv/socket.io applied. `Delegation.openControlled()` builds a Connection
 * from whatever `pryv` it is handed, so that is exactly where an unpatched
 * instance would leak in and silently cost the caller socket support.
 *
 * These tests pin the seam rather than the upstream library's behaviour.
 */
describe('[DLGX] Delegation re-export', () => {
  it('[DLG1] is exported both named and on the default export', async () => {
    assert.ok(delegation != null, 'named export missing');
    assert.ok(HDSLib.delegation != null, 'default-export member missing');
    assert.strictEqual(HDSLib.delegation, delegation, 'the two exports must be the same object');
  });

  it('[DLG2] carries the client surface the account app depends on', async () => {
    assert.equal(typeof delegation.Delegation, 'function', 'Delegation class missing');
    assert.equal(typeof delegation.Delegation.fromConnection, 'function', 'fromConnection missing');
    assert.equal(typeof delegation.DelegationError, 'function', 'DelegationError missing');
    assert.ok(delegation.errorIds != null, 'errorIds catalogue missing');
    // The one error id the UI must react to rather than swallow: detaching a
    // delegate is refused unless the caller holds a genuine login.
    assert.strictEqual(
      delegation.errorIds.GENUINE_LOGIN_REQUIRED,
      'delegation-genuine-login-required'
    );
    assert.strictEqual(delegation.STATUS.INVITE, 'invite');
    assert.strictEqual(delegation.STATUS.ACTIVE, 'active');
    assert.strictEqual(delegation.STATUS.STALE, 'stale');
  });

  it('[DLG3] binds to a connection and keeps it', async () => {
    const fakeConnection = { apiEndpoint: 'https://token@user.example.com/' };
    const d = delegation.Delegation.fromConnection(fakeConnection, { pryv });
    assert.strictEqual(d.connection, fakeConnection);
  });

  it('[DLG4] the pryv handed to it is the PATCHED instance, not a bare one', async () => {
    // socket.io and monitor are applied to the module object at import time by
    // patchedPryv.ts. If a consumer ever passes a directly-imported `pryv`,
    // these members are absent — which is the whole failure this seam prevents.
    assert.equal(typeof pryv.Connection, 'function', 'patched pryv lost Connection');
    assert.ok(pryv.Browser != null, 'patched pryv lost Browser');
    const proto = pryv.Connection.prototype;
    assert.ok(
      typeof proto.addSocketIO === 'function' || 'socket' in proto || proto.socketIO !== undefined,
      'the socket.io plugin does not appear to be applied to the pryv we re-export'
    );
  });
});
