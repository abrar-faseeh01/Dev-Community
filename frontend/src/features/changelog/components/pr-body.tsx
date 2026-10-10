"use client";

import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// A PR description is untrusted text from GitHub. react-markdown does not
// render raw HTML (no rehype-raw) and rewrites unsafe URLs such as
// javascript:, so the only extra step here is dropping images, which would
// otherwise make every visitor's browser fetch an address the PR author chose.
const COLLAPSED_CHARS = 600;

const components: Components = {
  h1: (p) => <h3 className="mt-4 text-base font-semibold text-white" {...strip(p)} />,
  h2: (p) => <h3 className="mt-4 text-sm font-semibold text-white" {...strip(p)} />,
  h3: (p) => <h4 className="mt-3 text-sm font-semibold text-neutral-200" {...strip(p)} />,
  h4: (p) => <h4 className="mt-3 text-sm font-semibold text-neutral-200" {...strip(p)} />,
  h5: (p) => <h4 className="mt-3 text-sm font-semibold text-neutral-200" {...strip(p)} />,
  h6: (p) => <h4 className="mt-3 text-sm font-semibold text-neutral-200" {...strip(p)} />,
  p: (p) => <p className="mt-2 leading-relaxed" {...strip(p)} />,
  ul: (p) => <ul className="mt-2 list-disc space-y-1 pl-5" {...strip(p)} />,
  ol: (p) => <ol className="mt-2 list-decimal space-y-1 pl-5" {...strip(p)} />,
  li: (p) => <li {...strip(p)} />,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-emerald-400 underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  code: (p) => (
    <code
      className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[0.85em] text-neutral-200"
      {...strip(p)}
    />
  ),
  pre: (p) => (
    <pre
      className="mt-2 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-950 p-3 text-xs [&>code]:bg-transparent [&>code]:p-0"
      {...strip(p)}
    />
  ),
  blockquote: (p) => (
    <blockquote
      className="mt-2 border-l-2 border-neutral-700 pl-3 text-neutral-400"
      {...strip(p)}
    />
  ),
  hr: () => <hr className="my-4 border-neutral-800" />,
  table: (p) => (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs" {...strip(p)} />
    </div>
  ),
  th: (p) => (
    <th className="border border-neutral-800 px-2 py-1 font-semibold" {...strip(p)} />
  ),
  td: (p) => <td className="border border-neutral-800 px-2 py-1" {...strip(p)} />,
  input: ({ checked }) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      disabled
      readOnly
      className="mr-2 accent-emerald-400"
    />
  ),
};

// react-markdown passes the parsed `node` to every component; it must not end
// up as a DOM attribute.
function strip<T extends object>(props: T): Omit<T, "node"> {
  const rest = { ...props } as T & { node?: unknown };
  delete rest.node;
  return rest;
}

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
      <div
        className={`relative text-sm text-neutral-300 ${
          collapsed ? "max-h-40 overflow-hidden" : ""
        }`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          disallowedElements={["img"]}
          components={components}
        >
          {text}
        </ReactMarkdown>
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
