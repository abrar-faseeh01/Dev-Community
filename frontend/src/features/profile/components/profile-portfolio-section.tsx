import type { PortfolioProject } from "@/features/profile/types/profile";
import Link from "next/link";

function formatProjectDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
}

export function ProfilePortfolioSection({
  projects,
  editHref,
}: {
  projects: PortfolioProject[];
  // Same optional-edit-link pattern as ProfileExperienceSection's
  // "Edit experience" button — omitted, this renders exactly as before.
  editHref?: string;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-white">
          Portfolio projects
        </h3>
        {editHref && (
          <Link
            href={editHref}
            className="text-sm font-medium text-emerald-400 hover:underline"
          >
            Edit
          </Link>
        )}
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-neutral-400">
          No portfolio projects yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.map((p) => (
            <div
              key={p._id ?? p.title}
              className="rounded-lg border border-neutral-800 bg-neutral-950 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">
                  {p.title}
                </p>
                <p className="text-xs text-neutral-400">
                  {formatProjectDate(p.startDate)} –{" "}
                  {p.isCurrent
                    ? "Present"
                    : p.endDate
                      ? formatProjectDate(p.endDate)
                      : ""}
                </p>
              </div>
              {p.description && (
                <p className="mt-2 text-sm text-neutral-200">
                  {p.description}
                </p>
              )}
              {p.technologies.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.technologies.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-0.5 text-xs font-medium text-white"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-4 text-sm font-medium">
                <a
                  href={p.liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  Live demo
                </a>
                <a
                  href={p.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  GitHub
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
