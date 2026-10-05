import "@testing-library/jest-dom";

// jsdom doesn't implement scrollIntoView at all (real browsers do) — stubbed
// globally so any component that calls it (e.g. comment-focus-handler.tsx)
// doesn't throw "not a function" in tests. Guarded because a spec can opt into
// the node environment (see src/middleware.test.ts), where there is no DOM.
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = jest.fn();
}
