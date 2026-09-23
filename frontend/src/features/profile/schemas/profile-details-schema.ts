import { z } from "zod";

// Every field below defaults to a defined value ("" / [] / false), never
// undefined — the edit page's reset()/append() calls always supply a
// concrete default, which avoids inputs silently flipping from
// uncontrolled to controlled once real profile data loads.

// require_protocol equivalent: .url() alone already rejects a bare
// "example.com" (new URL() throws without a scheme), and the extra regex
// narrows it further to http(s) specifically — a portfolio "live demo" or
// "GitHub" link realistically should never be ftp:// or anything else.
const urlField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .url(`${label} must be a valid URL (including http:// or https://)`)
    .refine((value) => /^https?:\/\//i.test(value), {
      message: `${label} must be a valid URL (including http:// or https://)`,
    });

// Shared by both the "add experience" and "inline edit experience" forms.
// backend/src/profiles/dto/update-experience.dto.ts makes every field
// optional (it's a partial PATCH), but this UI always submits a full
// replacement for the one item being edited, so both forms need the same
// required fields as add-experience.dto.ts. title/company/from are only
// @IsString() backend-side (empty string would technically pass), but a
// blank required-looking field is still bad UX, so this form is stricter.
export const experienceSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  company: z.string().trim().min(1, "Company is required"),
  from: z.string().trim().min(1, "Start is required"),
  to: z.string(),
  description: z.string(),
  reason: z.string(),
});
export type ExperienceFormValues = z.infer<typeof experienceSchema>;

// Mirrors backend/src/profiles/dto/portfolio-project.dto.ts, including the
// three-rule cross-field check from end-date.validator.ts's
// EndDateConstraint (same messages, so the UX matches what the server
// would say if this validation were ever bypassed).
export const portfolioProjectSchema = z
  .object({
    // Present on projects the server returned, absent on newly appended
    // ones — kept only for identity/debugging; always stripped before a
    // PATCH is sent (the DTO has no _id field and forbidNonWhitelisted).
    _id: z.string().optional(),
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(120, "Title must be 120 characters or fewer"),
    description: z
      .string()
      .trim()
      .max(1000, "Description must be 1000 characters or fewer"),
    liveUrl: urlField("Live URL"),
    githubUrl: urlField("GitHub URL"),
    technologies: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Technology cannot be empty")
          .max(50, "Technology must be 50 characters or fewer"),
      )
      .max(20, "No more than 20 technologies"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string(),
    isCurrent: z.boolean(),
  })
  .refine((project) => !(project.isCurrent && project.endDate), {
    message: 'End date must not be set while "Current" is checked',
    path: ["endDate"],
  })
  .refine((project) => project.isCurrent || project.endDate.length > 0, {
    message: "End date is required unless this is your current project",
    path: ["endDate"],
  })
  .refine(
    (project) =>
      project.isCurrent ||
      !project.endDate ||
      !project.startDate ||
      new Date(project.endDate) >= new Date(project.startDate),
    {
      message: "End date must not be earlier than start date",
      path: ["endDate"],
    },
  );
export type PortfolioProjectFormValues = z.infer<typeof portfolioProjectSchema>;

// Mirrors backend/src/profiles/dto/update-profile.dto.ts's headline/bio
// shape plus update-portfolio-projects.dto.ts's array (this app saves
// headline/bio/portfolioProjects via the granular per-field PATCH routes,
// not the combined PATCH /profile/me, but the validation rules are the
// same DTOs either way). skills mirrors
// backend/src/profiles/dto/update-skills.dto.ts — no array size cap
// backend-side, and an empty array is a valid update (clears skills).
// skills lives on this same schema (not its own) because it now shares
// this form's single save button and dirty-field gating, same as
// headline/bio/portfolioProjects.
export const profileDetailsSchema = z.object({
  headline: z
    .string()
    .trim()
    .max(120, "Headline must be 120 characters or fewer"),
  bio: z.string().trim().max(1000, "Bio must be 1000 characters or fewer"),
  skills: z.array(z.string().trim().min(1, "Skill cannot be empty")),
  portfolioProjects: z
    .array(portfolioProjectSchema)
    .max(20, "No more than 20 portfolio projects"),
  reason: z.string(),
});
export type ProfileDetailsFormValues = z.infer<typeof profileDetailsSchema>;
