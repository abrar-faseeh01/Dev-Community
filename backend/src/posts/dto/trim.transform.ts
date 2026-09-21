import type { TransformFnParams } from 'class-transformer';

// Trims a string before validation runs. Without this, a whitespace-only
// title/body ("   ", "\n\t") passes @IsNotEmpty() — the string isn't empty —
// and only fails afterward, inside Mongoose, where the schema's `trim: true`
// reduces it to "" and the `required` check rejects it. That is a Mongoose
// ValidationError, not an HttpException, so the global filter turned it into
// a bare 500 instead of a 400 with a field message.
//
// Trimming first means @IsNotEmpty()/@MaxLength() see exactly what Mongoose
// will store (String.prototype.trim(), the same call Mongoose's `trim` uses),
// so whitespace-only input gets the same "should not be empty" 400 as "" does,
// and the length limits apply to the stored value rather than to padding.
// Non-strings pass through untouched so @IsString() still reports them.
// Relies on `transform: true` on the global ValidationPipe (main.ts).
export function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
