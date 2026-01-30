import { describe, expect, it } from "vitest";
import { createRuntimeForTests } from "../../core/runtime";
import { italicExtension } from "./italic";

describe("italic extension", () => {
  it("parses and serializes italic wrappers with underscore", () => {
    const runtime = createRuntimeForTests([italicExtension]);
    const source = "_italic_";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    // Serialization always uses asterisk (v1 parity)
    expect(serialized.source).toBe("*italic*");
  });

  it("parses italic wrappers with asterisk", () => {
    const runtime = createRuntimeForTests([italicExtension]);
    const source = "*italic*";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    // Serialization always uses asterisk (v1 parity)
    expect(serialized.source).toBe("*italic*");
  });

  it("parses asterisk italic in context", () => {
    const runtime = createRuntimeForTests([italicExtension]);
    const source = "This is *realy* important";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    // Serialization always uses asterisk (v1 parity)
    expect(serialized.source).toBe("This is *realy* important");
  });

  it("collapses empty italic wrappers", () => {
    const runtime = createRuntimeForTests([italicExtension]);
    const state = runtime.createState("__");
    expect(state.source).toBe("");
  });

  it("does not parse double asterisk as empty italic (reserved for bold)", () => {
    const runtime = createRuntimeForTests([italicExtension]);
    const state = runtime.createState("**");
    // ** is reserved for bold, so it stays as plain text
    expect(state.source).toBe("**");
  });
});
