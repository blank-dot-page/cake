import { describe, expect, it } from "vitest";
import { createRuntimeForTests } from "../../core/runtime";
import { combinedEmphasisExtension } from "../combined-emphasis/combined-emphasis";
import { italicExtension } from "../italic/italic";
import { boldExtension } from "./bold";

describe("bold extension", () => {
  it("parses and serializes bold wrappers", () => {
    const runtime = createRuntimeForTests([boldExtension]);
    const source = "**bold**";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });

  it("collapses empty bold wrappers", () => {
    const runtime = createRuntimeForTests([boldExtension]);
    const state = runtime.createState("****");
    expect(state.source).toBe("");
  });

  it("round-trips bold with italic markers inside (odd single asterisk count)", () => {
    const runtime = createRuntimeForTests([
      combinedEmphasisExtension,
      boldExtension,
      italicExtension,
    ]);
    const source = "**bold*italics***";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });

  it("round-trips bold with italic span followed by bold-only text", () => {
    const runtime = createRuntimeForTests([
      combinedEmphasisExtension,
      boldExtension,
      italicExtension,
    ]);
    const source = "**bold*italics*plain**";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });
});
