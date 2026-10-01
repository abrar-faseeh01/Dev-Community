import { splitSummaryIntoBullets } from "./summary-bullets";

describe("splitSummaryIntoBullets", () => {
  it("splits sentences into separate points", () => {
    expect(
      splitSummaryIntoBullets(
        "Explains useState. Contrasts it with the DOM! Why use Vite?",
      ),
    ).toEqual([
      "Explains useState.",
      "Contrasts it with the DOM!",
      "Why use Vite?",
    ]);
  });

  it("keeps a single sentence as one point", () => {
    expect(splitSummaryIntoBullets("Just one sentence.")).toEqual([
      "Just one sentence.",
    ]);
  });

  it("does not split inside names like Next.js or node.js", () => {
    expect(
      splitSummaryIntoBullets("Next.js handles routing. It uses node.js."),
    ).toEqual(["Next.js handles routing.", "It uses node.js."]);
  });

  it("starts a new point at a line break", () => {
    expect(splitSummaryIntoBullets("First line\nSecond line")).toEqual([
      "First line",
      "Second line",
    ]);
  });

  it("trims whitespace and ignores blank lines and extra spaces", () => {
    expect(splitSummaryIntoBullets("  One.   Two.\n\n  Three.  ")).toEqual([
      "One.",
      "Two.",
      "Three.",
    ]);
  });

  it("returns text without sentence marks as a single point", () => {
    expect(splitSummaryIntoBullets("no punctuation here")).toEqual([
      "no punctuation here",
    ]);
  });

  it("never returns an empty list", () => {
    expect(splitSummaryIntoBullets("   ")).toEqual([""]);
  });

  it("leaves markup as plain text", () => {
    expect(splitSummaryIntoBullets("<b>Hi</b>. **bold** <i>x</i>")).toEqual([
      "<b>Hi</b>.",
      "**bold** <i>x</i>",
    ]);
  });
});
