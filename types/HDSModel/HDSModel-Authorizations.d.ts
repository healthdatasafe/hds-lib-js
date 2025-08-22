export = HDSModelAuthorizations;
/**
 * Authorizations - Extension of HDSModel
 */
declare class HDSModelAuthorizations {
    constructor(model: any);
    /**
     * Get minimal Authorization set for itemKeys
     * /!\ Does not handle requests with streamId = "*"
     * @param {Array<itemKeys>} itemKeys
     * @param {Object} [options]
     * @param {string} [options.defaultLevel] (default = write) one of 'read', 'manage', 'contribute', 'writeOnly'
     * @param {boolean} [options.includeDefaultName] (default = true) defaultNames are needed for permission requests but not for access creation
     * @param {Array<AuthorizationRequestItem>} [options.preRequest]
     * @return {Array<AuthorizationRequestItem>}
     */
    forItemKeys(itemKeys: any, options?: {
        defaultLevel?: string;
        includeDefaultName?: boolean;
        preRequest?: Array<AuthorizationRequestItem>;
    }): Array<AuthorizationRequestItem>;
    #private;
}
declare namespace HDSModelAuthorizations {
    export { AuthorizationRequestItem };
}
type AuthorizationRequestItem = {
    streamId: string;
    level: string;
    defaultName: string;
};
