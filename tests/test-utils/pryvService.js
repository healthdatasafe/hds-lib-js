require('./debug');
const pryv = require('../../js/').pryv;
const HDSService = require('../../js/').HDSService;

const ShortUniqueId = require('short-unique-id');
const passwordGenerator = new ShortUniqueId({ dictionary: 'alphanum', length: 12 });

const config = require('./config');
const { setServiceInfoURL } = require('../../js/settings');

module.exports = {
  init,
  userExists,
  createUser,
  createUserAndPermissions,
  createUserPermissions,
  service,
  pryv,
  config
};

/**
 * @type {HDSService}
 */
let serviceSingleton;

/**
 * @type {ServiceInfo}
 */
let infosSingleton;

/**
 * Get current HDSService
 * @returns {HDSService}
 */
function service () {
  if (serviceSingleton == null) throw new Error('Init pryvService first');
  return serviceSingleton;
}

/**
 * Initialize HDSservice from config and creates a singleton
 * accessible via service()
 * @returns {HDSService}
 */
async function init () {
  if (infosSingleton) return infosSingleton;
  if (!config.appId) throw new Error('Cannot find appId in config');
  if (!config.serviceInfoURL) throw new Error('Cannot find serviceInfoURL in config');
  setServiceInfoURL(config.serviceInfoURL);
  serviceSingleton = new HDSService(config.serviceInfoURL);
  infosSingleton = await serviceSingleton.info();
  return infosSingleton;
}

/**
 * @typedef {Object} CreateUserResult
 * @property {string} apiEndpoint - a personal ApiEnpoint
 * @property {string} username - The username
 * @property {string} password - The password
 */

/**
 * Create a user on Pryv.io
 * @param {string} userId - desireg UserId for Prvy.io
 * @param {string} password
 * @param {string} email
 * @returns {CreateUserResult}
 */
async function createUser (username, password, email) {
  const host = await getHost();
  password = password || passwordGenerator.rnd();
  username = username || getNewUserId('u');
  email = email || username + '@hds.bogus';
  try {
    // create user
    const res = await fetch(host + 'users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: config.appId,
        username,
        password,
        email,
        invitationtoken: 'enjoy',
        languageCode: 'en',
        referer: 'none'
      })
    });
    const body = await res.json();
    if (body.apiEndpoint == null) throw new Error('Cannot find apiEndpoint in response');
    return { apiEndpoint: body.apiEndpoint, username: body.username, password };
  } catch (e) {
    throw new Error('Failed creating user ' + host + 'users');
  }
}

/**
 * Create userAccountAndPermission
 * @param {string} username
 * @param {Object} permissions - permission set (as per pryv api) - Add name if they might not exist
 * @param {Array<Stream creation>} initialStreams - to be created
 * @param {string} [appName] - default: from config
 * @param {string} [password] - if not provided will be 'pass{usernam}'
 * @param {string} [email] - if not provided will be '{usernam}@hds.bogus'
 * @returns {Object} username, personalApiEndpoint, appId, appApiEndpoint
 */
async function createUserAndPermissions (username, permissions, initialStreams, appName, password, email) {
  const newUser = await createUser(username, password, email);
  const result = await createUserPermissions(newUser, permissions, initialStreams, appName);
  result.appId = config.appId;
  return result;
}

async function createUserPermissions (user, permissions, initialStreams = [], appName) {
  const personalConnection = new pryv.Connection(user.apiEndpoint || user.personalApiEndpoint);
  // -- make sure requested streams exists
  const createStreams = initialStreams.map(s => ({
    method: 'streams.create',
    params: {
      id: s.id,
      name: s.name,
      parentId: s.parentId || null
    }
  }));
  // -- create access
  const accessRequest = {
    method: 'accesses.create',
    params: {
      type: 'app',
      name: appName,
      permissions
    }
  };
  const apiCalls = [...createStreams, accessRequest];
  const res = await personalConnection.api(apiCalls);
  const accessRequestResult = res.pop();
  if (accessRequestResult.error) throw new Error(accessRequestResult.error.message);
  const appApiEndpoint = accessRequestResult.access?.apiEndpoint;
  const result = {
    username: user.username,
    personalApiEndpoint: user.apiEndpoint,
    appApiEndpoint
  };

  return result;
}

/**
 * Utility to check if a user exists on a Pryv pltafom
 * @param {string} userId
 * @returns {boolean}
 */
async function userExists (userId) {
  await init();
  const userExistsRes = await fetch(infosSingleton.register + userId + '/check_username');
  const userExistsBody = await userExistsRes.json();
  if (typeof userExistsBody.reserved === 'undefined') throw Error('Pryv invalid user exists response ' + JSON.stringify(userExistsBody));
  return userExistsBody.reserved;
}

/**
 * Not really usefull for Open-Pryv.io kept if entreprise version becoms availble
 * @returns {string} first available hosting
 */
async function getHost () {
  await init();
  // get available hosting
  const hostingsRes = await fetch(infosSingleton.register + 'hostings', {
    headers: { Accept: 'application/json' }
  });
  const hostings = await hostingsRes.json();
  let hostingCandidate = null;
  findOneHostingKey(hostings, 'N');
  function findOneHostingKey (o, parentKey) {
    for (const key of Object.keys(o)) {
      if (parentKey === 'hostings') {
        const hosting = o[key];
        if (hosting.available) {
          hostingCandidate = hosting;
        }
        return;
      }
      if (typeof o[key] !== 'string') {
        findOneHostingKey(o[key], key);
      }
    }
  }
  if (hostingCandidate == null) throw Error('Cannot find hosting in: ' + JSON.stringify(hostings));
  return hostingCandidate.availableCore;
}

const userIdGenerator = new ShortUniqueId({ dictionary: 'alphanum_lower', length: 7 });
function getNewUserId (startWith = 'x') {
  const id = startWith + userIdGenerator.rnd();
  return id;
}
