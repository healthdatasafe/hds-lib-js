type AssetsProvider = () => {
    [key: string]: string;
};
export declare class HDSDatasourceDef {
    #private;
    constructor(key: string, definitionData: any, getAssets: AssetsProvider);
    get key(): string;
    get data(): any;
    /** label Localized */
    get label(): string;
    /** description Localized */
    get description(): string;
    /**
     * Resolved endpoint URL.
     * If the raw endpoint starts with `http`, it is used as-is.
     * Otherwise it is treated as `<assetKey>://<path>` and resolved
     * against the service-info assets map.
     * e.g. `datasets://medication` → `assets.datasets` + `medication`
     */
    get endpoint(): string;
    get queryParam(): string;
    get minQueryLength(): number;
    get resultKey(): string;
    get displayFields(): {
        label: string;
        description: string;
    };
    get valueFields(): string[];
}
export {};
//# sourceMappingURL=HDSDatasourceDef.d.ts.map