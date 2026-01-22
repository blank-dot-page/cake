import { describe, it, expect } from "vitest";
import { createRuntimeV3 } from "../../core/runtime";
import { pipeLinkExtension } from "./pipe-link";

describe("pipe-link extension", () => {
  const runtime = createRuntimeV3([pipeLinkExtension]);

  it("has renderInline method", () => {
    expect(typeof pipeLinkExtension.renderInline).toBe("function");
  });

  it("parses pipe-link format", () => {
    const doc = runtime.parse("|link|https://example.com|");
    expect(doc.blocks.length).toBe(1);
    const block = doc.blocks[0];
    expect(block.type).toBe("paragraph");
    if (block.type === "paragraph") {
      expect(block.content.length).toBe(1);
      const inline = block.content[0];
      expect(inline.type).toBe("inline-wrapper");
      if (inline.type === "inline-wrapper") {
        expect(inline.kind).toBe("pipe-link");
        expect(inline.data).toEqual({ url: "https://example.com" });
        expect(inline.children.length).toBe(1);
        const child = inline.children[0];
        expect(child.type).toBe("text");
        if (child.type === "text") {
          expect(child.text).toBe("link");
        }
      }
    }
  });

  it("parses pipe-link with surrounding text", () => {
    const doc = runtime.parse("See |link|https://example.com| here");
    expect(doc.blocks.length).toBe(1);
    const block = doc.blocks[0];
    expect(block.type).toBe("paragraph");
    if (block.type === "paragraph") {
      // Runtime parses text character-by-character, so we'll have many text nodes
      // plus the pipe-link. What matters is the pipe-link is recognized.
      const pipeLinkInline = block.content.find(
        (inline) =>
          inline.type === "inline-wrapper" && inline.kind === "pipe-link",
      );
      expect(pipeLinkInline).toBeDefined();
      if (
        pipeLinkInline &&
        pipeLinkInline.type === "inline-wrapper" &&
        pipeLinkInline.kind === "pipe-link"
      ) {
        expect(pipeLinkInline.data).toEqual({ url: "https://example.com" });
      }
    }
  });

  it("serializes pipe-link back to source", () => {
    const doc = runtime.parse("|link|https://example.com|");
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe("|link|https://example.com|");
  });

  it("serializes pipe-link with surrounding text", () => {
    const doc = runtime.parse("See |link|https://example.com| here");
    const serialized = runtime.serialize(doc);
    expect(serialized.source).toBe("See |link|https://example.com| here");
  });

  it("createState preserves pipe-link in normalized doc", () => {
    const state = runtime.createState("|link|https://example.com|");
    const block = state.doc.blocks[0];
    expect(block.type).toBe("paragraph");
    if (block.type === "paragraph") {
      expect(block.content.length).toBe(1);
      const inline = block.content[0];
      expect(inline.type).toBe("inline-wrapper");
      if (inline.type === "inline-wrapper") {
        expect(inline.kind).toBe("pipe-link");
        expect(inline.data).toEqual({ url: "https://example.com" });
      }
    }
  });
});
