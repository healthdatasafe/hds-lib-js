// GENERATED FILE — DO NOT EDIT. Regenerate: npm run build:validators
import type { AppTemplate } from '../templateTypes.ts';
import type { SchemaValidationError } from './validatorTypes.ts';

/** Precompiled Ajv validator. Returns false and populates `.errors` on failure. */
export interface PrecompiledValidator {
  (data: unknown): data is AppTemplate;
  errors?: SchemaValidationError[] | null;
}

export const validate: PrecompiledValidator;
export default validate;
