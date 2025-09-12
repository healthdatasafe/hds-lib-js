This document is part of [Generic toolkit for server and web applications](README.md).

# APPLICATION TEMPLATES


App templates based on HDS Model, provide frameworks to build applications for HDS.

- **AppManagingAccount**: App which manages Collectors. A "Collector" handles a "Request" and set of "Responses". => With access to some HDS data from other accounts.
- **AppClientAccount**: Handles requests from `AppManagingAccount` and corresponding responses (agree, refuse, revoke).

## Application class
Both templates extend `Application` class 

An application is based on 
- one `connection`: an instance of `pryv.Connection`
- one `baseStreamId`: the streamId where the application will store its own operation data (i.e. state management) - This stream should be a children of stream `applications`.
- one `appName`

### instantiating an Application 
Either use: 
- `App{ExtensionName}.newFromApiEndpoint(baseStreamId, apiEndpoint, appName)`
- `App{ExtensionName}.newFromConnection(baseStreamId, connection, appName)`

It will return an instance already initialized with eventual necessary streams created. 

### extending Application class
Check the code for mode details. 

## AppManagingAccount

### instantiating
Either use: 
- `AppManagingAccount.newFromApiEndpoint(baseStreamId, apiEndpoint, appName)`
- `AppManagingAccount.newFromConnection(baseStreamId, connection, appName)`

Params:
- **apiEndpoint or connection** must have `master` or `personnal` access rights.

### appManagingAccount.getCollectors();
Get current `Collector` instances related to this app

### appManagingAccount.getCollectorById();
Get one `Collector`from its id.

### appManagingAccount.createCollector(name)
Create new `Collector`


### AppManagingAccount Collectors class
A collector is holding 
- A single request for accessing a set of streams 
- A set of `CollectorInvite` which are to be submitted to **clients**

It has 3 possible states `draft`=> `active` => `deactivated`

Collector instances are created and managed by AppManagingAccount.

#### collector.id
You may use this as a reference to retrieve a specific collector from an app
 
#### collector.statusCode
One of 'draft', 'active', 'deactivated'

#### collector.request
Payload that can be modified

#### async collector.save()
After modifying `collector.request` you should save it.

#### async collector.publish()
Once the edition is done and saved, validate and publish. (Can be done just once);

#### async collector.getInvites()
List of current invites

#### async collector.checkInbox ()
Check if new 'accept', 'refuse', 'revoke' messages have been received.

#### AppManagingAccount - CollectorInvite class
A collector invite represents the state of a 1 - 1 relationship between a Collector => A User
It's materialized by an `event` in one of the streams of the Collector

`collectorInvite` instances are created and retrieved by `Collector` instances.

##### collectorInvite.displayName()
Returns the display name set at creation


##### collectorInvite.getSharingData()
When `pending` this will return an `apiEndpoint` and an `eventId` to be shared with a 3rd party app using `ApplicationClient`. This data will be consumed by `appclient.handleIncomingRequest(apiEndpoint, eventId)` to initiate the relationship.

##### collectorInvite.status()
Returns one of `pending`, `active`, `error`.

In case of error, (meaning, means not accessible) the call `collectorInvite.errorType()` will return `revoked` or `refused`.

##### collectorInvite.connection and collectorInvite.apiEndpoint
As an invite is a 1 - 1 relationship, when active, it holds a connection to the matching account.

#### collectorInvite.dateCreation()
Returns a `Date`object.

##### async collectorInvite.checkAndGetAccessInfo()
Check if connection is valid. (only if active)
If the result is "forbidden" update and set as revoked.

Returns the `accessInfo` on success, which can be useful to get the hds username or other infos and the account.

## AppClientAccount

The counterpart of `AppManagingAccount` for "client" applications.

### instantiating
Either use: 
- `AppClientAccount.newFromApiEndpoint(baseStreamId, apiEndpoint, appName)`
- `AppClientAccount.newFromConnection(baseStreamId, connection, appName)`
### appClientAccount.handleIncomingRequest(apiEndpoint, incomingEventId)
To be called when the app receives a new request issued by `AppManagingAccount's collectorInvite.getSharingData()`. Returns a `CollectorClient` instance.

### appClientAccount.getCollectorClients()
Get current `CollectorClient` instances.

### appClientAccount.getCollectorClientByKey(collectorKey)
Get a specific `CollectorClient` instance.

### CollectorClient class

#### collectorClient.key
Identifier to retrieve a collector from appClientAccount.

#### collectorClient.status
One of 'Incoming', 'Active', 'Deactivated', 'Refused'

#### collectorClient.requestData
The data holding the requestFrom the invite

#### collectorClient.accept()
Accept current request

#### collectorClient.revoke()
Revoke current request

#### collectorClient.refuse()
Refuse current request