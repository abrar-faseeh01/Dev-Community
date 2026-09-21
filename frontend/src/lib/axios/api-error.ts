// On a validation failure, backend/src/common/filters/http-exception.filter.ts
// puts class-validator's per-field messages in `errors` and a generic
// "Validation failed" in `message`. A plain `Error` would only keep
// `message`, so callers couldn't map a specific message back onto the form
// field it concerns — ApiError carries `errors` through instead.
// Still an instanceof Error, so every plain `catch` block keeps working.
//
// `status` is the HTTP status when the server responded at all, and
// undefined for a network failure (no response). Callers use it to tell "the
// server said no" (a 4xx, not worth retrying) from "couldn't reach the
// server" (worth retrying), and to react to a specific status such as 409.
export class ApiError extends Error {
  errors: string[];
  status?: number;

  constructor(message: string, errors: string[] = [], status?: number) {
    super(message);
    this.name = "ApiError";
    this.errors = errors;
    this.status = status;
  }
}
