// The API returns the summary as one plain-text string of one to three
// sentences; the panel shows it as bullets. A sentence ends at . ! or ?
// followed by whitespace, so "Next.js" (a dot with no space after it) stays in
// one piece, and a line break always starts a new point. Abbreviations such as
// "e.g. " do split, which is an accepted limit of doing this on the client.
// Written without a regex lookbehind, which older Safari versions reject at
// parse time and would take the whole page down with it.
//
// The text is still untrusted: every item is rendered as a plain text node.
export function splitSummaryIntoBullets(summary: string): string[] {
  const points = summary
    .replace(/([.!?])\s+/g, "$1\n")
    .split(/\n+/)
    .map((point) => point.trim())
    .filter((point) => point.length > 0);

  // Whitespace-only input has no sentences: hand back the trimmed text so the
  // caller always has at least one item to show.
  return points.length > 0 ? points : [summary.trim()];
}
