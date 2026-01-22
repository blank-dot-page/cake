import { describe, expect, it } from "vitest";
import { createRuntime } from "../../core/runtime";
import { boldExtension } from "./bold";

describe("bold extension", () => {
  it("parses and serializes bold wrappers", () => {
    const runtime = createRuntime([boldExtension]);
    const source = "**bold**";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });

  it("collapses empty bold wrappers", () => {
    const runtime = createRuntime([boldExtension]);
    const state = runtime.createState("****");
    expect(state.source).toBe("");
  });
});
