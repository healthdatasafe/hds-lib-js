export declare class HDSItemDef {
  #private;
  constructor(key: string, definitionData: any);
  get eventTypes(): string[];
  get key(): string;
  get data(): any;
  /** label Localized */
  get label(): string;
  /** description Localized */
  get description(): string;
  /**
     * a template event with eventType and streamIds
     * // TODO handle variations
     */
  eventTemplate(): {
        streamId: string;
        type: string;
    };
}
// # sourceMappingURL=HDSItemDef.d.ts.map
