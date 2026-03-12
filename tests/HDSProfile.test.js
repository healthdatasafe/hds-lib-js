import { assert } from './test-utils/deps-node.js';
import { HDSProfile, PROFILE_FIELDS, pryv } from '../ts/index.ts';
import { createUser, init as initPryvService } from './test-utils/pryvService.js';

describe('[PRFL] PROFILE_FIELDS', () => {
  it('[PRFL1] has expected keys', () => {
    assert.strictEqual(PROFILE_FIELDS.displayName.eventType, 'contact/display-name');
    assert.strictEqual(PROFILE_FIELDS.displayName.streamId, 'profile-display-name');
    assert.strictEqual(PROFILE_FIELDS.avatar.eventType, 'picture/*');
    assert.strictEqual(PROFILE_FIELDS.avatar.streamId, 'profile-avatar');
    assert.strictEqual(PROFILE_FIELDS.name.eventType, 'contact/name');
    assert.strictEqual(PROFILE_FIELDS.surname.eventType, 'contact/surname');
    assert.strictEqual(PROFILE_FIELDS.dateOfBirth.eventType, 'date/iso-8601');
    assert.strictEqual(PROFILE_FIELDS.sex.eventType, 'attributes/biological-sex');
    assert.strictEqual(PROFILE_FIELDS.country.eventType, 'contact/country');
  });
});

describe('[HDSP] HDSProfile (dev API)', function () {
  this.timeout(15000);

  let connection;

  before(async () => {
    await initPryvService();
    const user = await createUser();
    connection = new pryv.Connection(user.apiEndpoint);

    // Create profile stream tree
    await connection.api([
      { method: 'streams.create', params: { id: 'profile', name: 'Profile' } },
      { method: 'streams.create', params: { id: 'profile-display-name', name: 'Display Name', parentId: 'profile' } },
      { method: 'streams.create', params: { id: 'profile-avatar', name: 'Avatar', parentId: 'profile' } },
      { method: 'streams.create', params: { id: 'profile-name', name: 'Name', parentId: 'profile' } },
      { method: 'streams.create', params: { id: 'profile-date-of-birth', name: 'Date of Birth', parentId: 'profile' } },
      { method: 'streams.create', params: { id: 'profile-sex', name: 'Sex', parentId: 'profile' } },
      { method: 'streams.create', params: { id: 'profile-address', name: 'Address', parentId: 'profile' } },
    ]);
  });

  afterEach(() => {
    HDSProfile.unhook();
  });

  describe('[HDSP-U] unhook / defaults', () => {
    it('[HDSP-U1] isHooked is false by default', () => {
      assert.strictEqual(HDSProfile.isHooked, false);
    });

    it('[HDSP-U2] get returns null for all fields when not hooked', () => {
      assert.strictEqual(HDSProfile.get('displayName'), null);
      assert.strictEqual(HDSProfile.get('avatar'), null);
      assert.strictEqual(HDSProfile.get('name'), null);
      assert.strictEqual(HDSProfile.get('surname'), null);
      assert.strictEqual(HDSProfile.get('dateOfBirth'), null);
      assert.strictEqual(HDSProfile.get('sex'), null);
      assert.strictEqual(HDSProfile.get('country'), null);
    });

    it('[HDSP-U3] getAll returns all defaults', () => {
      const all = HDSProfile.getAll();
      for (const key of Object.keys(PROFILE_FIELDS)) {
        assert.strictEqual(all[key], null, `${key} should be null`);
      }
    });

    it('[HDSP-U4] unhook resets after hook', async () => {
      await HDSProfile.hookToConnection(connection);
      assert.strictEqual(HDSProfile.isHooked, true);
      HDSProfile.unhook();
      assert.strictEqual(HDSProfile.isHooked, false);
      assert.strictEqual(HDSProfile.get('displayName'), null);
    });
  });

  describe('[HDSP-H] hookToConnection', () => {
    it('[HDSP-H1] hooks to empty profile', async () => {
      await HDSProfile.hookToConnection(connection);
      assert.strictEqual(HDSProfile.isHooked, true);
      assert.strictEqual(HDSProfile.get('displayName'), null);
      assert.strictEqual(HDSProfile.get('name'), null);
      assert.strictEqual(HDSProfile.get('avatar'), null);
    });

    it('[HDSP-H2] ignores events outside profile streams', async () => {
      // Create a contact/display-name event in a non-profile stream
      await connection.api([
        { method: 'streams.create', params: { id: 'other-stream', name: 'Other' } },
        { method: 'events.create', params: { streamIds: ['other-stream'], type: 'contact/display-name', content: 'Wrong' } },
      ]);

      await HDSProfile.hookToConnection(connection);
      // Should not pick up the event from other-stream
      assert.strictEqual(HDSProfile.get('displayName'), null);
    });
  });

  describe('[HDSP-S] set profile fields', () => {
    it('[HDSP-S1] throws when not hooked', async () => {
      await assert.rejects(
        () => HDSProfile.set('displayName', 'Alice'),
        /hookToConnection/
      );
    });

    it('[HDSP-S2] set displayName creates and persists', async () => {
      await HDSProfile.hookToConnection(connection);

      await HDSProfile.set('displayName', 'Dr. Smith');
      assert.strictEqual(HDSProfile.get('displayName'), 'Dr. Smith');

      // Verify persistence
      await HDSProfile.reload();
      assert.strictEqual(HDSProfile.get('displayName'), 'Dr. Smith');
    });

    it('[HDSP-S3] update displayName modifies existing', async () => {
      await HDSProfile.hookToConnection(connection);
      assert.strictEqual(HDSProfile.get('displayName'), 'Dr. Smith');

      await HDSProfile.set('displayName', 'Professor Smith');
      assert.strictEqual(HDSProfile.get('displayName'), 'Professor Smith');

      await HDSProfile.reload();
      assert.strictEqual(HDSProfile.get('displayName'), 'Professor Smith');
    });

    it('[HDSP-S4] set all profile fields', async () => {
      await HDSProfile.hookToConnection(connection);

      await HDSProfile.set('name', 'John');
      await HDSProfile.set('surname', 'Smith');
      await HDSProfile.set('dateOfBirth', '1985-03-15');
      await HDSProfile.set('sex', 'male');
      await HDSProfile.set('country', 'Switzerland');

      assert.strictEqual(HDSProfile.get('name'), 'John');
      assert.strictEqual(HDSProfile.get('surname'), 'Smith');
      assert.strictEqual(HDSProfile.get('dateOfBirth'), '1985-03-15');
      assert.strictEqual(HDSProfile.get('sex'), 'male');
      assert.strictEqual(HDSProfile.get('country'), 'Switzerland');

      // Verify all persist
      await HDSProfile.reload();
      assert.strictEqual(HDSProfile.get('name'), 'John');
      assert.strictEqual(HDSProfile.get('surname'), 'Smith');
      assert.strictEqual(HDSProfile.get('dateOfBirth'), '1985-03-15');
      assert.strictEqual(HDSProfile.get('sex'), 'male');
      assert.strictEqual(HDSProfile.get('country'), 'Switzerland');
    });

    it('[HDSP-S5] getAll returns all set values', async () => {
      await HDSProfile.hookToConnection(connection);
      const all = HDSProfile.getAll();
      assert.strictEqual(all.displayName, 'Professor Smith');
      assert.strictEqual(all.name, 'John');
      assert.strictEqual(all.surname, 'Smith');
      assert.strictEqual(all.dateOfBirth, '1985-03-15');
      assert.strictEqual(all.sex, 'male');
      assert.strictEqual(all.country, 'Switzerland');
    });
  });

  describe('[HDSP-A] avatar', () => {
    it('[HDSP-A1] setAvatarFromFile throws when not hooked', async () => {
      const blob = new Blob(['test'], { type: 'image/png' });
      await assert.rejects(
        () => HDSProfile.setAvatarFromFile(blob, 'test.png'),
        /hookToConnection/
      );
    });

    it('[HDSP-A2] setAvatarFromDataUrl throws when not hooked', async () => {
      await assert.rejects(
        () => HDSProfile.setAvatarFromDataUrl('data:image/png;base64,abc'),
        /hookToConnection/
      );
    });

    it('[HDSP-A3] setAvatarFromDataUrl creates and reads back', async () => {
      await HDSProfile.hookToConnection(connection);
      assert.strictEqual(HDSProfile.get('avatar'), null);

      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      await HDSProfile.setAvatarFromDataUrl(dataUrl);
      assert.strictEqual(HDSProfile.get('avatar'), dataUrl);
      assert.strictEqual(HDSProfile.getAvatarUrl(), dataUrl);

      // Verify persistence
      await HDSProfile.reload();
      assert.strictEqual(HDSProfile.get('avatar'), dataUrl);
    });

    it('[HDSP-A4] setAvatarFromDataUrl replaces existing', async () => {
      await HDSProfile.hookToConnection(connection);
      assert.ok(HDSProfile.get('avatar') !== null, 'Should have avatar from previous test');

      const newDataUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      await HDSProfile.setAvatarFromDataUrl(newDataUrl);
      assert.strictEqual(HDSProfile.get('avatar'), newDataUrl);

      await HDSProfile.reload();
      assert.strictEqual(HDSProfile.get('avatar'), newDataUrl);
    });

    it('[HDSP-A5] setAvatarFromFile creates event with attachment', async () => {
      await HDSProfile.hookToConnection(connection);

      // Create a small PNG blob (1x1 red pixel)
      const pngBytes = Uint8Array.from(atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
      ), c => c.charCodeAt(0));
      const blob = new Blob([pngBytes], { type: 'image/png' });

      await HDSProfile.setAvatarFromFile(blob, 'red-pixel.png');

      const avatarUrl = HDSProfile.getAvatarUrl();
      assert.ok(avatarUrl, 'Should have avatar URL');
      assert.ok(avatarUrl.includes('/events/'), 'Should be an attachment URL');
      assert.ok(avatarUrl.includes('red-pixel.png'), 'Should contain filename');
      assert.ok(avatarUrl.includes('auth='), 'Should contain auth token');

      // Verify persistence
      await HDSProfile.reload();
      const reloadedUrl = HDSProfile.getAvatarUrl();
      assert.ok(reloadedUrl, 'Should still have avatar after reload');
      assert.ok(reloadedUrl.includes('/events/'), 'Should still be attachment URL');
    });

    it('[HDSP-A6] setAvatarFromFile replaces previous avatar', async () => {
      await HDSProfile.hookToConnection(connection);
      const previousUrl = HDSProfile.getAvatarUrl();
      assert.ok(previousUrl, 'Should have avatar from previous test');

      const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4E, 0x47])], { type: 'image/png' });
      await HDSProfile.setAvatarFromFile(blob, 'new-avatar.png');

      const newUrl = HDSProfile.getAvatarUrl();
      assert.ok(newUrl, 'Should have new avatar URL');
      assert.ok(newUrl.includes('new-avatar.png'), 'Should contain new filename');
      assert.notStrictEqual(newUrl, previousUrl, 'URL should differ from previous');
    });
  });

  describe('[HDSP-R] reload', () => {
    it('[HDSP-R1] reload reflects server state', async () => {
      await HDSProfile.hookToConnection(connection);
      const before = HDSProfile.get('displayName');

      // Modify directly via API (bypassing HDSProfile)
      const events = await connection.apiOne('events.get', {
        streams: ['profile-display-name'],
        types: ['contact/display-name'],
        limit: 1
      }, 'events');
      assert.ok(events.length > 0, 'Should have displayName event');
      await connection.apiOne('events.update', {
        id: events[0].id,
        update: { content: 'Changed Externally' }
      }, 'event');

      // HDSProfile still has old value
      assert.strictEqual(HDSProfile.get('displayName'), before);

      // After reload, picks up the change
      await HDSProfile.reload();
      assert.strictEqual(HDSProfile.get('displayName'), 'Changed Externally');
    });
  });

  describe('[HDSP-X] readFromConnection', () => {
    let sharedConnection;

    before(async () => {
      // Create a shared access with profile read permission
      const access = await connection.apiOne('accesses.create', {
        name: 'profile-reader',
        type: 'shared',
        permissions: [{ streamId: 'profile', level: 'read' }]
      }, 'access');
      sharedConnection = new pryv.Connection(access.apiEndpoint);
    });

    it('[HDSP-X1] reads profile via shared connection', async () => {
      const profile = await HDSProfile.readFromConnection(sharedConnection);
      assert.strictEqual(profile.displayName, 'Changed Externally');
      assert.strictEqual(profile.name, 'John');
      assert.strictEqual(profile.surname, 'Smith');
      assert.strictEqual(profile.sex, 'male');
    });

    it('[HDSP-X2] reads avatar via shared connection', async () => {
      const profile = await HDSProfile.readFromConnection(sharedConnection);
      assert.ok(profile.avatar, 'Should have avatar URL');
      assert.ok(profile.avatar.includes('/events/'), 'Avatar should be an attachment URL');
      assert.ok(profile.avatar.includes('auth='), 'Avatar URL should contain auth token');
    });

    it('[HDSP-X3] does not affect singleton state', async () => {
      HDSProfile.unhook();
      assert.strictEqual(HDSProfile.isHooked, false);

      const profile = await HDSProfile.readFromConnection(sharedConnection);
      assert.ok(profile.displayName, 'Should read profile');
      assert.strictEqual(HDSProfile.isHooked, false, 'Singleton should remain unhooked');
      assert.strictEqual(HDSProfile.get('displayName'), null, 'Singleton values should be unchanged');
    });

    it('[HDSP-X4] returns defaults when connection has no profile access', async () => {
      // Create a restricted access without any profile permission
      await connection.api([
        { method: 'streams.create', params: { id: 'unrelated-stream', name: 'Unrelated' } },
      ]);
      const restrictedAccess = await connection.apiOne('accesses.create', {
        name: 'no-profile',
        type: 'shared',
        permissions: [{ streamId: 'unrelated-stream', level: 'read' }]
      }, 'access');
      const restrictedConn = new pryv.Connection(restrictedAccess.apiEndpoint);

      const profile = await HDSProfile.readFromConnection(restrictedConn);
      assert.strictEqual(profile.displayName, null, 'Should not see displayName');
      assert.strictEqual(profile.name, null, 'Should not see name');
      assert.strictEqual(profile.surname, null, 'Should not see surname');
      assert.strictEqual(profile.avatar, null, 'Should not see avatar');
    });
  });
});
