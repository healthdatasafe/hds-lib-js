import { assert } from './test-utils/deps-node.js';
import { loadTemplate, isCustomFieldDeclaration, isExistingStreamRef } from '../ts/appTemplates/loader.ts';

function validTemplate () {
  return {
    id: 'stormm-woman',
    title: { en: 'STORMM' },
    description: { en: 'STORMM women cohort' },
    chat: true,
    sections: [
      { key: 'menstrual', type: 'recurring', name: { en: 'Menstrual' }, customFieldKeys: ['flow'] }
    ],
    customFields: [
      {
        streamId: 'stormm-woman-custom-flow',
        eventType: 'note/txt',
        def: {
          version: 'v1',
          templateId: 'stormm-woman',
          key: 'flow',
          label: { en: 'Menstrual flow' },
          options: ['light', 'medium', 'heavy'],
          section: 'menstrual'
        }
      }
    ],
    existingStreamRefs: [
      { streamId: 'app-system-out', permissions: ['manage'], purpose: 'system-out' },
      { streamId: 'app-system-in', permissions: ['read'], purpose: 'system-in' }
    ]
  };
}

describe('[CFLD] AppTemplate loader', function () {
  describe('[CFLD-OK] valid templates', function () {
    it('[CFLD-OK-1] accepts a fully-specified template', function () {
      const tpl = loadTemplate(validTemplate());
      assert.equal(tpl.id, 'stormm-woman');
      assert.equal(tpl.customFields.length, 1);
      assert.equal(tpl.existingStreamRefs.length, 2);
    });

    it('[CFLD-OK-2] accepts a minimal template (no customFields, no existingStreamRefs)', function () {
      const tpl = loadTemplate({
        id: 'min',
        title: { en: 'min' },
        description: { en: 'min' },
        chat: false,
        sections: []
      });
      assert.equal(tpl.id, 'min');
      assert.equal(tpl.customFields, undefined);
    });

    it('[CFLD-OK-3] accepts a string for localizable text (oneOf)', function () {
      const tpl = loadTemplate({
        id: 'str',
        title: 'String title',
        description: 'String desc',
        chat: false,
        sections: []
      });
      assert.equal(tpl.title, 'String title');
    });
  });

  describe('[CFLD-AJV] schema-level rejection', function () {
    it('[CFLD-AJV-1] rejects missing required field', function () {
      assert.throws(
        () => loadTemplate({ id: 'x', title: { en: 'x' }, description: { en: 'x' }, chat: true /* sections missing */ }),
        /sections/
      );
    });

    it('[CFLD-AJV-2] rejects bad eventType in customFields', function () {
      const t = validTemplate();
      t.customFields[0].eventType = 'temperature/c'; // not in enum
      assert.throws(() => loadTemplate(t), /eventType|enum/);
    });

    it('[CFLD-AJV-3] rejects unknown top-level field', function () {
      const t = validTemplate();
      t.bogus = 'extra';
      assert.throws(() => loadTemplate(t), /must NOT have additional properties|bogus/i);
    });

    it('[CFLD-AJV-4] rejects bad permission level in existingStreamRefs', function () {
      const t = validTemplate();
      t.existingStreamRefs[0].permissions = ['admin'];
      assert.throws(() => loadTemplate(t), /enum|permissions/);
    });

    it('[CFLD-AJV-5] rejects empty permissions array (minItems)', function () {
      const t = validTemplate();
      t.existingStreamRefs[0].permissions = [];
      assert.throws(() => loadTemplate(t), /minItems|permissions/);
    });

    it('[CFLD-AJV-6] rejects bad id pattern', function () {
      const t = validTemplate();
      t.id = 'BAD_ID';
      assert.throws(() => loadTemplate(t), /pattern|id/);
    });
  });

  describe('[CFLD-CF] cross-field rules', function () {
    it('[CFLD-CF-1] rejects customFields[].streamId outside the sandbox', function () {
      const t = validTemplate();
      t.customFields[0].streamId = 'foreign-stream-flow';
      assert.throws(() => loadTemplate(t), /sandbox prefix/i);
    });

    it('[CFLD-CF-2] rejects def.templateId mismatch', function () {
      const t = validTemplate();
      t.customFields[0].def.templateId = 'something-else';
      assert.throws(() => loadTemplate(t), /templateId/);
    });

    it('[CFLD-CF-3] rejects existingStreamRefs[].streamId inside the sandbox', function () {
      const t = validTemplate();
      t.existingStreamRefs[0].streamId = 'stormm-woman-system-out';
      assert.throws(() => loadTemplate(t), /sandbox prefix/i);
    });

    it('[CFLD-CF-4] rejects existingStreamRefs collision with customFields streamId', function () {
      const t = validTemplate();
      t.existingStreamRefs.push({
        streamId: 'stormm-woman-custom-flow', // same as customFields[0]
        permissions: ['read']
      });
      assert.throws(() => loadTemplate(t), /sandbox prefix|mode-2|customFields/i);
    });

    it('[CFLD-CF-5] rejects customFields[].def.section pointing at unknown section key', function () {
      const t = validTemplate();
      t.customFields[0].def.section = 'no-such-section';
      assert.throws(() => loadTemplate(t), /section/);
    });

    it('[CFLD-CF-6] rejects section.customFieldKeys[] pointing at unknown def.key', function () {
      const t = validTemplate();
      t.sections[0].customFieldKeys = ['unknown-key'];
      assert.throws(() => loadTemplate(t), /unknown key|customFieldKeys/);
    });

    it('[CFLD-CF-7] rejects streamId/def.key suffix mismatch', function () {
      const t = validTemplate();
      t.customFields[0].streamId = 'stormm-woman-custom-other';
      // def.key still 'flow' → mismatch
      assert.throws(() => loadTemplate(t), /key|streamId/);
    });
  });

  describe('[CFLD-TG] type guards', function () {
    it('[CFLD-TG-1] isCustomFieldDeclaration', function () {
      assert.equal(isCustomFieldDeclaration(validTemplate().customFields[0]), true);
      assert.equal(isCustomFieldDeclaration({}), false);
      assert.equal(isCustomFieldDeclaration(null), false);
    });

    it('[CFLD-TG-2] isExistingStreamRef', function () {
      assert.equal(isExistingStreamRef({ streamId: 's', permissions: ['read'] }), true);
      assert.equal(isExistingStreamRef({ streamId: 's' }), false);
      assert.equal(isExistingStreamRef(null), false);
    });
  });
});
