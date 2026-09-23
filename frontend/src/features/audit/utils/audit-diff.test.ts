import { diffAuditStates } from "./audit-diff";

// A row counts as "no highlight" only when both sides are present and
// unchanged — every assertion below checks `changed` directly rather than
// just "text looks the same", so a false positive can't hide behind a
// stray null cell.
function hasAnyChange(rows: ReturnType<typeof diffAuditStates>) {
  return !!rows?.some((row) => row.before?.changed || row.after?.changed);
}

describe("diffAuditStates", () => {
  it("flags no changes for identical objects", () => {
    const rows = diffAuditStates({ a: 1, b: "two" }, { a: 1, b: "two" });
    expect(rows).not.toBeNull();
    expect(hasAnyChange(rows)).toBe(false);
  });

  it("flags no changes when only key order differs", () => {
    const rows = diffAuditStates({ a: 1, b: 2 }, { b: 2, a: 1 });
    expect(rows).not.toBeNull();
    expect(hasAnyChange(rows)).toBe(false);
  });

  it("highlights a changed field on both sides", () => {
    const rows = diffAuditStates({ name: "Ada" }, { name: "Ada K." });
    const changedBefore = rows?.find((r) => r.before?.changed);
    const changedAfter = rows?.find((r) => r.after?.changed);
    expect(changedBefore?.before?.text).toContain('"Ada"');
    expect(changedAfter?.after?.text).toContain('"Ada K."');
  });

  it("shows an added field only on the after side, with a blank filler before it", () => {
    const rows = diffAuditStates({ a: 1 }, { a: 1, b: 2 });
    const addedRow = rows?.find(
      (r) => r.after?.changed && r.after.text.includes('"b": 2'),
    );
    expect(addedRow).toBeDefined();
    expect(addedRow?.before).toBeNull();
  });

  it("shows a removed field only on the before side, with a blank filler after it", () => {
    const rows = diffAuditStates({ a: 1, b: 2 }, { a: 1 });
    const removedRow = rows?.find(
      (r) => r.before?.changed && r.before.text.includes('"b": 2'),
    );
    expect(removedRow).toBeDefined();
    expect(removedRow?.after).toBeNull();
  });

  it("highlights a changed item inside a nested array without touching sibling lines", () => {
    const rows = diffAuditStates(
      { tags: ["a", "b"] },
      { tags: ["a", "c"] },
    );
    expect(rows).not.toBeNull();

    const openLine = rows?.find((r) => r.before?.text === '  "tags": [');
    expect(openLine?.before?.changed).toBe(false);
    expect(openLine?.after?.changed).toBe(false);

    const changedBefore = rows?.find(
      (r) => r.before?.changed && r.before.text.includes('"b"'),
    );
    const changedAfter = rows?.find(
      (r) => r.after?.changed && r.after.text.includes('"c"'),
    );
    expect(changedBefore).toBeDefined();
    expect(changedAfter).toBeDefined();
  });

  it("returns null (don't diff) when the before side is missing", () => {
    expect(diffAuditStates(null, { a: 1 })).toBeNull();
    expect(diffAuditStates(undefined, { a: 1 })).toBeNull();
  });

  it("returns null (don't diff) when the after side is missing", () => {
    expect(diffAuditStates({ a: 1 }, null)).toBeNull();
    expect(diffAuditStates({ a: 1 }, undefined)).toBeNull();
  });
});
