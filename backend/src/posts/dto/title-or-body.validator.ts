import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// No @IsOptional() on the field carrying this constraint — same reasoning
// as end-date.validator.ts's EndDateConstraint: this must run even when
// title is entirely absent, since "both title and body absent" is itself
// the failure case, and @IsOptional() would gate this custom validator
// away exactly when it's needed (it gates every decorator on a property
// uniformly, not just the built-in ones). Because of that, title's own
// "if present, must be a non-empty string ≤200 chars" check is done
// inline here too, rather than composed via separate @IsString()/
// @MaxLength() decorators that @IsOptional() would otherwise be needed
// (and unable) to guard.
@ValidatorConstraint({ name: 'isTitleValidOrBodyProvided', async: false })
export class TitleOrBodyConstraint implements ValidatorConstraintInterface {
  private lastError = 'title is invalid';

  validate(title: unknown, args: ValidationArguments): boolean {
    const dto = args.object as { body?: unknown };

    if (title === undefined) {
      if (dto.body === undefined) {
        this.lastError = 'At least one of title or body must be provided';
        return false;
      }
      return true;
    }

    if (typeof title !== 'string') {
      this.lastError = 'title must be a string';
      return false;
    }
    if (title.length === 0) {
      this.lastError = 'title should not be empty';
      return false;
    }
    if (title.length > 200) {
      this.lastError = 'title must be shorter than or equal to 200 characters';
      return false;
    }

    return true;
  }

  defaultMessage(): string {
    return this.lastError;
  }
}
