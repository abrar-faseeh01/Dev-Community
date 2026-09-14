import { IsOptional, IsString } from 'class-validator';

// Shared by the two DELETE endpoints (removeExperience, deleteUser), which
// otherwise take no body — only meaningful when an admin acts on someone
// else's data, recorded on the audit log entry.
export class ReasonDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
