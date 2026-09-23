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
        <h3 className="text-sm font-semibold text-white">
          Experience
        </h3>
        {canEdit && (
          <Link
            href={ROUTES.profileEditExperience(profileId)}
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-300"
          >
            Edit experience
          </Link>
        )}
      </div>
      {experiences.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No experience listed yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {experiences.map((exp) => (
            <div
              key={exp._id ?? `${exp.title}-${exp.company}`}
              className="rounded-lg border border-neutral-800 bg-neutral-950 p-4"
            >
              <p className="text-sm font-semibold text-white">
                {exp.title}
              </p>
              <p className="text-sm text-neutral-400">
                {exp.company} · {exp.from} – {exp.to || "Present"}
              </p>
              {exp.description && (
                <p className="mt-2 text-sm text-neutral-200">
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
