/**
 * Basic logger
 */
interface Logger {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
    debug: (...args: any[]) => void;
}
export declare function setLogger(newLogger: Logger): void;
export declare function info(...args: any[]): void;
export declare function error(...args: any[]): void;
export declare function debug(...args: any[]): void;
export declare function warn(...args: any[]): void;
export {};
// # sourceMappingURL=logger.d.ts.map
