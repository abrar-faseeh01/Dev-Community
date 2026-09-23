type AvatarProps = {
  // The author's display name — "Deleted user" for a deleted account, same
  // as everywhere else that renders AuthorSummary.fullName. Purely
  // client-derived: no id, no image, no new field or endpoint.
  name: string;
  size?: "sm" | "md";
  className?: string;
};

// A fixed palette, picked by a deterministic hash of the name so the same
// person always gets the same color across renders and pages, without
// storing anything. Colors are dark-theme-only (used against the dark
// cards on Post Detail and in the comment thread today).
const PALETTE = [
  { bg: "bg-violet-500/20", text: "text-violet-300" },
  { bg: "bg-emerald-500/20", text: "text-emerald-300" },
  { bg: "bg-sky-500/20", text: "text-sky-300" },
  { bg: "bg-amber-500/20", text: "text-amber-300" },
  { bg: "bg-rose-500/20", text: "text-rose-300" },
  { bg: "bg-teal-500/20", text: "text-teal-300" },
];

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
};

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// First + last initial (e.g. "Ada Okafor" -> "AO"), matching the mockups.
// A single-word name (or "Deleted user" — treated the same as any other
// two-word name) falls back gracefully to just its first letter.
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

// Decorative only — the name this is derived from is always rendered as
// real text right next to it, so a screen reader announcing the initials
// too would just be a redundant echo of the same name.
export function Avatar({ name, size = "sm", className = "" }: AvatarProps) {
  const { bg, text } = PALETTE[hashName(name) % PALETTE.length];

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${bg} ${text} ${SIZE_CLASSES[size]} ${className}`}
    >
      {initialsFor(name)}
    </span>
  );
}
