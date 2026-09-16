import { IsOptional, IsString } from 'class-validator';

// Shared across feature modules by DELETE endpoints (and other bodyless
// admin-override actions) that otherwise take no body — only meaningful
// when an admin acts on someone else's data, recorded on the audit log
// entry.
export class ReasonDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
