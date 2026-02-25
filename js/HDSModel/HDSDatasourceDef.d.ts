export declare class HDSDatasourceDef {
    #private;
    constructor(key: string, definitionData: any);
    get key(): string;
    get data(): any;
    /** label Localized */
    get label(): string;
    /** description Localized */
    get description(): string;
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
//# sourceMappingURL=HDSDatasourceDef.d.ts.map