import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ValidateIf } from 'class-validator';

/**
 * For optional text fields with a format (email, GSTIN ...): the field may be left out,
 * or sent as "" to clear the stored value; anything else must pass the validators that follow.
 * Services turn "" into null with `clean()`.
 */
export function OptionalOrEmpty() {
  return applyDecorators(
    Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value)),
    ValidateIf((_object, value) => value !== undefined && value !== null && value !== ''),
  );
}
