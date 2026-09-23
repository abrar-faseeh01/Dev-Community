// A small, in-house line-level diff for the audit log's Before/After panels.
// No npm dependency — the inputs are small (a few dozen lines of formatted
// JSON at most), so a plain O(n*m) LCS table is more than fast enough and
// keeps this auditable without pulling in a general-purpose diff library.

// Recursively sorts object keys (arrays keep their order — order is
// meaningful there) so two states that differ only in key order never show
// up as a change.
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

// Exported so the "don't diff" path (either side null) can still render the
// side that exists with the same canonical, stable formatting.
export function stableStringify(value: Record<string, unknown>): string {
  return JSON.stringify(sortKeysDeep(value), null, 2);
}

type LineOp =
  | { kind: "equal"; line: string }
  | { kind: "delete"; line: string }
  | { kind: "insert"; line: string };

// Classic LCS backtrack, line-by-line. dp[i][j] = LCS length of a[i:] vs
// b[j:], built bottom-up so the backtrack can walk forward from (0, 0).
function diffLines(a: string[], b: string[]): LineOp[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "equal", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: "delete", line: a[i] });
      i++;
    } else {
      ops.push({ kind: "insert", line: b[j] });
      j++;
    }
  }
  while (i < n) {
    ops.push({ kind: "delete", line: a[i] });
    i++;
  }
  while (j < m) {
    ops.push({ kind: "insert", line: b[j] });
    j++;
  }
  return ops;
}

export type DiffCell = { text: string; changed: boolean } | null;

export type DiffRow = { before: DiffCell; after: DiffCell };

// Groups the raw op sequence into side-by-side rows: an "equal" op is one
// row with the same line on both sides; a run of consecutive delete/insert
// ops (a changed block) is zipped pairwise into rows, with a blank (null)
// filler cell on whichever side runs out first, so the two columns stay
// line-aligned even when a block replaces N lines with M.
function toRows(ops: LineOp[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let i = 0;
  while (i < ops.length) {
    const op = ops[i];
    if (op.kind === "equal") {
      rows.push({
        before: { text: op.line, changed: false },
        after: { text: op.line, changed: false },
      });
      i++;
      continue;
    }

    const deletes: string[] = [];
    const inserts: string[] = [];
    while (i < ops.length && ops[i].kind !== "equal") {
      const current = ops[i];
      if (current.kind === "delete") deletes.push(current.line);
      else inserts.push(current.line);
      i++;
    }

    const max = Math.max(deletes.length, inserts.length);
    for (let k = 0; k < max; k++) {
      rows.push({
        before: k < deletes.length ? { text: deletes[k], changed: true } : null,
        after: k < inserts.length ? { text: inserts[k], changed: true } : null,
      });
    }
  }
  return rows;
}

// Line-level diff of two audit states, aligned for a side-by-side view.
// Returns null when either side is null/missing — the caller shows that
// side plainly (via stableStringify) instead of diffing, per the audit log's
// existing behavior for actions like delete_post where one side never
// exists.
export function diffAuditStates(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): DiffRow[] | null {
  if (!before || !after) return null;
  const beforeLines = stableStringify(before).split("\n");
  const afterLines = stableStringify(after).split("\n");
  return toRows(diffLines(beforeLines, afterLines));
}
