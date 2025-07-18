/* eslint-env mocha */
const { assert } = require('./test-utils/deps-node');
const { createUserAndPermissions } = require('./test-utils/pryvService');
const Application = require('../src/appTemplates/Application');

describe('[APAX] Application class', () => {
  const baseStreamId = 'application-class';
  const appName = 'application-app';
  let user;
  before(async () => {
    const initialStreams = [{ id: 'applications', name: 'Applications' }, { id: baseStreamId, name: appName, parentId: 'applications' }];
    const permissionsManager = [{ streamId: baseStreamId, level: 'manage' }];
    user = await createUserAndPermissions(null, permissionsManager, initialStreams, appName);
  });

  it('[APAI] Application extension', async () => {
    class Dummy extends Application { }

    try {
      await Dummy.newFromApiEndpoint(baseStreamId, user.appApiEndpoint, appName);
      throw new Error('Should throw an error');
    } catch (e) {
      assert.equal(e.message, 'appSettings must be implemented');
    }

    try {
      // eslint-disable-next-line no-new
      new Dummy('u', user.appApiEndpoint, appName);
      throw new Error('Should throw an error');
    } catch (e) {
      assert.equal(e.message, 'Missing or too short baseStreamId');
    }
  });

  it('[APAA] Application name form accessInfo fails in not in settings', () => {
    class Dummy extends Application {
      get appSettings () {
        return { };
      }
    }

    try {
      // eslint-disable-next-line no-new
      new Dummy(baseStreamId, user.appApiEndpoint);
      throw new Error('Should throw an error');
    } catch (e) {
      assert.equal(e.message, 'appName must be given unless appSettings.appNameFromAccessInfo = true');
    }
  });

  it('[APAB] Application name form accessInfo', async () => {
    class Dummy2 extends Application {
      get appSettings () {
        return {
          appNameFromAccessInfo: true
        };
      }
    }

    const dummy2 = await Dummy2.newFromApiEndpoint(baseStreamId, user.appApiEndpoint);
    assert.ok(dummy2, 'if appSettings.appNameFromAccessInfo = true appName is not required');
  });

  it('[APAC] Application should throw error if baseStream is not accessible', async () => {
    class Dummy extends Application {
      get appSettings () {
        return { };
      }
    }

    try {
      // eslint-disable-next-line no-new
      await Dummy.newFromApiEndpoint('uuuu', user.appApiEndpoint, appName);
      throw new Error('Should throw an error');
    } catch (e) {
      assert.equal(e.message, 'Application with "app" type of access requires  (streamId = "uuuu", level = "manage") or master access');
    }
  });

  it('[APAD] Application should throw error if personaToken are not explicity allowed', async () => {
    class Dummy extends Application {
      get appSettings () {
        return { };
      }
    }

    try {
      // eslint-disable-next-line no-new
      await Dummy.newFromApiEndpoint('uuuu', user.personalApiEndpoint, appName);
      throw new Error('Should throw an error');
    } catch (e) {
      assert.equal(e.message, 'Application should not use a personal token');
    }
  });

  it('[APAE] Application should throw error if master token not provided and required', async () => {
    class Dummy extends Application {
      get appSettings () {
        return {
          mustBemaster: true
        };
      }
    }

    try {
      // eslint-disable-next-line no-new
      await Dummy.newFromApiEndpoint('uuuu', user.appApiEndpoint, appName);
      throw new Error('Should throw an error');
    } catch (e) {
      assert.equal(e.message, 'Application with "app" type of access requires "master" token (streamId = "*", level = "manage")');
    }
  });
});
