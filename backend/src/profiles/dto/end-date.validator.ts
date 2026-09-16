import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Encodes all three conditional rules around endDate/isCurrent/startDate in
// one place, keyed off the endDate property (no @IsOptional() here — this
// must run even when endDate is entirely absent, since "absent" is itself
// invalid when isCurrent is false).
//
// - isCurrent: true  -> endDate must NOT be provided at all (400, not a
//   silent strip — the schema/DTO never gets a chance to drop it quietly).
// - isCurrent: false -> endDate is required and must be a valid date.
// - whenever endDate is present -> it must not be earlier than startDate.
@ValidatorConstraint({ name: 'isEndDateValid', async: false })
export class EndDateConstraint implements ValidatorConstraintInterface {
  // class-validator calls validate() then defaultMessage() back-to-back,
  // synchronously, for the same failure — safe to stash the specific
  // reason here rather than re-deriving a generic message in defaultMessage().
  private lastError = 'endDate is invalid';

  validate(endDate: unknown, args: ValidationArguments): boolean {
    const dto = args.object as { isCurrent?: boolean; startDate?: string };

    if (dto.isCurrent === true) {
      if (endDate !== undefined && endDate !== null) {
        this.lastError = 'endDate must not be provided when isCurrent is true';
        return false;
      }
      return true;
    }

    // isCurrent is false (or missing/malformed — @IsBoolean() on isCurrent
    // reports that separately) — endDate is required.
    if (endDate === undefined || endDate === null || endDate === '') {
      this.lastError = 'endDate is required when isCurrent is false';
      return false;
    }

    if (typeof endDate !== 'string' || isNaN(Date.parse(endDate))) {
      this.lastError = 'endDate must be a valid date string';
      return false;
    }

    if (dto.startDate && !isNaN(Date.parse(dto.startDate))) {
      if (new Date(endDate) < new Date(dto.startDate)) {
        this.lastError = 'endDate must not be earlier than startDate';
        return false;
      }
    }

    return true;
  }

  defaultMessage(): string {
    return this.lastError;
  }
}
