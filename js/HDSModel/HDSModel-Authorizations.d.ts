import { HDSModel } from './HDSModel';
export type AuthorizationRequestItem = {
    streamId: string;
    level: string;
    defaultName: string;
};
export type AuthorizationPreRequestItem = {
    streamId: string;
    level?: string;
    defaultName?: string;
};
/**
 * Authorizations - Extension of HDSModel
 */
export declare class HDSModelAuthorizations {
  #private;
  constructor(model: HDSModel);
  /**
     * Get minimal Authorization set for itemKeys
     * /!\ Does not handle requests with streamId = "*"
     */
  forItemKeys(itemKeys: string[], options?: {
        defaultLevel?: string;
        includeDefaultName?: boolean;
        preRequest?: Array<AuthorizationPreRequestItem>;
    }): Array<AuthorizationRequestItem>;
}
// # sourceMappingURL=HDSModel-Authorizations.d.ts.map
