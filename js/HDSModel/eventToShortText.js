"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatEventDate = formatEventDate;
exports.eventToShortText = eventToShortText;
const localizeText_1 = require("../localizeText");
const HDSModelInitAndSingleton_1 = require("./HDSModelInitAndSingleton");
/**
 * Format a Unix timestamp (seconds) as a date string.
 * Centralized here so we can later hook into user locale/format preferences.
 */
function formatEventDate(timeSec) {
    return new Date(timeSec * 1000).toISOString().split('T')[0];
}
/**
 * Convert an event's content to a short human-readable string.
 * Resolves itemDef from the model (streamId + eventType match).
 *
 * With itemDef: select → localized option label, checkbox → "Yes",
 * number → "60 Kg" (with unit symbol from eventType extras),
 * datasource-search → drug label + intake details, date → ISO date.
 *
 * Without itemDef (fallback): derives unit from eventType symbol if available,
 * for object content produces short textual representation.
 */
function eventToShortText(event) {
    if (event == null)
        return null;
    const model = (0, HDSModelInitAndSingleton_1.getModel)();
    const itemDef = model.itemsDefs.forEvent(event, false);
    const content = event.content;
    if (itemDef) {
        // For checkbox/date items, content may be null — the event time IS the data
        if (content == null && itemDef.data.type === 'checkbox') {
            return formatEventDate(event.time);
        }
        if (content == null && itemDef.data.type === 'date') {
            return formatEventDate(event.time);
        }
        if (content == null)
            return null;
        return formatWithItemDef(event, content, itemDef, model);
    }
    if (content == null)
        return null;
    return formatFallback(event, content, model);
}
function formatWithItemDef(event, content, itemDef, model) {
    const type = itemDef.data.type;
    if (type === 'checkbox') {
        return event.type === 'activity/plain' ? 'Yes' : String(content);
    }
    if (type === 'select') {
        return formatSelect(event, content, itemDef);
    }
    if (type === 'date') {
        // date items store time on the event itself
        return formatEventDate(event.time);
    }
    if (type === 'datasource-search') {
        return formatDatasource(content);
    }
    // number, text, composite, etc.
    if (typeof content === 'number') {
        const symbol = getSymbol(event.type, model);
        return symbol ? `${content} ${symbol}` : String(content);
    }
    if (typeof content === 'string') {
        return content.length > 60 ? content.slice(0, 60) + '...' : content;
    }
    if (typeof content === 'boolean') {
        return content ? 'Yes' : 'No';
    }
    // Composite / object — try common fields
    return formatObject(content);
}
function formatFallback(event, content, model) {
    if (typeof content === 'number') {
        const symbol = getSymbol(event.type, model);
        return symbol ? `${content} ${symbol}` : String(content);
    }
    if (typeof content === 'string') {
        return content.length > 60 ? content.slice(0, 60) + '...' : content;
    }
    if (typeof content === 'boolean') {
        return content ? 'Yes' : 'No';
    }
    if (typeof content === 'object') {
        return formatObject(content);
    }
    return String(content);
}
function formatSelect(event, content, itemDef) {
    let valueForSelect = content;
    let prefix = '';
    if (event.type === 'ratio/generic' && typeof content === 'object') {
        prefix = content.value + '/' + content.relativeTo + ' ';
        valueForSelect = content.value;
    }
    const options = itemDef.data.options;
    if (options) {
        const selected = options.find((o) => o.value === valueForSelect);
        if (selected?.label) {
            const text = typeof selected.label === 'string' ? selected.label : ((0, localizeText_1.localizeText)(selected.label) || String(valueForSelect));
            const truncated = text.length > 50 ? text.slice(0, 50) + '...' : text;
            return prefix + truncated;
        }
    }
    return prefix + String(valueForSelect);
}
function formatDatasource(content) {
    if (!content || typeof content !== 'object')
        return String(content);
    // medication/coded-v1: {drug: {label}, intake: {doseValue, doseUnit, route}}
    // legacy flat: {label, codes, doseValue, doseUnit, route}
    const label = content.drug?.label || content.label;
    let text;
    if (label) {
        text = typeof label === 'string' ? label : ((0, localizeText_1.localizeText)(label) || JSON.stringify(content));
    }
    else {
        text = JSON.stringify(content);
    }
    const intake = content.intake || content;
    const parts = [];
    if (intake.doseValue) {
        const unitLabel = intake.doseUnit
            ? intake.doseUnit.replace(/^dose\//, '').replace(/^(mass|volume)\//, '')
            : '';
        parts.push(`${intake.doseValue} ${unitLabel}`.trim());
    }
    if (intake.route)
        parts.push(intake.route);
    if (parts.length > 0)
        text += ' — ' + parts.join(', ');
    return text;
}
function formatObject(content) {
    if (content == null)
        return null;
    // Try common patterns
    if (content.label) {
        const txt = typeof content.label === 'object' ? (0, localizeText_1.localizeText)(content.label) : content.label;
        if (txt)
            return String(txt);
    }
    if (content.drug?.label) {
        const dl = content.drug.label;
        return typeof dl === 'string' ? dl : ((0, localizeText_1.localizeText)(dl) || null);
    }
    if (content.value != null)
        return String(content.value);
    // Last resort: count keys
    const keys = Object.keys(content);
    if (keys.length === 0)
        return null;
    // Try first string/number field
    for (const k of keys) {
        const v = content[k];
        if (typeof v === 'string')
            return v.length > 40 ? v.slice(0, 40) + '...' : v;
        if (typeof v === 'number')
            return String(v);
    }
    return `{${keys.length} fields}`;
}
function getSymbol(eventType, model) {
    try {
        return model.eventTypes.getEventTypeSymbol(eventType);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=eventToShortText.js.map