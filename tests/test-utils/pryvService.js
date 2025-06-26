require('./debug');
const pryv = require('../../src/patchedPryv');
const superagent = pryv.utils.superagent;

const ShortUniqueId = require('short-unique-id');
const passwordGenerator = new ShortUniqueId({ dictionary: 'alphanum', length: 12 });

const config = require('./config');

module.exports = {
  init,
  userExists,
  createUser,
  createUserAndPermissions,
  service,
  pryv,
  config
};

/**
 * @type {pryv.Service}
 */
let serviceSingleton;

/**
 * @type {ServiceInfo}
 */
let infosSingleton;

/**
 * Get current Pryv service
 * @returns {pryv.Service}
 */
function service () {
  if (serviceSingleton == null) throw new Error('Init pryvService first');
  return serviceSingleton;
}

/**
 * Initialize Pryv service from config and creates a singleton
 * accessible via service()
 * @returns {pryv.Service}
 */
async function init () {
  if (infosSingleton) return infosSingleton;
  if (!config.appId) throw new Error('Cannot find appId in config');
  if (!config.serviceInfoURL) throw new Error('Cannot find serviceInfoURL in config');
  serviceSingleton = new pryv.Service(config.serviceInfoURL);
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
    const res = await pryv.utils.superagent.post(host + 'users')
      .send({
        appId: config.appId,
        username,
        password,
        email,
        invitationtoken: 'enjoy',
        languageCode: 'en',
        referer: 'none'
      });
    if (res.body.apiEndpoint == null) throw new Error('Cannot find apiEndpoint in response');
    return { apiEndpoint: res.body.apiEndpoint, username: res.body.username, password };
  } catch (e) {
    throw new Error('Failed creating user ' + host + 'users');
  }
}

/**
 * Create userAccountAndPermission
 * @param {string} username
 * @param {Object} permissions - permission set (as per pryv api) - Add name if they might not exist
 * @param {string} [appName] - default: from config
 * @param {string} [password] - if not provided will be 'pass{usernam}'
 * @param {string} [email] - if not provided will be '{usernam}@hds.bogus'
 * @returns {Object} username, personalApiEndpoint, appId, appApiEndpoint
 */
async function createUserAndPermissions (username, permissions, appName, password, email) {
  const newUser = await createUser(username, password, email);
  const appId = config.appId;
  const personalConnection = new pryv.Connection(newUser.apiEndpoint);
  // -- make sure requested streams exists
  const createStreams = permissions.map(p => ({
    method: 'streams.create',
    params: {
      id: p.streamId,
      name: p.name || p.streamId
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
  const res = await personalConnection.api([...createStreams, accessRequest]);
  const accessRequestResult = res.pop();
  const appApiEndpoint = accessRequestResult.access?.apiEndpoint;

  const result = {
    username: newUser.username,
    personalApiEndpoint: newUser.apiEndpoint,
    appId,
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
  const userExists = (await superagent.get(infosSingleton.register + userId + '/check_username')).body;
  if (typeof userExists.reserved === 'undefined') throw Error('Pryv invalid user exists response ' + JSON.stringify(userExists));
  return userExists.reserved;
}

/**
 * Not really usefull for Open-Pryv.io kept if entreprise version becoms availble
 * @returns {string} first available hosting
 */
async function getHost () {
  await init();
  // get available hosting
  const hostings = (await superagent.get(infosSingleton.register + 'hostings').set('accept', 'json')).body;
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
