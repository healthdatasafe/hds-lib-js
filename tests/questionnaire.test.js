import { initHDSModel } from '../ts/index.ts';
import { assert } from './test-utils/deps-node.js';
import { Questionnaire } from '../ts/appTemplates/Questionnaire.ts';

describe('[QSTX] Questionnaire (Plan 71)', function () {
  this.timeout(8000);

  before(async () => {
    await initHDSModel();
  });

  function validQuestionDef () {
    return {
      label: { en: 'Did you take Progesterone in your life?' },
      itemRef: 'medication-intake-coded',
      params: { drug: { codes: [{ system: 'ATC', code: 'G03DA04' }] } },
      scope: { type: 'ever' },
      subField: {
        type: 'select-segmented',
        label: { en: 'Trimester' },
        options: [
          { value: 'T1', label: { en: 'T1' } },
          { value: 'T2', label: { en: 'T2' } }
        ]
      }
    };
  }

  describe('[QST-CTOR] construction + question keys', function () {
    it('[QST-CTOR-1] empty constructor produces a blank questionnaire', () => {
      const q = new Questionnaire();
      assert.equal(q.title, null);
      assert.equal(q.description, null);
      assert.deepEqual(q.questionKeys, []);
    });

    it('[QST-CTOR-2] addQuestion stores a valid question', () => {
      const q = new Questionnaire();
      q.addQuestion('progesterone-life', validQuestionDef());
      assert.deepEqual(q.questionKeys, ['progesterone-life']);
      assert.equal(q.getQuestion('progesterone-life').itemRef, 'medication-intake-coded');
    });

    it('[QST-CTOR-3] adding the same key twice throws', () => {
      const q = new Questionnaire();
      q.addQuestion('weight-week', { label: { en: 'Weight' }, itemRef: 'body-weight', scope: { type: 'latest', withinDays: 7 } });
      try {
        q.addQuestion('weight-week', { label: { en: 'Weight again' }, itemRef: 'body-weight', scope: { type: 'ever' } });
        throw new Error('should have thrown');
      } catch (e) {
        assert.match(e.message, /already has a question/);
      }
    });

    it('[QST-CTOR-4] rejects keys with colon (Pryv path grammar)', () => {
      const q = new Questionnaire();
      try {
        q.addQuestion('has:colon', validQuestionDef());
        throw new Error('should have thrown');
      } catch (e) {
        assert.match(e.message, /Pryv path grammar/);
      }
    });

    it('[QST-CTOR-5] rejects keys with dot', () => {
      const q = new Questionnaire();
      try {
        q.addQuestion('has.dot', validQuestionDef());
        throw new Error('should have thrown');
      } catch (e) {
        assert.match(e.message, /Pryv path grammar/);
      }
    });

    it('[QST-CTOR-6] rejects empty key', () => {
      const q = new Questionnaire();
      try {
        q.addQuestion('', validQuestionDef());
        throw new Error('should have thrown');
      } catch (e) {
        assert.match(e.message, /non-empty string/);
      }
    });

    it('[QST-CTOR-7] removeQuestion removes and returns true', () => {
      const q = new Questionnaire();
      q.addQuestion('weight-week', { label: { en: 'Weight' }, itemRef: 'body-weight', scope: { type: 'ever' } });
      assert.equal(q.removeQuestion('weight-week'), true);
      assert.equal(q.removeQuestion('weight-week'), false);
    });
  });

  describe('[QST-VAL] question definition validation', function () {
    it('[QST-VAL-1] missing label throws', () => {
      const q = new Questionnaire();
      const def = validQuestionDef();
      delete def.label;
      try {
        q.addQuestion('key1', def);
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /missing 'label'/); }
    });

    it('[QST-VAL-2] missing itemRef throws', () => {
      const q = new Questionnaire();
      const def = validQuestionDef();
      delete def.itemRef;
      try {
        q.addQuestion('key1', def);
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /missing 'itemRef'/); }
    });

    it('[QST-VAL-3] missing scope throws', () => {
      const q = new Questionnaire();
      const def = validQuestionDef();
      delete def.scope;
      try {
        q.addQuestion('key1', def);
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /missing 'scope'/); }
    });

    it('[QST-VAL-4] scope.type ever does NOT accept withinDays', () => {
      const q = new Questionnaire();
      try {
        q.addQuestion('key1', { label: { en: 'X' }, itemRef: 'body-weight', scope: { type: 'ever', withinDays: 7 } });
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /must not carry extra fields/); }
    });

    it('[QST-VAL-5] scope.type window requires withinDays > 0', () => {
      const q = new Questionnaire();
      try {
        q.addQuestion('key1', { label: { en: 'X' }, itemRef: 'body-weight', scope: { type: 'window' } });
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /positive number/); }
      try {
        q.addQuestion('key2', { label: { en: 'X' }, itemRef: 'body-weight', scope: { type: 'window', withinDays: 0 } });
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /positive number/); }
    });

    it('[QST-VAL-6] unknown scope.type throws', () => {
      const q = new Questionnaire();
      try {
        q.addQuestion('key1', { label: { en: 'X' }, itemRef: 'body-weight', scope: { type: 'range', from: '2026-01-01', to: '2026-06-15' } });
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /not recognized/); }
    });

    it('[QST-VAL-7] subField with unknown type throws', () => {
      const q = new Questionnaire();
      const def = validQuestionDef();
      def.subField = { type: 'dropdown' };
      try {
        q.addQuestion('key1', def);
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /select-segmented/); }
    });
  });

  describe('[QST-SER] serialization to request event content', function () {
    it('[QST-SER-1] requires at least one question', () => {
      const q = new Questionnaire();
      try {
        q.toRequestEventContent();
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /at least one question/); }
    });

    it('[QST-SER-2] produces a payload that matches the request schema shape', () => {
      const q = new Questionnaire({ title: { en: 'Pregnancy intake' } });
      q.addQuestion('progesterone-life', validQuestionDef());
      q.addQuestion('weight-week', { label: { en: 'Weight' }, itemRef: 'body-weight', scope: { type: 'latest', withinDays: 7 } });
      const content = q.toRequestEventContent();
      assert.deepEqual(Object.keys(content).sort(), ['questions', 'title']);
      assert.equal(content.title.en, 'Pregnancy intake');
      assert.deepEqual(Object.keys(content.questions).sort(), ['progesterone-life', 'weight-week']);
      assert.equal(content.questions['weight-week'].scope.withinDays, 7);
    });

    it('[QST-SER-3] roundtrips through fromRequestEvent', () => {
      const q1 = new Questionnaire();
      q1.addQuestion('weight-week', { label: { en: 'Weight' }, itemRef: 'body-weight', scope: { type: 'latest', withinDays: 7 } });
      const requestEvent = { content: q1.toRequestEventContent() };
      const q2 = Questionnaire.fromRequestEvent(requestEvent);
      assert.deepEqual(q2.questionKeys, ['weight-week']);
      assert.equal(q2.getQuestion('weight-week').scope.withinDays, 7);
    });

    it('[QST-SER-4] fromRequestEvent rejects an event with no content', () => {
      try {
        Questionnaire.fromRequestEvent({});
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /no content/); }
    });

    it('[QST-SER-5] makeRequestEvent builds a ready-to-write event payload', () => {
      const ev = Questionnaire.makeRequestEvent(
        { questions: { 'weight-week': { label: { en: 'Weight' }, itemRef: 'body-weight', scope: { type: 'latest', withinDays: 7 } } } },
        ['questionnaire-out'],
        1735689600
      );
      assert.equal(ev.type, 'questionnaire/request-v1');
      assert.deepEqual(ev.streamIds, ['questionnaire-out']);
      assert.equal(ev.time, 1735689600);
      assert.equal(ev.content.questions['weight-week'].itemRef, 'body-weight');
    });

    it('[QST-SER-6] makeRequestEvent defaults time to now (seconds)', () => {
      const before = Math.floor(Date.now() / 1000);
      const ev = Questionnaire.makeRequestEvent(
        { questions: { 'weight-week': { label: { en: 'Weight' }, itemRef: 'body-weight', scope: { type: 'ever' } } } },
        ['s']
      );
      assert.ok(ev.time >= before);
      assert.ok(ev.time <= Math.floor(Date.now() / 1000) + 1);
    });

    it('[QST-SER-7] makeRequestEvent rejects empty streamIds', () => {
      try {
        Questionnaire.makeRequestEvent(
          { questions: { x: { label: { en: 'x' }, itemRef: 'body-weight', scope: { type: 'ever' } } } },
          []
        );
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /non-empty array/); }
    });

    it('[QST-SER-8] makeRequestEvent re-validates content (rejects bad keys)', () => {
      try {
        Questionnaire.makeRequestEvent(
          { questions: { 'has:colon': { label: { en: 'x' }, itemRef: 'body-weight', scope: { type: 'ever' } } } },
          ['s']
        );
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /Pryv path grammar/); }
    });
  });

  describe('[QST-WRB] writeBundled (Plan 71 E1)', function () {
    function mockConnection () {
      const calls = [];
      const conn = {
        calls,
        async api (batch) {
          calls.push(batch);
          return batch.map((b, i) => ({ event: { id: `evt-${i}`, ...b.params } }));
        }
      };
      return conn;
    }

    it('[QST-WRB-1] no bundled questionnaires → no API call, empty result', async () => {
      const conn = mockConnection();
      const out = await Questionnaire.writeBundled(conn, { questionnaires: [] }, ['s']);
      assert.deepEqual(out, []);
      assert.equal(conn.calls.length, 0);
    });

    it('[QST-WRB-2] writes one events.create per bundled questionnaire', async () => {
      const conn = mockConnection();
      const req = {
        questionnaires: [
          { title: { en: 'Q1' }, questions: { a: { label: { en: 'A' }, itemRef: 'body-weight', scope: { type: 'ever' } } } },
          { title: { en: 'Q2' }, questions: { b: { label: { en: 'B' }, itemRef: 'body-weight', scope: { type: 'ever' } } } }
        ]
      };
      const out = await Questionnaire.writeBundled(conn, req, ['s'], { timeSeconds: 1735689600 });
      assert.equal(conn.calls.length, 1);
      const batch = conn.calls[0];
      assert.equal(batch.length, 2);
      assert.equal(batch[0].method, 'events.create');
      assert.equal(batch[0].params.type, 'questionnaire/request-v1');
      assert.deepEqual(batch[0].params.streamIds, ['s']);
      assert.equal(batch[0].params.time, 1735689600);
      assert.equal(batch[0].params.content.title.en, 'Q1');
      assert.equal(batch[1].params.content.title.en, 'Q2');
      assert.equal(out.length, 2);
    });

    it('[QST-WRB-3] empty streamIds throws', async () => {
      try {
        await Questionnaire.writeBundled({ api: async () => [] }, { questionnaires: [] }, []);
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /non-empty array/); }
    });

    it('[QST-WRB-4] re-validates each questionnaire content via makeRequestEvent', async () => {
      const conn = mockConnection();
      const req = {
        questionnaires: [
          { questions: { 'has:colon': { label: { en: 'x' }, itemRef: 'body-weight', scope: { type: 'ever' } } } }
        ]
      };
      try {
        await Questionnaire.writeBundled(conn, req, ['s']);
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /Pryv path grammar/); }
    });
  });

  describe('[QST-ANS] buildAnswerEvent helper', function () {
    it('[QST-ANS-1] builds content + clientData mirror', () => {
      const out = Questionnaire.buildAnswerEvent('evt-q-abc', {
        'progesterone-life': { status: 'answered', references: ['evt-prog-1'], qualifier: 'T2' },
        'weight-week': { status: 'answered', references: ['evt-bw-1'] },
        'cycle-recent': { status: 'no' },
        sensitive: { status: 'declined', reason: 'privacy' },
        forgotten: { status: 'unknown' }
      });
      assert.equal(out.content.requestEventId, 'evt-q-abc');
      assert.equal(out.content.answers['progesterone-life'].qualifier, 'T2');
      assert.equal(out.content.answers.sensitive.reason, 'privacy');
      // clientData.related includes request + all referenced ids
      assert.deepEqual(Object.keys(out.clientData.related).sort(), ['evt-bw-1', 'evt-prog-1', 'evt-q-abc']);
    });

    it('[QST-ANS-2] empty requestEventId throws', () => {
      try {
        Questionnaire.buildAnswerEvent('', { k: { status: 'no' } });
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /non-empty string/); }
    });

    it('[QST-ANS-3] answered without references throws', () => {
      try {
        Questionnaire.buildAnswerEvent('evt-q-abc', { k: { status: 'answered', references: [] } });
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /non-empty 'references'/); }
    });

    it('[QST-ANS-4] no/unknown/declined carrying references throws', () => {
      try {
        Questionnaire.buildAnswerEvent('evt-q-abc', { k: { status: 'no', references: ['evt-x'] } });
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /must not carry 'references'/); }
    });

    it('[QST-ANS-5] knownQuestionKeys enforces membership', () => {
      try {
        Questionnaire.buildAnswerEvent('evt-q-abc',
          { 'not-a-question': { status: 'no' } },
          ['weight-week']);
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /not a question on the request/); }
    });

    it('[QST-ANS-6] declined.reason as non-string throws', () => {
      try {
        Questionnaire.buildAnswerEvent('evt-q-abc', { k: { status: 'declined', reason: 42 } });
        throw new Error('should throw');
      } catch (e) { assert.match(e.message, /reason must be a string/); }
    });
  });
});
