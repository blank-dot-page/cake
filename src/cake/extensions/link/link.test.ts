import { describe, expect, it } from "vitest";
import { createRuntimeForTests } from "../../core/runtime";
import { linkExtension } from "./link";

describe("link extension", () => {
  it("ignores image syntax when image extension is not loaded", () => {
    const runtime = createRuntimeForTests([linkExtension]);
    const source = "![alt](http://example.com/image.png)";
    const state = runtime.createState(source);
    // Image syntax should be preserved as plain text
    expect(state.source).toBe(source);
    // The cursor length should equal the source length (no hidden URL portion)
    expect(state.map.cursorLength).toBe(source.length);
  });

  it("parses and serializes links", () => {
    const runtime = createRuntimeForTests([linkExtension]);
    const source = "[word](url)";
    const doc = runtime.parse(source);
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe(source);
  });

  it("collapses empty link labels", () => {
    const runtime = createRuntimeForTests([linkExtension]);
    const state = runtime.createState("[](u)");
    expect(state.source).toBe("");
  });

  it("inserts text after link when cursor at end with forward affinity", () => {
    const runtime = createRuntimeForTests([linkExtension]);
    const state = runtime.createState("hello [world](http://test/)");

    // "hello " = 6 cursors (0-5), "[world]" = 5 cursors (6-10)
    // Cursor 11 should be the end of the link text "world"
    expect(state.map.cursorLength).toBe(11);

    // Check boundaries at cursor 11 (end of "world")
    const boundary11 = state.map.boundaries[11];
    // sourceBackward should be after 'd' in source (position 12)
    // sourceForward should be after ')' in source (position 27)
    expect(boundary11.sourceBackward).toBe(12); // after "[world"
    expect(boundary11.sourceForward).toBe(27); // after "[world](http://test/)"

    // When we insert with forward affinity, we should insert at sourceForward (position 27)
    const insertPos = state.map.cursorToSource(11, "forward");
    expect(insertPos).toBe(27); // Should insert after the link

    // Actually apply the edit and verify
    const afterInsert = runtime.applyEdit(
      { type: "insert", text: "x" },
      { ...state, selection: { start: 11, end: 11, affinity: "forward" } },
    );
    expect(afterInsert.source).toBe("hello [world](http://test/)x");
  });

  it("inserts text inside link when cursor at end with backward affinity", () => {
    const runtime = createRuntimeForTests([linkExtension]);
    const state = runtime.createState("hello [world](http://test/)");

    // When we insert with backward affinity, we should insert at sourceBackward (position 12)
    const insertPos = state.map.cursorToSource(11, "backward");
    expect(insertPos).toBe(12); // Should insert inside the link (after 'd')

    // Actually apply the edit and verify
    const afterInsert = runtime.applyEdit(
      { type: "insert", text: "x" },
      { ...state, selection: { start: 11, end: 11, affinity: "backward" } },
    );
    // x is inserted inside the link: [worldx]
    expect(afterInsert.source).toBe("hello [worldx](http://test/)");
  });

  it("inserts at cursor 10 inside link regardless of affinity", () => {
    const runtime = createRuntimeForTests([linkExtension]);
    const state = runtime.createState("hello [world](http://test/)");

    // Cursor 10 is before 'd' in "world"
    const boundary10 = state.map.boundaries[10];
    // Both backward and forward should be inside the link
    expect(boundary10.sourceBackward).toBe(11); // after 'l' in [world
    expect(boundary10.sourceForward).toBe(11);

    // Insert at cursor 10 with forward affinity
    const afterInsert = runtime.applyEdit(
      { type: "insert", text: "x" },
      { ...state, selection: { start: 10, end: 10, affinity: "forward" } },
    );
    // x is inserted between 'l' and 'd': [worlxd]
    expect(afterInsert.source).toBe("hello [worlxd](http://test/)");
  });
});
