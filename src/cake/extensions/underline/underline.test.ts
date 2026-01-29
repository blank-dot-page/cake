import { describe, expect, it } from "vitest";
import { createRuntime } from "../../core/runtime";
import { underlineExtension } from "./underline";

describe("underline extension", () => {
  it("parses and serializes underline wrappers", () => {
    const runtime = createRuntime([underlineExtension]);
    const source = "<u>underline</u>";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });

  it("parses underline in context", () => {
    const runtime = createRuntime([underlineExtension]);
    const source = "This is <u>important</u> text";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });

  it("collapses empty underline wrappers", () => {
    const runtime = createRuntime([underlineExtension]);
    const state = runtime.createState("<u></u>");
    expect(state.source).toBe("");
  });

  it("parses multiple underline spans", () => {
    const runtime = createRuntime([underlineExtension]);
    const source = "<u>first</u> and <u>second</u>";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });

  it("does not parse unclosed underline tags", () => {
    const runtime = createRuntime([underlineExtension]);
    const source = "<u>unclosed";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });

  it("does not parse mismatched tags", () => {
    const runtime = createRuntime([underlineExtension]);
    const source = "<u>text</b>";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });
});
