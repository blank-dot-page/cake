import { describe, expect, it } from "vitest";
import { createRuntimeForTests } from "../../core/runtime";
import { blockquoteExtension } from "./blockquote";

describe("blockquote extension", () => {
  it("parses and serializes single-line blockquotes", () => {
    const runtime = createRuntimeForTests([blockquoteExtension]);
    const source = "> hello";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });
});
