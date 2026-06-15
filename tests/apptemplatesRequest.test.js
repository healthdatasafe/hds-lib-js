import { initHDSModel } from '../ts/index.ts';
import { assert } from './test-utils/deps-node.js';
import { CollectorRequest } from '../ts/appTemplates/CollectorRequest.ts';
import { Questionnaire } from '../ts/appTemplates/Questionnaire.ts';

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

  describe('[APRES] CollectorRequest existingStreamRefs (Plan 45)', function () {
    it('[ARES1] should parse existingStreamRefs from content', () => {
      const request = new CollectorRequest({
        existingStreamRefs: [
          { streamId: 'external-stream-a', permissions: ['manage'], purpose: 'example-out' },
          { streamId: 'external-stream-b', permissions: ['read'], purpose: 'example-in' }
        ]
      });
      assert.equal(request.existingStreamRefs.length, 2);
      assert.equal(request.existingStreamRefs[0].streamId, 'external-stream-a');
      assert.deepEqual(request.existingStreamRefs[0].permissions, ['manage']);
      assert.equal(request.existingStreamRefs[1].streamId, 'external-stream-b');
    });

    it('[ARES2] should serialize existingStreamRefs in content', () => {
      const request = new CollectorRequest({});
      request.addExistingStreamRef({ streamId: 'external-stream-a', permissions: ['manage'] });
      assert.ok(request.content.existingStreamRefs);
      assert.equal(request.content.existingStreamRefs.length, 1);
      assert.equal(request.content.existingStreamRefs[0].streamId, 'external-stream-a');
    });

    it('[ARES3] should not serialize existingStreamRefs when empty', () => {
      const request = new CollectorRequest({});
      assert.equal(request.content.existingStreamRefs, undefined);
    });

    it('[ARES4] should reject non-string streamId', () => {
      const request = new CollectorRequest({});
      try {
        request.addExistingStreamRef({ streamId: 123, permissions: ['read'] });
        throw new Error('Should throw error');
      } catch (e) {
        assert.match(e.message, /streamId must be a non-empty string/);
      }
    });

    it('[ARES5] should reject empty permissions array', () => {
      const request = new CollectorRequest({});
      try {
        request.addExistingStreamRef({ streamId: 'external-stream-a', permissions: [] });
        throw new Error('Should throw error');
      } catch (e) {
        assert.match(e.message, /permissions must be a non-empty array/);
      }
    });

    it('[ARES6] should reject invalid permission level', () => {
      const request = new CollectorRequest({});
      try {
        request.addExistingStreamRef({ streamId: 'external-stream-a', permissions: ['admin'] });
        throw new Error('Should throw error');
      } catch (e) {
        assert.match(e.message, /Invalid permission level "admin"/);
      }
    });

    it('[ARES7] should accept all three permission levels', () => {
      const request = new CollectorRequest({});
      request.addExistingStreamRef({ streamId: 's1', permissions: ['read'] });
      request.addExistingStreamRef({ streamId: 's2', permissions: ['manage'] });
      request.addExistingStreamRef({ streamId: 's3', permissions: ['contribute'] });
      assert.equal(request.existingStreamRefs.length, 3);
    });

    it('[ARES8] should round-trip through setContent', () => {
      const r1 = new CollectorRequest({});
      r1.addExistingStreamRef({ streamId: 'external-stream-a', permissions: ['manage'], purpose: 'example' });
      const content1 = r1.content;
      const r2 = new CollectorRequest(content1);
      assert.deepEqual(r2.existingStreamRefs, r1.existingStreamRefs);
    });
  });

  describe('[APRCF] CollectorRequest customFields (Plan 45)', function () {
    function validCf () {
      return {
        streamId: 'stormm-woman-custom-flow',
        eventType: 'note/txt',
        def: {
          version: 'v1',
          templateId: 'stormm-woman',
          key: 'flow',
          label: { en: 'Flow' },
          options: ['light', 'medium', 'heavy']
        }
      };
    }

    it('[ARCF1] should parse customFields from content', () => {
      const request = new CollectorRequest({ customFields: [validCf()] });
      assert.equal(request.customFields.length, 1);
      assert.equal(request.customFields[0].streamId, 'stormm-woman-custom-flow');
      assert.equal(request.customFields[0].eventType, 'note/txt');
      assert.equal(request.customFields[0].def.key, 'flow');
    });

    it('[ARCF2] should serialize customFields in content', () => {
      const request = new CollectorRequest({});
      request.addCustomField(validCf());
      assert.ok(request.content.customFields);
      assert.equal(request.content.customFields.length, 1);
    });

    it('[ARCF3] should not serialize customFields when empty', () => {
      const request = new CollectorRequest({});
      assert.equal(request.content.customFields, undefined);
    });

    it('[ARCF4] should reject streamId outside the def.templateId sandbox', () => {
      const cf = validCf();
      cf.streamId = 'foreign-stream-flow';
      const request = new CollectorRequest({});
      assert.throws(() => request.addCustomField(cf), /sandbox prefix/i);
    });

    it('[ARCF5] should reject unknown eventType', () => {
      const cf = validCf();
      cf.eventType = 'temperature/c';
      const request = new CollectorRequest({});
      assert.throws(() => request.addCustomField(cf), /Invalid customField.eventType/);
    });

    it('[ARCF6] should reject missing def.version', () => {
      const cf = validCf();
      delete cf.def.version;
      const request = new CollectorRequest({});
      assert.throws(() => request.addCustomField(cf), /version/);
    });

    it('[ARCF7] should round-trip through setContent', () => {
      const r1 = new CollectorRequest({});
      r1.addCustomField(validCf());
      const content1 = r1.content;
      const r2 = new CollectorRequest(content1);
      assert.deepEqual(r2.customFields, r1.customFields);
    });

    it('[ARCF8] should preserve optional parentId and name', () => {
      const cf = validCf();
      cf.parentId = 'stormm-woman-custom';
      cf.name = 'Flow';
      const request = new CollectorRequest({});
      request.addCustomField(cf);
      assert.equal(request.customFields[0].parentId, 'stormm-woman-custom');
      assert.equal(request.customFields[0].name, 'Flow');
    });
  });

  describe('[APRQS] CollectorRequest questionnaires (Plan 71)', function () {
    function validQuestion () {
      return {
        label: { en: 'Body weight in past week' },
        itemRef: 'body-weight',
        scope: { type: 'latest', withinDays: 7 }
      };
    }

    it('[APRQS-1] default request has no questionnaires', () => {
      const r = new CollectorRequest({});
      assert.deepEqual(r.questionnaires, []);
      assert.equal(r.content.questionnaires, undefined);
    });

    it('[APRQS-2] addQuestionnaire accepts a Questionnaire instance', () => {
      const q = new Questionnaire({ title: { en: 'Intake' } });
      q.addQuestion('weight-week', validQuestion());
      const r = new CollectorRequest({});
      r.addQuestionnaire(q);
      assert.equal(r.questionnaires.length, 1);
      assert.equal(r.questionnaires[0].title.en, 'Intake');
      assert.equal(r.questionnaires[0].questions['weight-week'].itemRef, 'body-weight');
    });

    it('[APRQS-3] addQuestionnaire accepts a raw content object (validates via Questionnaire)', () => {
      const r = new CollectorRequest({});
      r.addQuestionnaire({
        title: { en: 'From content' },
        questions: { 'weight-week': validQuestion() }
      });
      assert.equal(r.questionnaires.length, 1);
      assert.equal(r.questionnaires[0].title.en, 'From content');
    });

    it('[APRQS-4] addQuestionnaire rejects invalid question keys', () => {
      const r = new CollectorRequest({});
      assert.throws(() => r.addQuestionnaire({
        questions: { 'has:colon': validQuestion() }
      }), /Pryv path grammar/);
    });

    it('[APRQS-5] addQuestionnaire rejects an empty questionnaire (no questions)', () => {
      const r = new CollectorRequest({});
      assert.throws(() => r.addQuestionnaire({}), /at least one question/);
    });

    it('[APRQS-6] getQuestionnaire returns a fresh Questionnaire wrapping the stored entry', () => {
      const r = new CollectorRequest({});
      r.addQuestionnaire({ questions: { 'weight-week': validQuestion() } });
      const q = r.getQuestionnaire(0);
      assert.ok(q instanceof Questionnaire);
      assert.deepEqual(q.questionKeys, ['weight-week']);
    });

    it('[APRQS-7] removeQuestionnaire splices the entry', () => {
      const r = new CollectorRequest({});
      r.addQuestionnaire({ questions: { a: validQuestion() } });
      r.addQuestionnaire({ questions: { b: validQuestion() } });
      assert.equal(r.removeQuestionnaire(0), true);
      assert.equal(r.questionnaires.length, 1);
      assert.equal(Object.keys(r.questionnaires[0].questions)[0], 'b');
      assert.equal(r.removeQuestionnaire(42), false);
    });

    it('[APRQS-8] content.questionnaires only present when non-empty', () => {
      const r = new CollectorRequest({});
      r.addQuestionnaire({ questions: { 'weight-week': validQuestion() } });
      assert.ok(Array.isArray(r.content.questionnaires));
      assert.equal(r.content.questionnaires.length, 1);
      r.removeQuestionnaire(0);
      assert.equal(r.content.questionnaires, undefined);
    });

    it('[APRQS-9] round-trips through setContent', () => {
      const r1 = new CollectorRequest({});
      r1.addQuestionnaire({
        title: { en: 'Roundtrip' },
        questions: { 'weight-week': validQuestion() }
      });
      const content = r1.content;
      const r2 = new CollectorRequest(content);
      assert.equal(r2.questionnaires.length, 1);
      assert.equal(r2.questionnaires[0].title.en, 'Roundtrip');
      assert.equal(r2.questionnaires[0].questions['weight-week'].itemRef, 'body-weight');
    });

    it('[APRQS-10] setContent rejects non-array questionnaires field', () => {
      assert.throws(
        () => new CollectorRequest({ questionnaires: { wrong: 'shape' } }),
        /must be an array/
      );
    });

    it('[APRQS-11] coexists with sections + customFields + questionnaires in one request', () => {
      const r = new CollectorRequest({});
      r.title = { en: 'Mixed' };
      const sec = r.createSection('s1', 'permanent');
      sec.setName({ en: 'Section 1' });
      sec.addItemKeys(['body-weight']);
      r.addQuestionnaire({
        title: { en: 'Bundled Q' },
        questions: { 'weight-week': validQuestion() }
      });
      const c = r.content;
      assert.equal(c.sections.length, 1);
      assert.equal(c.questionnaires.length, 1);
      // Round-trip survives the mix
      const r2 = new CollectorRequest(c);
      assert.equal(r2.sections.length, 1);
      assert.equal(r2.questionnaires.length, 1);
    });
  });
});
