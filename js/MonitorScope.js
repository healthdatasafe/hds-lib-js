"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitorScope = void 0;
const patchedPryv_1 = require("./patchedPryv");
class MonitorScope {
    connection;
    config;
    callbacks;
    monitor = null;
    oldestLoadedTime = Number.MAX_VALUE;
    _hasMoreOlder = false;
    maxModified = 0;
    stopped = false;
    constructor(connection, config, callbacks) {
        this.connection = connection;
        this.config = config;
        this.callbacks = callbacks;
    }
    get hasMoreOlder() {
        return this._hasMoreOlder;
    }
    /**
     * Start progressive loading:
     * 1. Fetch streams + first page of newest events
     * 2. Page backwards until fromTime boundary reached
     * 3. Start Monitor for real-time updates
     *
     * Each page triggers onEvents → UI updates progressively.
     */
    async start() {
        if (this.stopped)
            return;
        const toTime = this.config.toTime ?? (Date.now() / 1000);
        // Step 1: First page + streams (batch call)
        const result = await this.connection.api([
            { method: 'events.get', params: { limit: this.config.pageSize, fromTime: this.config.fromTime, toTime } },
            { method: 'streams.get', params: {} },
        ]);
        if (this.stopped)
            return;
        // Process streams
        if (result[1] && !result[1].error && result[1].streams) {
            this.callbacks.onStreams?.(result[1].streams);
        }
        // Process first page of events
        let totalLoaded = 0;
        if (result[0] && !result[0].error && result[0].events) {
            const events = result[0].events;
            totalLoaded = events.length;
            this.deliverEvents(events);
        }
        if (this.stopped)
            return;
        // Step 2: Page backwards until fromTime boundary is reached
        // Each page is a separate HTTP request → browser yields → React can re-render
        while (totalLoaded > 0 &&
            totalLoaded % this.config.pageSize === 0 &&
            this.oldestLoadedTime > this.config.fromTime) {
            if (this.stopped)
                return;
            const pageResult = await this.connection.api([{
                    method: 'events.get',
                    params: {
                        fromTime: this.config.fromTime,
                        toTime: this.oldestLoadedTime,
                        limit: this.config.pageSize,
                    },
                }]);
            if (this.stopped)
                return;
            if (pageResult[0] && !pageResult[0].error && pageResult[0].events) {
                const pageEvents = pageResult[0].events;
                if (pageEvents.length === 0)
                    break;
                const prevOldest = this.oldestLoadedTime;
                totalLoaded += pageEvents.length;
                this.deliverEvents(pageEvents);
                // Safety: stop if no progress (oldest didn't change — would loop forever)
                if (this.oldestLoadedTime >= prevOldest)
                    break;
                // If fewer than pageSize returned, we've reached the boundary
                if (pageEvents.length < this.config.pageSize)
                    break;
            }
            else {
                break;
            }
        }
        // Assume there may be older events beyond fromTime — loadMore will confirm
        this._hasMoreOlder = totalLoaded > 0;
        if (this.stopped)
            return;
        // Step 3: Start Monitor for real-time updates
        // modifiedSince trick — initial fetch returns ~nothing
        const eventsGetScope = {
            fromTime: this.config.fromTime,
            toTime,
            modifiedSince: this.maxModified,
        };
        this.monitor = new patchedPryv_1.pryv.Monitor(this.connection, eventsGetScope)
            .on('event', (event) => {
            this.trackEvent(event);
            // Real-time updates: use onEvent for individual events
            if (this.callbacks.onEvent) {
                this.callbacks.onEvent(event);
            }
            else if (this.callbacks.onEvents) {
                this.callbacks.onEvents([event]);
            }
        })
            .on('eventDelete', (event) => {
            this.callbacks.onEventDelete?.(event);
        })
            .on('streams', (streams) => {
            this.callbacks.onStreams?.(streams);
        })
            .on('error', (error) => {
            this.callbacks.onError?.(error);
        });
        // Start before adding Socket to avoid race condition
        await this.monitor.start();
        this.monitor.addUpdateMethod(new patchedPryv_1.pryv.Monitor.UpdateMethod.Socket());
    }
    /**
     * Load older events beyond current scope (triggered by scroll-up).
     * Loads pageSize events older than the oldest currently loaded.
     */
    async loadMore() {
        if (!this._hasMoreOlder) {
            return { events: [], hasMore: false };
        }
        const result = await this.connection.api([
            { method: 'events.get', params: { toTime: this.oldestLoadedTime, limit: this.config.pageSize, fromTime: 0 } },
        ]);
        const events = [];
        if (result[0] && !result[0].error && result[0].events) {
            for (const event of result[0].events) {
                this.trackEvent(event);
                events.push(event);
            }
            if (result[0].events.length < this.config.pageSize) {
                this._hasMoreOlder = false;
            }
        }
        else {
            this._hasMoreOlder = false;
        }
        return { events, hasMore: this._hasMoreOlder };
    }
    /**
     * Stop monitoring and clean up.
     */
    stop() {
        this.stopped = true;
        if (this.monitor) {
            this.monitor.stop();
            this.monitor = null;
        }
    }
    /** Deliver a batch of events via onEvents (preferred) or onEvent fallback */
    deliverEvents(events) {
        for (const event of events) {
            this.trackEvent(event);
        }
        if (this.callbacks.onEvents) {
            this.callbacks.onEvents(events);
        }
        else if (this.callbacks.onEvent) {
            for (const event of events) {
                this.callbacks.onEvent(event);
            }
        }
    }
    /** Track event timestamps for pagination bookkeeping */
    trackEvent(event) {
        if (event.time < this.oldestLoadedTime) {
            this.oldestLoadedTime = event.time;
        }
        const mod = event.modified || event.time;
        if (mod > this.maxModified) {
            this.maxModified = mod;
        }
    }
}
exports.MonitorScope = MonitorScope;
