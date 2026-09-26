import { reactionMutationKeys } from "./reaction-mutation-keys";

describe("reactionMutationKeys", () => {
  it("scopes a post target under the shared prefix", () => {
    const key = reactionMutationKeys.target("post", "p1");
    expect(key.slice(0, reactionMutationKeys.all.length)).toEqual(
      reactionMutationKeys.all,
    );
  });

  it("scopes a comment target under the same shared prefix", () => {
    const key = reactionMutationKeys.target("comment", "c1");
    expect(key.slice(0, reactionMutationKeys.all.length)).toEqual(
      reactionMutationKeys.all,
    );
  });

  it("gives different keys to different targets", () => {
    expect(reactionMutationKeys.target("post", "p1")).not.toEqual(
      reactionMutationKeys.target("post", "p2"),
    );
  });
});
