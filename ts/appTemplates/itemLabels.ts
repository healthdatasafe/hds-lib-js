/**
 * Per-form item label overrides — types and helpers shared by form renderers
 * (hds-forms-js) and patient/diary apps (hds-webapp, doctor-dashboard).
 *
 * Storage model: `CollectorRequest.sections[].itemCustomizations[itemKey].labels`
 * — see ItemCustomization below. The same itemKey may be requested by multiple
 * forms (across multiple contacts) with different labels. Renderers should
 * surface every variant with attribution rather than picking one.
 */

import type { localizableText } from '../localizeText.ts';
import type { CollectorSectionInterface } from './interfaces.ts';
import type { Contact } from './Contact.ts';

/**
 * Per-form label overrides for an HDS item, applied on top of the item def.
 * Mirrors `section.itemCustomizations[itemKey].labels`.
 */
export interface ItemLabels {
  /** Override for the question label (replaces itemDef.label) */
  question?: localizableText;
  /** Override for the question description (replaces itemDef.description) */
  description?: localizableText;
  /** Per-option-value overrides for `select` fields, keyed by raw option value */
  options?: Record<string | number, localizableText>;
}

/**
 * Per-item customizations bag stored on a CollectorRequest section.
 * Mirrors `itemCustomizations[itemKey]`.
 */
export interface ItemCustomization {
  repeatable?: string;
  reminder?: Record<string, unknown>;
  labels?: ItemLabels;
  [key: string]: unknown;
}

/** Identification of which form / contact a label override comes from. */
export interface ItemLabelSource {
  /** Display name of the requesting contact (e.g. "Dr. drandy"). */
  contactName?: string;
  /** Title of the form/data-set requesting the item. */
  formTitle?: localizableText;
  /** Section key within the form. */
  sectionKey?: string;
  /** Optional access/request key for tie-breaking. */
  requestKey?: string;
}

/** A label override paired with the form/contact it originated from. */
export interface ItemLabelsWithSource extends ItemLabels {
  source: ItemLabelSource;
}

export interface CollectItemLabelsOptions {
  /** Only include sections that explicitly override labels. Default true. */
  requireLabels?: boolean;
  /** Drop duplicate label sets keeping first occurrence. Default true. */
  deduplicate?: boolean;
}

/** Read labels (if any) for itemKey from a single section. */
export function getSectionItemLabels (section: CollectorSectionInterface, itemKey: string): ItemLabels | undefined {
  if (!section.itemKeys.includes(itemKey)) return undefined;
  const cust = section.itemCustomizations?.[itemKey] as ItemCustomization | undefined;
  return cust?.labels;
}

function isEmptyLabels (l: ItemLabels | undefined): boolean {
  return !l || (l.question == null && l.description == null && (l.options == null || Object.keys(l.options).length === 0));
}

/**
 * Collect label overrides for itemKey from a list of (section, source) pairs.
 * One entry per section that uses the item; deduplicated by label content.
 */
export function collectItemLabelsFromSections (
  itemKey: string,
  sources: Array<{ section: CollectorSectionInterface, source: ItemLabelSource }>,
  opts: CollectItemLabelsOptions = {}
): ItemLabelsWithSource[] {
  const requireLabels = opts.requireLabels ?? true;
  const deduplicate = opts.deduplicate ?? true;
  const out: ItemLabelsWithSource[] = [];
  const seen = new Set<string>();
  for (const { section, source } of sources) {
    if (!section.itemKeys.includes(itemKey)) continue;
    const labels = getSectionItemLabels(section, itemKey) || {};
    if (requireLabels && isEmptyLabels(labels)) continue;
    const entry: ItemLabelsWithSource = { ...labels, source };
    if (deduplicate) {
      const sig = JSON.stringify({ q: entry.question, d: entry.description, o: entry.options });
      if (seen.has(sig)) continue;
      seen.add(sig);
    }
    out.push(entry);
  }
  return out;
}

/**
 * Gather labels for itemKey from every active CollectorClient on the given
 * contacts. Each entry is attributed to the contact and form it came from.
 */
export function collectItemLabels (
  itemKey: string,
  contacts: Contact[],
  opts: CollectItemLabelsOptions = {}
): ItemLabelsWithSource[] {
  const sources: Array<{ section: CollectorSectionInterface, source: ItemLabelSource }> = [];
  for (const contact of contacts) {
    for (const cc of contact.collectorClients) {
      if (cc.status !== 'Active') continue;
      const formTitle = cc.request?.title;
      const sections = cc.getSections() || [];
      for (const section of sections) {
        sources.push({
          section,
          source: {
            contactName: contact.displayName,
            formTitle,
            sectionKey: section.key,
            requestKey: cc.key
          }
        });
      }
    }
  }
  return collectItemLabelsFromSections(itemKey, sources, opts);
}
