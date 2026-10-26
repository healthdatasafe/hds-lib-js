/**
 * Names for shared data and for requested permissions, from the data model.
 *
 * An invitation or a sharing screen must name what a connection reads by the data model's own
 * words, never by the requester's label alone: any account can label a wide grant "Cycle
 * length". These helpers give every HDS app (patient app, account app, doctor dashboard) the
 * same names and the same warnings.
 */

import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { localizeText, type Localizable } from '../localizeText.ts';

export interface PermissionLabelOptions {
  /** Language of the names; defaults to the preferred locales (`localizeText`). */
  locale?: string;
}

/** A requested or granted permission, read for a person. */
export interface PermissionView {
  streamId: string;
  /** What it covers: `all-data` (`*`), `account-email` (`:system:email`) or `data` (a stream). */
  kind: 'all-data' | 'account-email' | 'data';
  /** The data's name from the model; the requester's label, quoted, when the model does not know the stream. */
  name: string;
  /** `name`, with "and everything under it" when the stream has child streams. */
  label: string;
  /** `read`, `contribute`, `manage`, `create-only` … (`read` when the permission names none). */
  level: string;
  /** Worth a warning: a level beyond `read`, or all data. */
  beyondRead: boolean;
  /** The data model knows the stream (an item is filed there, or it is a model stream). */
  inModel: boolean;
  /** The stream has child streams in the model, so the permission covers them too. */
  hasChildren: boolean;
  /** The requester's own label (`defaultName`), if any: show it quoted, never as the name. */
  requesterLabel: string | null;
}

const TEXTS: Record<'allData' | 'email' | 'under', { en: string; fr: string; es: string }> = {
  allData: { en: 'All your data', fr: 'Toutes vos données', es: 'Todos sus datos' },
  email: { en: 'Your e-mail address', fr: 'Votre adresse e-mail', es: 'Su dirección de correo electrónico' },
  under: { en: '{name} and everything under it', fr: '{name} et tout ce qui en dépend', es: '{name} y todo lo que contiene' }
};

function pick (text: Localizable | null | undefined, locale?: string): string | null {
  if (text == null) return null;
  if (locale) {
    const v = (text as Record<string, string | undefined>)[locale];
    if (v != null) return v;
  }
  return localizeText(text);
}

/**
 * The name of the data a stream holds, in the person's language: the label of the item filed
 * there (the item named as the stream when it holds several; deprecated items only when nothing
 * else is there), else `opts.fallback`, else the model stream's name, else the stream id.
 */
export function dataName (streamId: string, opts: PermissionLabelOptions & { fallback?: string } = {}): string {
  let model;
  try {
    model = getModel();
    const defs = model.itemsDefs.forStreamId(streamId);
    const current = defs.filter(d => !d.isDeprecated);
    const def = current.find(d => d.key === streamId) ??
      (current.length === 1 ? current[0] : (current.length === 0 && defs.length === 1 ? defs[0] : undefined));
    const label = pick(def?.data?.label, opts.locale);
    if (label) return label;
  } catch { /* model not loaded */ }
  if (opts.fallback) return opts.fallback;
  try {
    const stream = model?.streams.getDataById(streamId, false);
    if (stream?.name) return stream.name;
  } catch { /* model not loaded */ }
  return streamId;
}

/**
 * A permission as a person reads it: named from the data model (the requester's label only
 * quoted and flagged when the model does not know the stream), its level, and whether it
 * deserves a warning. Works before the model is loaded (then `inModel: false`).
 */
export function permissionView (perm: { streamId?: string; level?: string; defaultName?: string }, opts: PermissionLabelOptions = {}): PermissionView {
  const streamId = perm.streamId ?? '';
  const level = perm.level ?? 'read';
  const requesterLabel = perm.defaultName ?? null;
  const base = { streamId, level, requesterLabel };
  if (streamId === '*') {
    const name = pick(TEXTS.allData, opts.locale) as string;
    return { ...base, kind: 'all-data', name, label: name, beyondRead: true, inModel: true, hasChildren: true };
  }
  if (streamId === ':system:email') {
    const name = pick(TEXTS.email, opts.locale) as string;
    return { ...base, kind: 'account-email', name, label: name, beyondRead: level !== 'read', inModel: true, hasChildren: false };
  }
  const quoted = requesterLabel ? `“${requesterLabel}”` : streamId;
  let inModel = false;
  let hasChildren = false;
  try {
    const model = getModel();
    const stream = model.streams.getDataById(streamId, false) as { children?: unknown[] } | null | undefined;
    inModel = stream != null || model.itemsDefs.forStreamId(streamId).length > 0;
    hasChildren = (stream?.children?.length ?? 0) > 0;
  } catch { /* model not loaded: the requester's label, flagged */ }
  const name = inModel ? dataName(streamId, opts) : quoted;
  const label = hasChildren ? (pick(TEXTS.under, opts.locale) as string).replace('{name}', name) : name;
  return { ...base, kind: 'data', name, label, beyondRead: level !== 'read', inModel, hasChildren };
}
