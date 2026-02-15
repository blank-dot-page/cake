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

  it("does not parse underscore markers when the opener is inside a word", () => {
    const runtime = createRuntimeForTests([italicExtension]);
    const source = "hello_world_";
    const state = runtime.createState(source);

    expect(state.source).toBe(source);
    expect(state.map.cursorLength).toBe(source.length);
  });

  it("supports cmd+i typing at a word boundary by using asterisk markers", () => {
    const runtime = createRuntimeForTests([italicExtension]);
    let state = runtime.createState("hello", {
      start: 5,
      end: 5,
      affinity: "forward",
    });

    state = runtime.applyEdit({ type: "toggle-italic" }, state);
    state = runtime.applyEdit({ type: "insert", text: "world" }, state);

    expect(state.source).toBe("hello*world*");

    const rehydrated = runtime.createState(state.source);
    expect(rehydrated.source).toBe("hello*world*");
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
