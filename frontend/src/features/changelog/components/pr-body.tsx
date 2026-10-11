"use client";

import { useState } from "react";

// A PR description is untrusted text written on GitHub, so it is shown as
// plain text. React escapes it, which means "<script>" is displayed, never run,
// and no renderer or sanitizer is needed. The backend already caps the body
// at 10,000 characters.
const COLLAPSED_CHARS = 600;

export function PrBody({ body }: { body?: string }) {
  const [expanded, setExpanded] = useState(false);
  const text = (body ?? "").trim();

  if (!text) {
    return (
      <p className="text-sm italic text-neutral-500">
        This pull request has no description.
      </p>
    );
  }

  const long = text.length > COLLAPSED_CHARS;
  const collapsed = long && !expanded;

  return (
    <div>
      <div className="relative">
        <p
          className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-300 ${
            collapsed ? "max-h-40 overflow-hidden" : ""
          }`}
        >
          {text}
        </p>
        {collapsed && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-neutral-900 to-transparent"
          />
        )}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 text-sm font-medium text-emerald-400 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
