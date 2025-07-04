# HDS JAVASCRIPT LIBRARY

Generic toolkit for server and web applications.

- [ ] 

## Usage 

### Model

#### Load

```javascript
const model = new HDSLib.HDSModel('https://model.datasafe.dev/pack.json');
await model.load();
```

#### ItemDef

An `ItemDef` is an object representation of the items from the data Model

```javascript
// retrieve an itemDef by it's key
const weight = model.itemDefs.forKey('body-weight');
weight.streamId; // => 'body-weight'
weight.eventTypes; // => ['mass/kg', 'mass/lb']
```

```javascript
// retrieve an itemDef from an event
const anEvent = {
  streamIds: ['body-weight', 'dummy'],
  type: 'mass/kg'
};
const itemDef = model.itemsDefs.forEvent(anEvent);
itemDef.key // => 'body-weight'
```

#### Streams

```javascript
// get the list of streams to be created to store these items
const itemKeys = [
  'profile-name',
  'profile-date-of-birth',
  'body-vulva-mucus-stretch',
  'profile-surname'
];
const streamsToBeCreated = model.streams.getNecessaryListForItemKeys(itemKeys);
```

#### Authorizations

```javascript
// get the authorization needed to manipulate a set of items
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

Some of the functionalities will be moved from the lib



### Browser 

```html
<head>
    <script src="../docs/hds-lib.js"></script>
    <script>
      model = new HDSLib.HDSModel();
    </script>
</head>
```