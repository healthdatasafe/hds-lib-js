import type { localizableText } from '../localizeText';
type localizableTextLanguages = keyof localizableText;
declare type PermissionItem = {
    streamId: string;
    defaultName: string;
    level: string;
};
declare type PermissionItemLight = {
    streamId: string;
    defaultName?: string;
    level?: string;
};
/**
 * Each Collector has one Request
 * Which contains
 * - the name of the requester
 * - a title
 * - a description
 * - a consent message
 * - a set of permission requests
 * - a version
 */
export declare class CollectorRequest {
    #private;
    constructor(content: any);
    /**
     * Loadfrom invite event
     * used by CollectorClient only
     * @param invite
     */
    loadFromInviteEvent(inviteEvent: any): void;
    /**
     * Loadfrom status event from Collector
     * used by Collector only
     * @param statusEvent
     */
    loadFromStatusEvent(statusEvent: any): void;
    /**
     * Temp content
     * @param content
     */
    setContent(content: any): void;
    get version(): number;
    set title(title: localizableText);
    get title(): localizableText;
    set consent(consent: localizableText);
    get consent(): localizableText;
    set description(description: localizableText);
    get description(): localizableText;
    set requesterName(name: string);
    get requesterName(): string;
    set appId(id: string);
    get appId(): string;
    set appUrl(url: string);
    get appUrl(): string;
    set appCustomData(data: any);
    get appCustomData(): any;
    get permissions(): PermissionItem[];
    get permissionsExtra(): PermissionItemLight[];
    get sections(): Array<CollectorRequestSection>;
    get sectionsData(): any[];
    createSection(key: string, type: RequestSectionType): CollectorRequestSection;
    getSectionByKey(key: string): CollectorRequestSection;
    addPermissions(permissions: Array<{
        streamId: string;
        defaultName: string;
        level: string;
    }>): void;
    addPermission(streamId: string, defaultName: string, level: string): void;
    /**
     * Add a static permission, not linked to itemKeys for other usages
     * @param permission
     */
    addPermissionExtra(permission: PermissionItemLight): void;
    /**
     * Reset permissions
     */
    resetPermissions(): void;
    /**
     * Rebuild permissions based on sections itemKeys and staticPermissions
     */
    buildPermissions(): void;
    /**
     * Return Content to comply with initial implementation as an object
     */
    get content(): {
        version: number;
        title: localizableText;
        consent: localizableText;
        description: localizableText;
        requester: {
            name: string;
        };
        permissionsExtra: PermissionItemLight[];
        permissions: PermissionItem[];
        app: {
            id: string;
            url: string;
            data: any;
        };
        sections: any[];
    };
}
declare const RequestSectionType: {
    recurring: string;
    permanent: string;
};
type RequestSectionType = (typeof RequestSectionType)[keyof typeof RequestSectionType];
declare class CollectorRequestSection {
    #private;
    constructor(key: string, type: RequestSectionType);
    addItemKeys(keys: Array<string>): void;
    addItemKey(key: string): void;
    setName(localizedName: localizableText): void;
    setNameLocal(languageCode: localizableTextLanguages, name: string): void;
    get type(): RequestSectionType;
    get key(): string;
    get itemKeys(): string[];
    get name(): localizableText;
    getData(): {
        key: string;
        type: string;
        name: localizableText;
        itemKeys: string[];
    };
}
export {};
//# sourceMappingURL=CollectorRequest.d.ts.map