const { assert } = require('./deps-node');
const { createUserAndPermissions, pryv, createUser, createUserPermissions } = require('./pryvService');
const AppManagingAccount = require('../../js/').appTemplates.AppManagingAccount;
const AppClientAccount = require('../../js/').appTemplates.AppClientAccount;

module.exports = {
  helperNewAppAndUsers,
  helperNewAppClient,
  helperNewAppManaging,
  helperNewInvite
};

/**
 * function helperNewAppManaging
 */
async function helperNewAppManaging (baseStreamIdManager, appName, managingUser = null) {
  // -- managing
  const initialStreams = [{ id: 'applications', name: 'Applications' }, { id: baseStreamIdManager, name: appName, parentId: 'applications' }];
  const permissionsManager = [{ streamId: baseStreamIdManager, level: 'manage' }];
  if (!managingUser) {
    managingUser = await createUserAndPermissions(null, permissionsManager, initialStreams, appName);
  } else {
    // replace managing user with new permissions set
    managingUser = await createUserPermissions(managingUser, permissionsManager, initialStreams, appName);
  }
  const connection = new pryv.Connection(managingUser.appApiEndpoint);
  const appManaging = await AppManagingAccount.newFromConnection(baseStreamIdManager, connection);
  return { managingUser, appManaging };
}

/**
 * helper to generate a new managing user and new client user
 */
async function helperNewAppClient (baseStreamIdClient, appClientName) {
  // -- receiving user
  const clientUser = await createUser();
  const permissionsClient = [{ streamId: '*', level: 'manage' }];
  const clientUserResultPermissions = await createUserPermissions(clientUser, permissionsClient, [], appClientName);
  const appClient = await AppClientAccount.newFromApiEndpoint(baseStreamIdClient, clientUserResultPermissions.appApiEndpoint, appClientName);
  return { clientUser, clientUserResultPermissions, appClient };
}

/**
 * helper to generate a new managing user and new client user
 */
async function helperNewAppAndUsers (baseStreamIdManager, appName, baseStreamIdClient, appClientName) {
  const res = {};
  const resManager = await helperNewAppManaging(baseStreamIdManager, appName);
  const resClient = await helperNewAppClient(baseStreamIdClient, appClientName);
  Object.assign(res, resManager);
  Object.assign(res, resClient);
  return res;
}

/**
 * heper to generate a new collector and invite for this managing application
 * @param {AppManagingAccount} appManaging
 * @returns {Object}
 */
async function helperNewInvite (appManaging, appClient, code) {
  code = code || Math.floor(Math.random() * 1000);
  const collector = await appManaging.createCollector('Invite test ' + code);

  // set request content
  const requestContent = {
    version: 0,
    requester: { name: 'Test requester name' },
    title: { en: 'Title of the request' },
    description: { en: 'Short Description' },
    consent: { en: 'This is a consent message' },
    permissions: [{ streamId: 'profile-name', defaultName: 'Name', level: 'read' }],
    app: { id: 'test-app', url: 'https://xxx.yyy', data: { } }
  };
  collector.request.setContent(requestContent);

  await collector.save();
  await collector.publish();
  // create invite
  const options = { customData: { hello: 'bob' } };
  const invite = await collector.createInvite('Invite One', options);
  const inviteSharingData = await invite.getSharingData();
  assert.equal(inviteSharingData.apiEndpoint, await collector.sharingApiEndpoint());

  // Invitee receives the invite
  const collectorClient = await appClient.handleIncomingRequest(inviteSharingData.apiEndpoint, inviteSharingData.eventId);

  return { collector, invite, collectorClient, inviteSharingData };
}
