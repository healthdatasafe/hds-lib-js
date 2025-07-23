# HDS JAVASCRIPT LIBRARY

Generic toolkit for server and web applications.

1. Manages global settings for the lib (servers, localization, logger)
2. Extends orginal Pryv's JS lib to fit HDS needs
3. Based on [HDS data model](https://github.com/healthdatasafe/data-model-draft?tab=readme-ov-file#hds-data-model-drafting-space) exposes methods to facilitate app development.
  - load data model and exposes it as a singleton
  - retrieve definitions 
  - provides helper for stream creation and authorizations requests
4. Provide app templates to create new applications for  
  - Requesting and managing consents - And collecting data
  - Approving requests and sharing data
5. Other tools to facilitate app developments


## Components 

### settings

#### settings.setServiceInfoURL(url)
Set the default service for `HDSModel` and `HDSService`

#### settings.setPreferredLocales(Array of locales)
Change the order of pereferred localization codes

### HDSService
Is an extension of `pryv.Service` which uses the default service set with `settings.setServiceInfoURL(url)``

### pryv
Patched version of [pryv's javacript library](https://github.com/pryv/lib-js) including supports for [Socket.io](https://github.com/pryv/lib-js/tree/master/components/pryv-socket.io) and [Monitors](https://github.com/pryv/lib-js/tree/master/components/pryv-monitor)

#### pryv.Connection.apiOne(method, params, expectedKey)
One liner call to pryv api based on `connection.api()``

#### pryv.Connection.revoke()
Helper to revoke current connection

### localizeText (alias "l")
Handles localization of text. The choice of locales can be set with `settings.setPreferredLocales()`

### HDSModel

an instance of HDSModel loads the definitions from a json file, usually `https://model.datasafe.dev/pack.json`. This may be overridden with:

**Load your own model**

```javascript
const model = new HDSLib.HDSModel('https://model.datasafe.dev/pack.json');
await model.load();
```

**Per service auto loading.** (preferred way)
0. (Optional) You may set the defaultService info of the lib with  `HDSLib.setServiceInfoURL()`.
1. Initialize model singleton once with `await HDSLib.initHDSModel()`
2. Use model from `HDSLib.model`

#### HDSModel.ItemDef

An `ItemDef` is an object representation of the items from the data Model

- **itemDef.key**: (string) a unique identifier, for example `body-weight`
- **itemDef.data**: (Object) raw data for this item from [HDS data model](https://github.com/healthdatasafe/data-model-draft?tab=readme-ov-file#hds-data-model-drafting-space)
- **itemDef.label**: (string) localized `item.data.label`
- **itemDef.description**: (string) localized `item.data.description`
- **itemDef.eventTypes**: (Array) of supported eventTypes

#### model.itemDefs
Tools to retrieve itemDefinitons

##### model.itemDefs.forKey()
retrieve an itemDef with its key

```javascript
const weight = model.itemDefs.forKey('body-weight');
weight.streamId; // => 'body-weight'
weight.eventTypes; // => ['mass/kg', 'mass/lb']
```

##### model.itemDefs.forKey()
```javascript
// retrieve an itemDef from an event
const anEvent = {
  streamIds: ['body-weight', 'dummy'],
  type: 'mass/kg'
};
const itemDef = model.itemsDefs.forEvent(anEvent);
itemDef.key // => 'body-weight'
```

#### HDSModel.Streams

##### model.streams.getNecessaryListForItems(itemKeys, params)
get the list of streams to be created to store these items

**params**
- **nameProperty**: (string) can be set to 'name' (default), 'defaultName' or 'none' => if you want nothing
- **knowExistingStreamsIds**: (Array of strings) Array of known existing streams' ids

```javascript
const itemKeys = [
  'profile-name',
  'profile-date-of-birth',
  'body-vulva-mucus-stretch',
  'profile-surname'
];
const streamsToBeCreated = model.streams.getNecessaryListForItems(itemKeys);
```

##### model.streams.getDataById(streamId)
retrieve model data related to this stream

##### model.streams.getParentsIds(streamId)
retrieve order list of parents up to this streamId


#### HDSModel.Authorizations
Helpers to generate authorizations from itemKeys 

##### model.authorizations.forItemKeys(itemKeys, options);
get the authorization needed to manipulate a set of items

**options** (all optional)
- **defaultLevel**: (string, default = 'name' ) -  one of'read', 'manage', 'contribue', 'writeOnly'
- **includeDefaultName** (boolean, default = true) - if false does not add defaultNames for streams
- **preRequest** (Array of AuthorizationRequestItem) you may specify a custom set or authorizations

```javascript 
const itemKeys = [
    'body-vulva-mucus-inspect',
    'profile-name',
    'profile-date-of-birth',
    'body-vulva-mucus-stretch',
    'profile-surname'
];
const options = {
  preRequest: [ // optional, will be considered in the request
    { streamId: 'profile' },
    { streamId: 'app-test', defaultName: 'App test', level: 'write' }
  ]
};
const authorizationSet = model.authorizations.forItemKeys(itemKeys, options);
// the following object is the result
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
```

### AppTemplates

App templates based on HDS Model, provide frameworks to build applications for HDS.

- **AppManagingAccount**: App which manages Collectors. A "Collector" handles a "Request" and set of "Responses". => With access to some HDS data from other accounts.
- **AppClientAccount**: Handles requests from `AppManagingAccount` and corresponding responses (agree, refuse, revoke).

Details and examples for theses App templates can be found in [AppTemplates.md]


### toolkit
Misc. tools 

#### toolkit.StreamsAutoCreate
helper to be attached to a `Connection` to facilitate auto creation of streams when needed.

Exemple:
```javascript
// done at initialization of connection (a pryv.Connection)
toolkit.StreamsAutoCreate.attachToConnection(connection)

// later
await connection.streamsAutoCreate.ensureExistsForItems(['body-weight', 'profile-name']);
```

## Usage Browser 

```html
<head>
    <script src="../docs/hds-lib.js"></script>
    <script>
      HDSLib.settings.setServiceInfoURL('https://demo.datasafe.dev/reg/service/info');
      HDSLib.settings.setPreferredLocales(['fr', 'en']); // ordered

      // init model in async code
      (async () => {
        await HDSLib.initHDSModel(); // need just one
        // from now on an in all your code you use HDSLib.model 

        // you may create new HDSService with:
        const service = new HDSService();

      })();
    </script>
</head>
```

# Dev

## Build 

`npm run build` publish the code in `./docs`

## Tests 

## Node
- all tests: `npm run test`
- specific test: `npm run test -- --grep=<string>`
- coverage: `npm run test:coverage`

## Browser
Test suite is accessible in `docs/` 
run `npx backloop.dev ./docs` and open `https://whatever.backloop.dev:4443/tests.html`



