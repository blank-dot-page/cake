import { describe, expect, it } from "vitest";
import { createRuntimeV3 } from "../../core/runtime";
import { boldExtension } from "./bold";

describe("bold extension", () => {
  it("parses and serializes bold wrappers", () => {
    const runtime = createRuntimeV3([boldExtension]);
    const source = "**bold**";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });

  it("collapses empty bold wrappers", () => {
    const runtime = createRuntimeV3([boldExtension]);
    const state = runtime.createState("****");
    expect(state.source).toBe("");
  });
});
