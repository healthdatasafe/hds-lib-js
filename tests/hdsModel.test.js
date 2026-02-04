const { assert } = require('./test-utils/deps-node');

const modelURL = 'https://model.datasafe.dev/pack.json';

const { HDSModel } = require('../js/');
const { resetPreferredLocales, setPreferredLocales } = require('../js/localizeText');

describe('[MODX] Model', () => {
  let model;
  before(async () => {
    model = new HDSModel(modelURL);
    await model.load();
  });

  it('[MODL] Load model for item with multiple types: body-weight', async () => {
    const modelLoad = new HDSModel(modelURL);
    await modelLoad.load();
    const itemDef = modelLoad.itemsDefs.forKey('body-weight');
    assert.equal(itemDef.data.streamId, 'body-weight');
    assert.deepEqual(itemDef.eventTypes, ['mass/kg', 'mass/lb']);
    assert.equal(itemDef.key, 'body-weight');
  });

  it('[MODM] Load model for item with single type: body-vulva-wetness-feeling', async () => {
    const modelLoad = new HDSModel(modelURL);
    await modelLoad.load();
    const itemDef = modelLoad.itemsDefs.forKey('body-vulva-wetness-feeling');
    assert.deepEqual(itemDef.eventTypes, ['ratio/generic']);
  });

  it('[MODN] get All itemsDef', async () => {
    const modelLoad = new HDSModel(modelURL);
    await modelLoad.load();
    const itemDefs = modelLoad.itemsDefs.getAll();
    assert.ok(itemDefs.length > 0);
    for (const itemDef of itemDefs) {
      assert.ok(itemDef.key);
    }
  });

  // ---------- itemDef ------------ //
  describe('[MDVX] itemDef methods', function () {
    it('[MDVA] eventTemplate() returns event template with streamId and type', async () => {
      const itemDef = model.itemsDefs.forKey('body-weight');
      const template = itemDef.eventTemplate();
      assert.ok(template.streamIds);
      assert.ok(template.type);
      assert.deepEqual(template.streamIds, ['body-weight']);
      assert.equal(template.type, 'mass/kg'); // first eventType
    });

    it('[MDVB] eventTemplate() returns correct streamId from data', async () => {
      const itemDef = model.itemsDefs.forKey('profile-name');
      const template = itemDef.eventTemplate();
      assert.deepEqual(template.streamIds, ['profile-name']);
    });
  });

  // ---------- items ------------ //
  describe('[MOLX] items localization', function () {
    afterEach(() => {
      // make sure locales are set back to default after each test
      resetPreferredLocales();
    });
    it('[MOLL] Label  & Description properties are localized', () => {
      const itemDef = model.itemsDefs.forKey('body-weight');
      assert.equal(itemDef.label, 'Body weight');
      assert.equal(itemDef.description, 'Measured body weight');
      setPreferredLocales(['fr']);
      assert.equal(itemDef.label, 'Poids corporel');
      assert.equal(itemDef.description, 'Poids corporel mesuré');
    });
  });

  describe('[MOIX] items', function () {
    it('[MOIE] Throw error if itemsDefs.forKey not found', async () => {
      try {
        model.itemsDefs.forKey('dummy');
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Cannot find item definition with key: dummy');
      }
    });

    it('[MOIN] Return null with throwErrorIfNotFound = false', async () => {
      const notFound = model.itemsDefs.forKey('dummy', false);
      assert.equal(notFound, null);
    });
  });
  // ---------- events ------------ //

  describe('[MOEX] events', function () {
    it('[MODS] Get definition from event data', async () => {
      const fakeEvent = {
        streamIds: ['body-weight', 'dummy'],
        type: 'mass/kg'
      };
      const itemDef = model.itemsDefs.forEvent(fakeEvent);
      assert.equal(itemDef.data.streamId, 'body-weight');
      assert.deepEqual(itemDef.eventTypes, ['mass/kg', 'mass/lb']);
    });

    it('[MOEE] Throw error if itemsDefs.forEvent not found', async () => {
      const fakeEvent = {
        streamIds: ['dummy'],
        type: 'mass/kg'
      };
      try {
        model.itemsDefs.forEvent(fakeEvent);
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Cannot find definition for event: {"streamIds":["dummy"],"type":"mass/kg"}');
      }
    });

    it('[MOEN] Return if itemsDefs.forEvent not found and throwErrorIfNotFound = false', async () => {
      const fakeEvent = {
        streamIds: ['dummy'],
        type: 'mass/kg'
      };
      const notFound = model.itemsDefs.forEvent(fakeEvent, false);
      assert.equal(notFound, null);
    });

    it('[MOED] Throw error if itemsDefs.forEvent finds duplicates', async () => {
      const fakeEvent = {
        streamIds: ['body-vulva-wetness-feeling', 'body-vulva-mucus-stretch'],
        type: 'ratio/generic'
      };
      try {
        model.itemsDefs.forEvent(fakeEvent);
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Found multiple matching definitions "body-vulva-wetness-feeling, body-vulva-mucus-stretch" for event: {"streamIds":["body-vulva-wetness-feeling","body-vulva-mucus-stretch"],"type":"ratio/generic"}');
      }
    });
  });

  // ----------- event types ----------- //
  describe('[MOTX] eventTypes', function () {
    it('[MOTA] event type definition', async () => {
      const eventTypeDev = model.eventTypes.getEventTypeDefinition('temperature/c');
      assert.deepEqual(eventTypeDev, { description: 'Celsius', type: 'number' });
    });

    it('[MOTB] extra definition', async () => {
      const eventTypeExtra = model.eventTypes.getEventTypeExtra('temperature/c');
      assert.deepEqual(eventTypeExtra, { name: { en: 'Degrees Celsius', fr: 'Degrés Celsius' }, symbol: '°C' });
    });

    it('[MOTC] symbol exists', async () => {
      const eventTypeSymbol = model.eventTypes.getEventTypeSymbol('temperature/c');
      assert.deepEqual(eventTypeSymbol, '°C');
    });

    it('[MOTD] symbol not exists', async () => {
      const eventTypeSymbol = model.eventTypes.getEventTypeSymbol('audio/attached');
      assert.deepEqual(eventTypeSymbol, null);
    });
  });

  // ---------- streams ------------ //

  describe('[MOSX] streams', function () {
    it('[MOSB] Streams Data by Id', async () => {
      const streamData = model.streams.getDataById('fertility-cycles-start');
      assert.equal(streamData.parentId, 'fertility-cycles');
    });

    it('[MOSE] Streams Data by Id, Throw Error if not found', async () => {
      try {
        model.streams.getDataById('dummy');
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Stream with id: "dummy" not found');
      }
    });

    it('[MOSP] Streams Data parents', async () => {
      const streamParentIds = model.streams.getParentsIds('fertility-cycles-start');
      assert.deepEqual(streamParentIds, ['fertility', 'fertility-cycles']);
    });

    it('[MOSC] Necessary streams to handle itemKeys', async () => {
      const itemKeys = [
        'body-vulva-mucus-inspect',
        'profile-name',
        'profile-date-of-birth',
        'body-vulva-mucus-stretch',
        'profile-surname'
      ];
      const streamsToBeCreated = model.streams.getNecessaryListForItems(itemKeys);
      // keeè a list of streams check that necessary streams exists
      const streamIdsToCheck = {};
      for (const itemKey of itemKeys) {
        const streamId = model.itemsDefs.forKey(itemKey).data.streamId;
        streamIdsToCheck[streamId] = true;
      }
      const parentExist = {}; // list of parent id in order
      for (const stream of streamsToBeCreated) {
        assert.ok(!!stream.id, 'stream should have an id');
        assert.ok(!!stream.name, `stream "${stream.id}" should have a name`);
        delete streamIdsToCheck[stream.id];
        if (stream.parentId) assert.ok(!!parentExist[stream.parentId], `stream "${stream.id}" should have parent "${stream.parentId}" already in list`);
        parentExist[stream.id] = true;
      }
      assert.deepEqual(Object.keys(streamIdsToCheck), []);
    });

    it('[MOSD] Necessary streams to handle itemKey, with existing streamIds', async () => {
      const itemKeys = [
        'body-vulva-mucus-inspect',
        'profile-name',
        'profile-date-of-birth',
        'body-vulva-mucus-stretch',
        'profile-surname'
      ];
      const knowExistingStreamsIds = ['body-vulva', 'profile', 'applications'];
      const streamsToBeCreated = model.streams.getNecessaryListForItems(itemKeys, { knowExistingStreamsIds });
      assert.deepEqual(streamsToBeCreated, [
        {
          id: 'body-vulva-mucus',
          name: 'Vulva Mucus',
          parentId: 'body-vulva'
        },
        {
          id: 'body-vulva-mucus-inspect',
          name: 'Vulva Mucus Inspect',
          parentId: 'body-vulva-mucus'
        },
        { id: 'profile-name', name: 'Name', parentId: 'profile' },
        {
          id: 'profile-date-of-birth',
          name: 'Date of Birth',
          parentId: 'profile'
        },
        {
          id: 'body-vulva-mucus-stretch',
          name: 'Vulva Mucus Stretch',
          parentId: 'body-vulva-mucus'
        }
      ]);
    });

    it('[MOSE] Necessary streams to handle itemKey, with nameProperty: defaultName', async () => {
      const itemKeys = [
        'profile-name'
      ];
      const streamsToBeCreated = model.streams.getNecessaryListForItems(itemKeys, { nameProperty: 'defaultName' });
      assert.deepEqual(streamsToBeCreated, [
        { id: 'profile', parentId: null, defaultName: 'Profile' },
        { id: 'profile-name', parentId: 'profile', defaultName: 'Name' }
      ]);
    });

    it('[MOSF] Necessary streams to handle itemKey, with nameProperty: none', async () => {
      const itemKeys = [
        'profile-name'
      ];
      const streamsToBeCreated = model.streams.getNecessaryListForItems(itemKeys, { nameProperty: 'none' });
      assert.deepEqual(streamsToBeCreated, [
        { id: 'profile', parentId: null },
        { id: 'profile-name', parentId: 'profile' }
      ]);
    });
  });

  // ------------------- authorizations ------------------ //

  describe('[MOAX] authorizations', function () {
    it('[MOAA] Get Authorizations from items', async () => {
      const itemKeys = [
        'body-vulva-mucus-inspect',
        'profile-name',
        'profile-date-of-birth',
        'body-vulva-mucus-stretch',
        'profile-surname'
      ];
      const authorizationSet = model.authorizations.forItemKeys(itemKeys);
      const expected = [
        {
          streamId: 'body-vulva-mucus-inspect',
          defaultName: 'Vulva Mucus Inspect',
          level: 'read'
        },
        { streamId: 'profile-name', defaultName: 'Name', level: 'read' },
        {
          streamId: 'profile-date-of-birth',
          defaultName: 'Date of Birth',
          level: 'read'
        },
        {
          streamId: 'body-vulva-mucus-stretch',
          defaultName: 'Vulva Mucus Stretch',
          level: 'read'
        }
      ];
      assert.deepEqual(authorizationSet, expected);
    });

    it('[MOAL] Get Authorizations from items override correctly authorized level', async () => {
      const itemKeys = ['profile-name'];
      const options = { preRequest: [{ streamId: 'profile', level: 'contribute' }] };
      const authorizationSet = model.authorizations.forItemKeys(itemKeys, options);
      const expected = [
        { streamId: 'profile', level: 'contribute', defaultName: 'Profile' }
      ];
      assert.deepEqual(authorizationSet, expected);
    });

    it('[MOAV] Get Authorizations from items override correctly authorized level', async () => {
      const itemKeys = ['profile-name'];
      const options = {
        defaultLevel: 'manage',
        preRequest: [{ streamId: 'profile', level: 'read' }]
      };
      const authorizationSet = model.authorizations.forItemKeys(itemKeys, options);
      const expected = [
        { streamId: 'profile', level: 'read', defaultName: 'Profile' },
        { streamId: 'profile-name', defaultName: 'Name', level: 'manage' }
      ];
      assert.deepEqual(authorizationSet, expected);
    });

    it('[MOAM] Get Authorizations from items mix correctly authorized level', async () => {
      const levels = [{ request: 'manage', expect: 'manage' }, { request: 'contribute', expect: 'contribute' }, { request: 'writeOnly', expect: 'contribute' }];
      for (const level of levels) {
        const itemKeys = ['profile-name'];
        const options = {
          preRequest: [{ streamId: 'profile-name', level: level.request }]
        };
        const authorizationSet = model.authorizations.forItemKeys(itemKeys, options);
        const expected = [
          { streamId: 'profile-name', level: level.expect, defaultName: 'Name' }
        ];
        assert.deepEqual(authorizationSet, expected);
      }
    });

    it('[MOAO] Get Authorizations from items with overrides', async () => {
      const itemKeys = [
        'body-vulva-mucus-inspect',
        'profile-name',
        'profile-date-of-birth',
        'body-vulva-mucus-stretch',
        'profile-surname'
      ];
      const options = {
        preRequest: [
          { streamId: 'profile' },
          { streamId: 'app-test', defaultName: 'App test', level: 'write' }
        ]
      };
      const authorizationSet = model.authorizations.forItemKeys(itemKeys, options);
      const expected = [
        { streamId: 'profile', defaultName: 'Profile', level: 'read' },
        { streamId: 'app-test', defaultName: 'App test', level: 'write' },
        {
          streamId: 'body-vulva-mucus-inspect',
          defaultName: 'Vulva Mucus Inspect',
          level: 'read'
        },
        {
          streamId: 'body-vulva-mucus-stretch',
          defaultName: 'Vulva Mucus Stretch',
          level: 'read'
        }
      ];
      assert.deepEqual(authorizationSet, expected);
    });

    it('[MOAW] Get Authorizations from items with overrides and no defaultName', async () => {
      const itemKeys = [
        'body-vulva-mucus-inspect',
        'profile-name',
        'profile-date-of-birth',
        'body-vulva-mucus-stretch',
        'profile-surname'
      ];
      const options = {
        preRequest: [
          { streamId: 'profile' },
          { streamId: 'app-test', level: 'write' }
        ],
        includeDefaultName: false
      };
      const authorizationSet = model.authorizations.forItemKeys(itemKeys, options);
      const expected = [
        { streamId: 'profile', level: 'read' },
        { streamId: 'app-test', level: 'write' },
        {
          streamId: 'body-vulva-mucus-inspect',
          level: 'read'
        },
        {
          streamId: 'body-vulva-mucus-stretch',
          level: 'read'
        }
      ];
      assert.deepEqual(authorizationSet, expected);
    });

    it('[MOAZ] Get authorization throw error on unknown streamId with no defaultName', async () => {
      const itemKeys = [
        'profile-surname'
      ];
      const options = {
        preRequest: [
          { streamId: 'dummy', defaultName: 'Dummy', level: 'read' }
        ],
        includeDefaultName: false
      };
      try {
        model.authorizations.forItemKeys(itemKeys, options);
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Do not include defaultName when not included explicitely on {"streamId":"dummy","defaultName":"Dummy","level":"read"}');
      }
    });

    it('[MOAE] Throw error when defaultName is in one of of the "pre" but not desired ', async () => {
      const itemKeys = [
        'profile-surname'
      ];
      const options = {
        preRequest: [
          { streamIdXXXX: 'dummy', level: 'read' }
        ]
      };
      try {
        model.authorizations.forItemKeys(itemKeys, options);
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'Missing streamId in options.preRequest item: {"streamIdXXXX":"dummy","level":"read"}');
      }
    });

    it('[MOAR] Get authorization throw error on unknown streamId with no defaultName', async () => {
      const itemKeys = [
        'profile-surname'
      ];
      const options = {
        preRequest: [
          { streamId: 'dummy', level: 'read' }
        ]
      };
      try {
        model.authorizations.forItemKeys(itemKeys, options);
        throw new Error('Should throw Error');
      } catch (e) {
        assert.equal(e.message, 'No "defaultName" in options.preRequest item: {"streamId":"dummy","level":"read"} and cannot find matching streams in default list');
      }
    });
  });
});
