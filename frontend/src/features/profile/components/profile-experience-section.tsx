import { ROUTES } from "@/constants/routes";
import type { Experience } from "@/features/profile/types/profile";
import Link from "next/link";

export function ProfileExperienceSection({
  profileId,
  experiences,
  canEdit,
}: {
  profileId: string;
  experiences: Experience[];
  canEdit: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">
          Experience
        </h3>
        {canEdit && (
          <Link
            href={ROUTES.profileEditExperience(profileId)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Edit experience
          </Link>
        )}
      </div>
      {experiences.length === 0 ? (
        <p className="text-sm text-muted">
          No experience listed yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {experiences.map((exp) => (
            <div
              key={exp._id ?? `${exp.title}-${exp.company}`}
              className="rounded-lg border border-border bg-background p-4"
            >
              <p className="text-sm font-semibold text-foreground">
                {exp.title}
              </p>
              <p className="text-sm text-muted">
                {exp.company} · {exp.from} – {exp.to || "Present"}
              </p>
              {exp.description && (
                <p className="mt-2 text-sm text-foreground">
                  {exp.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
