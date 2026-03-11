export interface ReminderConfig {
    cooldown?: string;
    expectedInterval?: {
        min?: string;
        max?: string;
    };
    relativeTo?: string;
    relativeDays?: number[];
    importance?: 'may' | 'should' | 'must';
}
export declare class HDSItemDef {
    #private;
    constructor(key: string, definitionData: any);
    get eventTypes(): string[];
    get key(): string;
    get data(): any;
    get repeatable(): string;
    get reminder(): ReminderConfig | null;
    /** label Localized */
    get label(): string;
    /** description Localized */
    get description(): string;
    /**
     * a template event with eventType and streamIds
     * // TODO handle variations
     */
    eventTemplate(): {
        streamIds: [string];
        type: string;
    };
}
