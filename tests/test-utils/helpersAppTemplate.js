import { createUserAndPermissions, pryv, createUserPermissions } from './pryvService.js';
import HDSLib from '../../ts/index.ts';
const { AppManagingAccount } = HDSLib.appTemplates;

export {
  helperNewAppManaging
};

/**
 * Helper: spin up a fresh user + grant a managing access + return an
 * initialized `AppManagingAccount`. Used by tests that need a real
 * Pryv connection but not the legacy Collector lifecycle.
 */
async function helperNewAppManaging (baseStreamIdManager, appName, managingUser = null) {
  const initialStreams = [{ id: 'applications', name: 'Applications' }, { id: baseStreamIdManager, name: appName, parentId: 'applications' }];
  const permissionsManager = [{ streamId: baseStreamIdManager, level: 'manage' }];
  if (!managingUser) {
    managingUser = await createUserAndPermissions(null, permissionsManager, initialStreams, appName);
  } else {
    managingUser = await createUserPermissions(managingUser, permissionsManager, initialStreams, appName);
  }
  const connection = new pryv.Connection(managingUser.appApiEndpoint);
  const appManaging = await AppManagingAccount.newFromConnection(baseStreamIdManager, connection);
  return { managingUser, appManaging };
}
