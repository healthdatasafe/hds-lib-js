import { initHDSModel } from '../ts/index.ts';
import { helperNewAppManaging } from './test-utils/helpersAppTemplate.js';
import { assert } from './test-utils/deps-node.js';
import { CollectorRequest } from '../ts/appTemplates/CollectorRequest.ts';

describe('[APRX] appTemplates Requests', function () {
  this.timeout(8000);

  before(async () => {
    await initHDSModel();
  });

  describe('[AREX] CollectorRequest error cases', function () {
    it('[AREA] should throw error for unknown features', () => {
      const request = new CollectorRequest({});
      try {
        request.setContent({
          features: { unknownFeature: { setting: 'value' } }
        });
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'Found unkown features');
      }
    });

    it('[AREB] should throw error for invalid chat type', () => {
      const request = new CollectorRequest({});
      try {
        request.addChatFeature({ type: 'invalid' });
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'Invalid chat type');
      }
    });

    it('[AREC] should throw error for duplicate section key', () => {
      const request = new CollectorRequest({});
      request.createSection('test-section', 'permanent');
      try {
        request.createSection('test-section', 'recurring');
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'Section with key: test-section already exists');
      }
    });

    it('[ARED] should throw error for invalid version', () => {
      const request = new CollectorRequest({});
      try {
        request.setContent({ version: 99 });
        throw new Error('Should throw error');
      } catch (e) {
        assert.equal(e.message, 'Invalid CollectorRequest content version: 99');
      }
    });

    it('[AREE] should handle permissionsExtra in content', () => {
      const request = new CollectorRequest({});
      request.setContent({
        permissionsExtra: [
          { streamId: 'test-stream', level: 'read' }
        ]
      });
      assert.equal(request.permissionsExtra.length, 1);
      assert.equal(request.permissionsExtra[0].streamId, 'test-stream');
    });

    it('[AREF] addChatFeature with usernames type', () => {
      const request = new CollectorRequest({});
      request.addChatFeature({ type: 'usernames' });
      assert.deepEqual(request.features.chat, { type: 'usernames' });
      assert.equal(request.hasChatFeature, true);
    });
  });

  describe('[ARSO] Section ordering and customizations', function () {
    it('[ARSA] moveItemKey reorders items within a section', () => {
      const request = new CollectorRequest({});
      const section = request.createSection('test', 'permanent');
      section.addItemKeys(['profile-name', 'profile-surname', 'profile-sex']);
      section.moveItemKey('profile-sex', 0);
      assert.deepEqual(section.itemKeys, ['profile-sex', 'profile-name', 'profile-surname']);
    });

    it('[ARSB] removeItemKey removes item from section', () => {
      const request = new CollectorRequest({});
      const section = request.createSection('test', 'permanent');
      section.addItemKeys(['profile-name', 'profile-surname', 'profile-sex']);
      section.removeItemKey('profile-surname');
      assert.deepEqual(section.itemKeys, ['profile-name', 'profile-sex']);
    });

    it('[ARSC] moveSection reorders sections', () => {
      const request = new CollectorRequest({});
      request.createSection('a', 'permanent');
      request.createSection('b', 'recurring');
      request.createSection('c', 'permanent');
      request.moveSection('c', 0);
      assert.deepEqual(request.sections.map(s => s.key), ['c', 'a', 'b']);
    });

    it('[ARSD] removeSection removes a section', () => {
      const request = new CollectorRequest({});
      request.createSection('a', 'permanent');
      request.createSection('b', 'recurring');
      request.removeSection('a');
      assert.equal(request.sections.length, 1);
      assert.equal(request.sections[0].key, 'b');
    });

    it('[ARSE] itemCustomizations set/get', () => {
      const request = new CollectorRequest({});
      const section = request.createSection('test', 'permanent');
      section.addItemKeys(['profile-name', 'profile-surname']);
      section.setItemCustomization('profile-name', { placeholder: 'Enter name' });
      assert.deepEqual(section.getItemCustomization('profile-name'), { placeholder: 'Enter name' });
      assert.equal(section.getItemCustomization('profile-surname'), undefined);
    });

    it('[ARSF] itemCustomizations serialization round-trip', () => {
      const request = new CollectorRequest({});
      const section = request.createSection('test', 'permanent');
      section.addItemKeys(['profile-name', 'profile-surname']);
      section.setItemCustomization('profile-name', { placeholder: 'Enter name' });

      const content = request.content;
      assert.deepEqual(content.sections[0].itemCustomizations, {
        'profile-name': { placeholder: 'Enter name' }
      });

      // Round-trip: reload from serialized content
      const request2 = new CollectorRequest(content);
      const section2 = request2.getSectionByKey('test');
      assert.deepEqual(section2.getItemCustomization('profile-name'), { placeholder: 'Enter name' });
    });

    it('[ARSG] getData omits itemCustomizations when empty', () => {
      const request = new CollectorRequest({});
      const section = request.createSection('test', 'permanent');
      section.addItemKeys(['profile-name']);
      const data = section.getData();
      assert.equal(data.itemCustomizations, undefined);
    });

    it('[ARSH] moveItemKey throws for unknown key', () => {
      const request = new CollectorRequest({});
      const section = request.createSection('test', 'permanent');
      section.addItemKeys(['profile-name']);
      assert.throws(() => section.moveItemKey('unknown', 0), /not found/);
    });

    it('[ARSI] moveSection throws for unknown key', () => {
      const request = new CollectorRequest({});
      request.createSection('a', 'permanent');
      assert.throws(() => request.moveSection('unknown', 0), /not found/);
    });

    it('[ARSJ] removeSection throws for unknown key', () => {
      const request = new CollectorRequest({});
      request.createSection('a', 'permanent');
      assert.throws(() => request.removeSection('unknown'), /not found/);
    });
  });

  it('[APRC] Compute a simple request', async () => {
    const baseStreamId = 'aprc';
    const { appManaging } = await helperNewAppManaging(baseStreamId, 'test-APRC');
    const newCollector = await appManaging.createCollector('Invite test APCV');

    const request = newCollector.request;
    request.appId = 'dr-form';
    request.appUrl = 'https://xxx.yyy';
    request.title = { en: 'My title' };
    request.requesterName = 'Username APRC';
    request.description = { en: 'Short Description' };
    request.consent = { en: 'Short Consent' };
    request.addPermissionExtra({ streamId: 'profile' });
    request.addPermissionExtra({ streamId: 'fertility' });

    const sectionA = request.createSection('profile', 'permanent');
    sectionA.setNameLocal('en', 'A');
    sectionA.addItemKeys([
      'profile-name',
      'profile-surname',
      'profile-sex',
      'family-children-count',
      'fertility-miscarriages-count'
    ]);

    const sectionB = request.createSection('history', 'recurring');
    sectionB.setNameLocal('en', 'B');
    sectionB.addItemKeys([
      'fertility-ttc-tta',
      'body-weight'
    ]);
    // build permissions needed
    request.buildPermissions();
    const requestContent = request.content;
    assert.ok(requestContent.id.startsWith(baseStreamId), 'id should start with the basetreamid of the manager');

    const expectedContent = {
      version: 1,
      title: { en: 'My title' },
      consent: { en: 'Short Consent' },
      description: { en: 'Short Description' },
      requester: { name: 'Username APRC' },
      features: {},
      permissionsExtra: [
        { streamId: 'profile', defaultName: 'Profile', level: 'read' },
        {
          streamId: 'fertility',
          defaultName: 'Fertility',
          level: 'read'
        }
      ],
      permissions: [
        { streamId: 'profile', defaultName: 'Profile', level: 'read' },
        { streamId: 'fertility', defaultName: 'Fertility', level: 'read' },
        {
          streamId: 'family-children',
          defaultName: 'Children',
          level: 'read'
        },
        {
          streamId: 'body-weight',
          defaultName: 'Body Weight',
          level: 'read'
        }
      ],
      app: { id: 'dr-form', url: 'https://xxx.yyy', data: {} },
      sections: [
        {
          key: 'profile',
          type: 'permanent',
          name: { en: 'A' },
          itemKeys: [
            'profile-name',
            'profile-surname',
            'profile-sex',
            'family-children-count',
            'fertility-miscarriages-count'
          ]
        },
        {
          key: 'history',
          type: 'recurring',
          name: { en: 'B' },
          itemKeys: ['fertility-ttc-tta', 'body-weight']
        }
      ],
      id: requestContent.id
    };
    assert.deepEqual(requestContent, expectedContent);
  });

  it('[APRD] A request with chat', async () => {
    const baseStreamId = 'aprd';
    const { appManaging } = await helperNewAppManaging(baseStreamId, 'test-APRD');
    const newCollector = await appManaging.createCollector('Invite test APRD');

    const request = newCollector.request;
    request.appId = 'dr-form';
    request.appUrl = 'https://xxx.yyy';
    request.title = { en: 'My title' };
    request.requesterName = 'Username APRD';
    request.description = { en: 'Short Description' };
    request.consent = { en: 'Short Consent' };
    request.addPermissionExtra({ streamId: 'profile' });
    request.addChatFeature();

    const sectionA = request.createSection('profile', 'permanent');
    sectionA.setNameLocal('en', 'A');
    sectionA.addItemKeys([
      'profile-name',
      'profile-surname'
    ]);

    // build permissions needed
    request.buildPermissions();

    const requestContent = request.content;

    assert.ok(requestContent.id.startsWith(baseStreamId), 'id should start with the basetreamid of the manager');

    const expectedContent = {
      version: 1,
      title: { en: 'My title' },
      consent: { en: 'Short Consent' },
      description: { en: 'Short Description' },
      requester: { name: 'Username APRD' },
      features: { chat: { type: 'user' } },
      permissionsExtra: [{ streamId: 'profile', defaultName: 'Profile', level: 'read' }],
      permissions: [{ streamId: 'profile', defaultName: 'Profile', level: 'read' }],
      app: { id: 'dr-form', url: 'https://xxx.yyy', data: {} },
      sections: [
        {
          key: 'profile',
          type: 'permanent',
          name: { en: 'A' },
          itemKeys: ['profile-name', 'profile-surname']
        }
      ],
      id: requestContent.id
    };
    assert.deepEqual(requestContent, expectedContent);
  });
});
