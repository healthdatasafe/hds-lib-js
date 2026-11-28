/**
 * Names for shared data and for requested permissions, from the data model.
 *
 * An invitation or a sharing screen must name what a connection reads by the data model's own
 * words, never by the requester's label alone: any account can label a wide grant "Cycle
 * length". These helpers give every HDS app (patient app, account app, doctor dashboard) the
 * same names and the same warnings. A model stream's `description` comes with its name, so a consent can say what the
 * data covers (on a documents stream, `cmcDocuments.documentsGrantNote` says what it leaves out).
 */

import { getModel } from '../HDSModel/HDSModelInitAndSingleton.ts';
import { localizeText, matchLocale, type Localizable, type localizableText } from '../localizeText.ts';
import { canonicalStreamId } from '../cmc/shareIds.ts';

export interface PermissionLabelOptions {
  /** Language of the names; defaults to the preferred locales (`localizeText`). */
  locale?: string;
}

/** A requested or granted permission, read for a person. */
export interface PermissionView {
  streamId: string;
  /** What it covers: `all-data` (`*`), `account-email` (`:system:email`) or `data` (a stream). */
  kind: 'all-data' | 'account-email' | 'data';
  /** The data's name from the model ("Parent › Child" for a child stream named by its own label); the requester's label, quoted, when the model does not know the stream. */
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
  /** What the data covers, from the model stream's `description`, in the same language as `name`; null when it has none. */
  description: string | null;
}

const TEXTS: Record<'allData' | 'email' | 'under', localizableText> = {
  allData: { en: 'All your data', fr: 'Toutes vos données', es: 'Todos sus datos', it: 'Tutti i suoi dati', 'pt-BR': 'Todos os seus dados' },
  email: { en: 'Your e-mail address', fr: 'Votre adresse e-mail', es: 'Su dirección de correo electrónico', it: 'Il suo indirizzo e-mail', 'pt-BR': 'Seu endereço de e-mail' },
  under: { en: '{name} and everything under it', fr: '{name} et tout ce qui en dépend', es: '{name} y todo lo que contiene', it: '{name} e tutto ciò che contiene', 'pt-BR': '{name} e tudo o que contém' }
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
 * else is there), else the stream's own localised `label` (data-model 4.4.0 carries one on every
 * stream no single item speaks for: roots, intermediate streams), else `opts.fallback`, else the
 * model stream's name, else the stream id.
 *
 * `opts.qualified`: a child stream named by its own label is a bare word out of context
 * ("Généraux", "Fertilité"), so it is prefixed with its parent's name: "Symptômes › Généraux". The parent is named
 * by its own stream label when it has one, before the item filed there ("Documents médicaux › Documents cliniques").
 * Names from an item label, and root streams, are left as they are.
 */
export function dataName (streamId: string, opts: PermissionLabelOptions & { fallback?: string; qualified?: boolean } = {}): string {
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
  try {
    const stream = model?.streams.getDataById(streamId, false);
    const streamLabel = stream?.label;
    const label = streamLabel != null && typeof streamLabel === 'object' ? pick(streamLabel as Localizable, opts.locale) : null;
    if (label) {
      if (opts.qualified && typeof stream?.parentId === 'string' && stream.parentId !== '') {
        return `${parentName(stream.parentId, opts.locale)} › ${label}`;
      }
      return label;
    }
  } catch { /* model not loaded */ }
  if (opts.fallback) return opts.fallback;
  try {
    const stream = model?.streams.getDataById(streamId, false);
    if (stream?.name) return stream.name;
  } catch { /* model not loaded */ }
  return streamId;
}

/**
 * A parent in a "Parent › Child" name: by its own stream label first, since the item filed on a parent names one
 * entry, not the stream ("Medical documents › Clinical documents", never the item's "Medical document › …"); else as
 * `dataName` names it.
 */
function parentName (parentId: string, locale?: string): string {
  try {
    const streamLabel = getModel().streams.getDataById(parentId, false)?.label;
    const label = streamLabel != null && typeof streamLabel === 'object' ? pick(streamLabel as Localizable, locale) : null;
    if (label) return label;
  } catch { /* model not loaded */ }
  return dataName(parentId, { locale });
}

/**
 * A permission as a person reads it: named from the data model (the requester's label only
 * quoted and flagged when the model does not know the stream), its level, and whether it
 * deserves a warning. Works before the model is loaded (then `inModel: false`).
 */
export function permissionView (perm: { streamId?: string; level?: string; defaultName?: string }, options: PermissionLabelOptions = {}): PermissionView {
  // one locale for the name and the description: `fr-CH` reads `fr`, an unsupported one the preferred locales
  const opts = { ...options, locale: options.locale != null ? (matchLocale(options.locale) ?? options.locale) : undefined };
  // named by the canonical id; `streamId` stays as given
  const streamId = canonicalStreamId(perm.streamId ?? '');
  const level = perm.level ?? 'read';
  const requesterLabel = perm.defaultName ?? null;
  const base = { streamId: perm.streamId ?? '', level, requesterLabel, description: null };
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
  let description: string | null = null;
  try {
    const model = getModel();
    const stream = model.streams.getDataById(streamId, false) as { children?: unknown[]; description?: unknown } | null | undefined;
    inModel = stream != null || model.itemsDefs.forStreamId(streamId).length > 0;
    hasChildren = (stream?.children?.length ?? 0) > 0;
    description = descriptionOf(stream?.description, opts.locale);
  } catch { /* model not loaded: the requester's label, flagged */ }
  const name = inModel ? dataName(streamId, { ...opts, qualified: true }) : quoted;
  const label = hasChildren ? (pick(TEXTS.under, opts.locale) as string).replace('{name}', name) : name;
  return { ...base, kind: 'data', name, label, beyondRead: level !== 'read', inModel, hasChildren, description };
}

/** A model description as the name is picked (`pick`: the locale, else the preferred locales); null when there is none. */
function descriptionOf (text: unknown, locale?: string): string | null {
  if (text == null || typeof text !== 'object') return null;
  try { return pick(text as Localizable, locale); } catch { return null; }
}
