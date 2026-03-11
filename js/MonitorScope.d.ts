import { pryv } from './patchedPryv';
/**
 * MonitorScope — Progressive event loading with Monitor integration.
 *
 * Loading strategy:
 * - Fetches events in pages of `pageSize` (default 200), newest first
 * - Each page triggers onEvents callback → React renders progressively
 * - Continues paging until fromTime boundary reached or all events loaded
 * - Then starts Monitor for real-time updates
 *
 * Load more: On-demand older events beyond fromTime (scroll-up)
 */
type Connection = InstanceType<typeof pryv.Connection>;
type Event = any;
type Stream = any;
export interface MonitorScopeConfig {
    /** Events per page for chunked loading (default 200) */
    pageSize: number;
    /** Start of time window (unix timestamp, seconds) */
    fromTime: number;
    /** End of time window (unix timestamp, seconds). Defaults to now. */
    toTime?: number;
}
export interface MonitorScopeCallbacks {
    /** Called with a batch of events (preferred — allows efficient bulk ingestion) */
    onEvents?: (events: Event[]) => void;
    /** Called for individual events (from Monitor real-time updates) */
    onEvent?: (event: Event) => void;
    onEventDelete?: (event: {
        id: string;
    }) => void;
    onStreams?: (streams: Stream[]) => void;
    onError?: (error: Error) => void;
}
export declare class MonitorScope {
    private connection;
    private config;
    private callbacks;
    private monitor;
    private oldestLoadedTime;
    private _hasMoreOlder;
    private maxModified;
    private stopped;
    constructor(connection: Connection, config: MonitorScopeConfig, callbacks: MonitorScopeCallbacks);
    get hasMoreOlder(): boolean;
    /**
     * Start progressive loading:
     * 1. Fetch streams + first page of newest events
     * 2. Page backwards until fromTime boundary reached
     * 3. Start Monitor for real-time updates
     *
     * Each page triggers onEvents → UI updates progressively.
     */
    start(): Promise<void>;
    /**
     * Load older events beyond current scope (triggered by scroll-up).
     * Loads pageSize events older than the oldest currently loaded.
     */
    loadMore(): Promise<{
        events: Event[];
        hasMore: boolean;
    }>;
    /**
     * Stop monitoring and clean up.
     */
    stop(): void;
    /** Deliver a batch of events via onEvents (preferred) or onEvent fallback */
    private deliverEvents;
    /** Track event timestamps for pagination bookkeeping */
    private trackEvent;
}
export {};
