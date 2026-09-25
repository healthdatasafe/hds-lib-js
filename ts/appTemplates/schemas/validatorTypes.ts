/**
 * Minimal local stand-ins for the Ajv types the loader used to import.
 *
 * `ajv` is a devDependency now (B-2026-09-23-1): the validator is precompiled at build
 * time, so nothing in `ts/` may import from `ajv` — a type-only import would still put
 * `ajv` in the emitted `.d.ts`, and every consumer type-checking against `hds-lib` would
 * need a package the runtime no longer uses.
 *
 * Only the two fields the loader actually reads are declared. This is deliberately not a
 * faithful copy of Ajv's `ErrorObject`.
 */

/** One schema validation failure, as produced by the precompiled validator. */
export interface SchemaValidationError {
  /** JSON Pointer to the offending value, e.g. `/sections/0/key`. Empty for the root. */
  instancePath?: string;
  /** Human-readable description, e.g. `must be string`. */
  message?: string;
}
