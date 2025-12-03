"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HDSModelAuthorizations = void 0;
/**
 * Authorizations - Extension of HDSModel
 */
class HDSModelAuthorizations {
    /**
     * Model instance
     */
    #model;
    constructor(model) {
        this.#model = model;
    }
    /**
     * Get minimal Authorization set for itemKeys
     * /!\ Does not handle requests with streamId = "*"
     */
    forItemKeys(itemKeys, options = {}) {
        const opts = {
            defaultLevel: 'read',
            preRequest: [],
            includeDefaultName: true
        };
        Object.assign(opts, options);
        const streamsRequested = {};
        for (const pre of opts.preRequest) {
            if (!pre.streamId)
                throw new Error(`Missing streamId in options.preRequest item: ${JSON.stringify(pre)}`);
            // complete pre with defaultName if missing
            if (opts.includeDefaultName && !pre.defaultName) {
                // try to get it from streams Data
                const stream = this.#model.streams.getDataById(pre.streamId, false);
                if (stream) {
                    pre.defaultName = stream.name;
                }
                else {
                    throw new Error(`No "defaultName" in options.preRequest item: ${JSON.stringify(pre)} and cannot find matching streams in default list`);
                }
            }
            // check there is no defaultName if not required
            if (!opts.includeDefaultName) {
                if (pre.defaultName)
                    throw new Error(`Do not include defaultName when not included explicitely on ${JSON.stringify(pre)}`);
            }
            // add default level
            if (!pre.level) {
                pre.level = opts.defaultLevel;
            }
            streamsRequested[pre.streamId] = pre;
        }
        // add streamId not already in
        for (const itemKey of itemKeys) {
            const itemDef = this.#model.itemsDefs.forKey(itemKey);
            const streamId = itemDef.data.streamId;
            if (!streamsRequested[streamId]) { // new streamId
                const auth = { streamId, level: opts.defaultLevel };
                if (opts.includeDefaultName) {
                    const stream = this.#model.streams.getDataById(streamId);
                    auth.defaultName = stream.name;
                }
                streamsRequested[streamId] = auth;
            }
            else { // existing just adapt level
                streamsRequested[streamId].level = mixAuthorizationLevels(streamsRequested[streamId].level, opts.defaultLevel);
            }
        }
        // remove all permissions with a parent having identical or higher level
        for (const auth of Object.values(streamsRequested)) {
            const parents = this.#model.streams.getParentsIds(auth.streamId, false);
            for (const parent of parents) {
                const found = streamsRequested[parent];
                if (found && authorizationOverride(found.level, auth.level)) {
                    // delete entry
                    delete streamsRequested[auth.streamId];
                    // break loop
                    continue;
                }
            }
        }
        return Object.values(streamsRequested);
    }
}
exports.HDSModelAuthorizations = HDSModelAuthorizations;
/**
 * Authorization level1 (parent) does override level2
 * Return "true" if identical or level1 == "manage"
 */
function authorizationOverride(level1, level2) {
    if (level1 === level2)
        return true;
    if (level1 === 'manage')
        return true;
    if (level1 === 'contribute' && level2 !== 'manage')
        return true;
    return false;
}
/**
 * Given two authorization level, give the resulting one
 */
function mixAuthorizationLevels(level1, level2) {
    if (level1 === level2)
        return level1;
    // sort level in orders [ 'contribute', 'manage', 'read', 'writeOnly' ]
    const levels = [level1, level2].sort();
    if (levels.includes('manage'))
        return 'manage'; // any & manage
    if (levels[0] === 'contribute')
        return 'contribute'; // read ore writeOnly & contribute
    if (levels[1] === 'writeOnly')
        return 'contribute'; // mix read & writeOnly
    /* c8 ignore next */ // error if there .. 'read' & 'read' should have already be found
    throw new Error(`Invalid level found level1: ${level1}, level2 ${level2}`);
}
//# sourceMappingURL=HDSModel-Authorizations.js.map