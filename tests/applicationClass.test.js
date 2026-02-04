const { assert } = require('./test-utils/deps-node');
const { createUserAndPermissions } = require('./test-utils/pryvService');
const HDSLib = require('../js');
const Application = HDSLib.appTemplates.Application;
const { helperNewAppManaging } = require('./test-utils/helpersAppTemplate');

describe('[APAX] Application class', function () {
  this.timeout(5000);
  const baseStreamId = 'application-class';
  const appName = 'application-app';
  let user;
  before(async () => {
    await HDSLib.initHDSModel();
    const initialStreams = [{ id: 'applications', name: 'Applications' }, { id: baseStreamId, name: appName, parentId: 'applications' }];
    const permissionsManager = [{ streamId: baseStreamId, level: 'manage' }];
    user = await createUserAndPermissions(null, permissionsManager, initialStreams, appName);
  });

  describe('[APIX] Application class internal', () => {
    it('[APIS] Application custom settings', async () => {
      class Dummy extends Application {
        get appSettings () {
          return { };
        }
      }
      const appDummy = await Dummy.newFromApiEndpoint(baseStreamId, user.appApiEndpoint, appName);

      const settings = await appDummy.getCustomSettings();
      assert.deepEqual(settings, {});
      const newSettings = { hello: 'Tom', value: 2 };
      const newSettings1 = await appDummy.setCustomSettings(newSettings);
      assert.deepEqual(newSettings, newSettings1);
      const newSettings2 = await appDummy.getCustomSettings();
      assert.deepEqual(newSettings, newSettings2);
      assert.deepEqual(newSettings1, newSettings2);
      assert.equal(newSettings1, newSettings2, 'should be the same object');
      const newSettings3 = await appDummy.getCustomSettings(true);
      assert.deepEqual(newSettings1, newSettings3);
      assert.notEqual(newSettings1, newSettings3, 'should not be the same object');
    });
  });

  describe('[APAE] Application class errors', () => {
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

    it('[APAA] Application name from accessInfo fails in not in settings', () => {
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

    it('[APAB] Application name from accessInfo', async () => {
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
        await Dummy.newFromApiEndpoint('uuuu', user.appApiEndpoint, appName);
        throw new Error('Should throw an error');
      } catch (e) {
        assert.equal(e.message, 'Application with "app" type of access requires "master" token (streamId = "*", level = "manage")');
      }
    });
  });

  describe('[AMGX] AppManagingAccount tests', function () {
    it('[AMGA] getCollectorById returns collector when exists', async () => {
      const testBaseStreamId = 'amga-test';
      const { appManaging } = await helperNewAppManaging(testBaseStreamId, 'test-AMGA');
      const collector = await appManaging.createCollector('Test Collector AMGA');

      const foundCollector = await appManaging.getCollectorById(collector.id);
      assert.ok(foundCollector);
      assert.equal(foundCollector.id, collector.id);
    });

    it('[AMGB] getCollectorById returns undefined when not exists', async () => {
      const testBaseStreamId = 'amgb-test';
      const { appManaging } = await helperNewAppManaging(testBaseStreamId, 'test-AMGB');

      const foundCollector = await appManaging.getCollectorById('non-existent-id');
      assert.equal(foundCollector, undefined);
    });

    it('[AMGC] getCollectors with forceRefresh reloads data', async () => {
      const testBaseStreamId = 'amgc-test';
      const { appManaging } = await helperNewAppManaging(testBaseStreamId, 'test-AMGC');

      const collectors1 = await appManaging.getCollectors();
      assert.equal(collectors1.length, 0);

      await appManaging.createCollector('Test Collector AMGC');
      const collectors2 = await appManaging.getCollectors(true);
      assert.equal(collectors2.length, 1);
    });
  });

  describe('[ACSX] Application setCustomSetting tests', function () {
    it('[ACSA] setCustomSetting adds a key', async () => {
      class Dummy extends Application {
        get appSettings () {
          return { };
        }
      }
      const appDummy = await Dummy.newFromApiEndpoint(baseStreamId, user.appApiEndpoint, appName);

      await appDummy.setCustomSetting('newKey', 'newValue');
      const settings = await appDummy.getCustomSettings();
      assert.equal(settings.newKey, 'newValue');
    });

    it('[ACSB] setCustomSetting with null deletes key', async () => {
      class Dummy extends Application {
        get appSettings () {
          return { };
        }
      }
      const appDummy = await Dummy.newFromApiEndpoint(baseStreamId, user.appApiEndpoint, appName);

      await appDummy.setCustomSetting('keyToDelete', 'value');
      let settings = await appDummy.getCustomSettings();
      assert.equal(settings.keyToDelete, 'value');

      await appDummy.setCustomSetting('keyToDelete', null);
      settings = await appDummy.getCustomSettings();
      assert.equal(settings.keyToDelete, undefined);
    });
  });
});
