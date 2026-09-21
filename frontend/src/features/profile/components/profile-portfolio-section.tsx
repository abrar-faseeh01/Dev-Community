import type { PortfolioProject } from "@/features/profile/types/profile";

function formatProjectDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  });
}

export function ProfilePortfolioSection({
  projects,
}: {
  projects: PortfolioProject[];
}) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        Portfolio projects
      </h3>
      {projects.length === 0 ? (
        <p className="text-sm text-muted">
          No portfolio projects yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.map((p) => (
            <div
              key={p._id ?? p.title}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {p.title}
                </p>
                <p className="text-xs text-muted">
                  {formatProjectDate(p.startDate)} –{" "}
                  {p.isCurrent
                    ? "Present"
                    : p.endDate
                      ? formatProjectDate(p.endDate)
                      : ""}
                </p>
              </div>
              {p.description && (
                <p className="mt-2 text-sm text-foreground">
                  {p.description}
                </p>
              )}
              {p.technologies.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.technologies.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-foreground"
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
                  className="text-accent hover:underline"
                >
                  Live demo
                </a>
                <a
                  href={p.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
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
