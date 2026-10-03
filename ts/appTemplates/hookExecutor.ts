/**
 * Runs a catalogue connector's hook (HOOK-PROTOCOL.md v1): the `initiate` HTTP
 * step, then the `open` URL to embed or redirect to, or the best-effort
 * `disconnect` step. Shared by the HDS webapp and the account app's `/connect`.
 *
 * Pure-function discipline: no DOM, no UI, no side effects beyond the configured
 * HTTP steps. The caller decides how to act on the returned mode.
 */

import * as logger from '../logger.ts';

export type HookHttpStep = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  auth?: string;
  body?: Record<string, unknown>;
  openUrlField?: string;
};

export type HookOpenStep = {
  url: string;
  embed?: boolean;
  params?: Record<string, string>;
};

export type HookResyncStep = HookOpenStep & {
  initiate?: HookHttpStep;
};

export type HookDescriptor = {
  initiate?: HookHttpStep;
  open: HookOpenStep;
  resync?: HookResyncStep;
  disconnect?: HookHttpStep;
};

export interface HookContext {
  apiEndpoint: string;
  returnUrl: string;
  mode: 'connect' | 'resync';
  embeddable: boolean;
}

export interface HookResult {
  mode: 'iframe' | 'redirect';
  finalUrl: string;
  allowedOrigin: string;
}

export class UnresolvedVariableError extends Error {
  readonly variable: string;
  constructor (variable: string) {
    super(`unresolved variable: \${${variable}}`);
    this.name = 'UnresolvedVariableError';
    this.variable = variable;
  }
}

export class HookInitiateError extends Error {
  readonly reason: string;
  constructor (reason: string, options?: ErrorOptions) {
    super(`hook initiate failed: ${reason}`, options);
    this.name = 'HookInitiateError';
    this.reason = reason;
  }
}

const VARIABLE_PATTERN = /\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

export function expand (template: string, vars: Record<string, string>): string {
  return template.replace(VARIABLE_PATTERN, (_match, name: string) => {
    const val = vars[name];
    if (val === undefined) throw new UnresolvedVariableError(name);
    return val;
  });
}

export async function executeHook (hook: HookDescriptor, ctx: HookContext): Promise<HookResult> {
  const vars: Record<string, string> = {
    apiEndpoint: ctx.apiEndpoint,
    returnUrl: ctx.returnUrl
  };

  const useResync = ctx.mode === 'resync' && hook.resync != null;
  const initiateStep: HookHttpStep | undefined = useResync ? hook.resync?.initiate : hook.initiate;
  const openStep: HookOpenStep = useResync ? (hook.resync as HookOpenStep) : hook.open;

  if (initiateStep != null) {
    await runInitiate(initiateStep, vars);
  }

  const expandedUrl = expand(openStep.url, vars);
  const finalUrl = appendParams(expandedUrl, openStep.params, vars);
  const allowedOrigin = new URL(finalUrl).origin;
  const isEmbedded = openStep.embed === true && ctx.embeddable;
  return {
    mode: isEmbedded ? 'iframe' : 'redirect',
    finalUrl,
    allowedOrigin
  };
}

// Best-effort: disconnect must always succeed locally, so errors are logged and swallowed.
export async function executeDisconnect (hook: HookDescriptor, ctx: HookContext): Promise<void> {
  const step = hook.disconnect;
  if (step == null) return;
  const vars: Record<string, string> = {
    apiEndpoint: ctx.apiEndpoint,
    returnUrl: ctx.returnUrl
  };
  try {
    const res = await runHttpStep(step, vars);
    if (!res.ok) logger.warn(`hookExecutor: disconnect HTTP ${res.status} (swallowed)`);
  } catch (err) {
    logger.warn('hookExecutor: disconnect error (swallowed):', err);
  }
}

async function runInitiate (step: HookHttpStep, vars: Record<string, string>): Promise<void> {
  let res: Response;
  try {
    res = await runHttpStep(step, vars);
  } catch (err) {
    if (err instanceof UnresolvedVariableError) throw err;
    throw new HookInitiateError(`network: ${err instanceof Error ? err.message : String(err)}`, { cause: err as Error });
  }
  if (!res.ok) {
    throw new HookInitiateError(`HTTP ${res.status}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new HookInitiateError(`invalid JSON: ${err instanceof Error ? err.message : String(err)}`, { cause: err as Error });
  }
  if (json == null || typeof json !== 'object') {
    throw new HookInitiateError('response is not an object');
  }
  const field = step.openUrlField ?? 'openUrl';
  const value = (json as Record<string, unknown>)[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new HookInitiateError(`response.${field} missing or not a string`);
  }
  vars.openUrl = value;
}

async function runHttpStep (step: HookHttpStep, vars: Record<string, string>): Promise<Response> {
  const method = step.method ?? 'POST';
  const url = expand(step.url, vars);
  const headers: Record<string, string> = {};
  if (step.body != null) headers['content-type'] = 'application/json';
  if (step.auth != null) headers['Authorization'] = expand(step.auth, vars);
  const body = step.body != null ? JSON.stringify(expandBody(step.body, vars)) : undefined;
  return await fetch(url, { method, headers, body });
}

function expandBody (body: Record<string, unknown>, vars: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    out[k] = typeof v === 'string' ? expand(v, vars) : v;
  }
  return out;
}

function appendParams (url: string, params: Record<string, string> | undefined, vars: Record<string, string>): string {
  if (params == null || Object.keys(params).length === 0) return url;
  const parsed = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    parsed.searchParams.set(k, expand(v, vars));
  }
  return parsed.toString();
}
