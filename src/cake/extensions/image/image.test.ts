import { describe, test, expect } from "vitest";
import { createRuntimeForTests } from "../../core/runtime";
import { imageExtension } from "./image";

describe("image extension", () => {
  describe("parseBlock", () => {
    test("parses image with alt and url", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const doc = runtime.parse("![alt text](https://example.com/image.png)");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "image",
        data: {
          status: "ready",
          alt: "alt text",
          url: "https://example.com/image.png",
        },
      });
    });

    test("parses image with empty alt", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const doc = runtime.parse("![](https://example.com/image.png)");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "image",
        data: {
          status: "ready",
          alt: "",
          url: "https://example.com/image.png",
        },
      });
    });

    test("parses uploading image", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const doc = runtime.parse("![uploading:abc123]()");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "image",
        data: {
          status: "uploading",
          id: "abc123",
        },
      });
    });

    test("does not parse inline image syntax", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const doc = runtime.parse("text ![alt](url) more text");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("does not parse image without closing bracket", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const doc = runtime.parse("![alt](url");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("does not parse plain text", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const doc = runtime.parse("hello world");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("parses multiple images", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const doc = runtime.parse("![a](url1)\n![b](url2)");
      expect(doc.blocks).toHaveLength(2);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "image",
        data: { status: "ready", alt: "a", url: "url1" },
      });
      expect(doc.blocks[1]).toMatchObject({
        type: "block-atom",
        kind: "image",
        data: { status: "ready", alt: "b", url: "url2" },
      });
    });

    test("parses image with simple url", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const doc = runtime.parse("![alt](url)");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "image",
        data: {
          status: "ready",
          alt: "alt",
          url: "url",
        },
      });
    });
  });

  describe("serializeBlock", () => {
    test("serializes ready image", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const doc = runtime.parse("![alt](https://example.com/image.png)");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("![alt](https://example.com/image.png)");
    });

    test("serializes image with empty alt", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const doc = runtime.parse("![](https://example.com/image.png)");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("![](https://example.com/image.png)");
    });

    test("serializes uploading image", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const doc = runtime.parse("![uploading:abc123]()");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("![uploading:abc123]()");
    });

    test("round-trips ready image", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const source = "![photo](https://example.com/photo.jpg)";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    test("round-trips multiple images", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const source = "![a](url1)\n![b](url2)";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("cursor mapping", () => {
    test("image block-atom occupies one cursor position", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const state = runtime.createState("![alt](url)");
      expect(state.map.cursorLength).toBe(1);
    });

    test("uploading image occupies one cursor position", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const state = runtime.createState("![uploading:abc]()");
      expect(state.map.cursorLength).toBe(1);
    });

    test("multiple images expose both atom positions and the newline between them", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const state = runtime.createState("![a](url1)\n![b](url2)");
      expect(state.map.cursorLength).toBe(3);
    });
  });

  describe("block-atom runtime behavior", () => {
    test("backspace on an image deletes it", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const state = runtime.createState("![alt](url)\ntext", {
        start: 1,
        end: 1,
      });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("text");
      expect(nextState.selection).toEqual({
        start: 0,
        end: 0,
        affinity: "forward",
      });
    });

    test("enter on an image inserts a paragraph after it", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const state = runtime.createState("![alt](url)", {
        start: 0,
        end: 0,
      });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("![alt](url)\n");
      expect(nextState.selection).toEqual({
        start: 2,
        end: 2,
        affinity: "forward",
      });
    });

    test("enter at the trailing cursor of a trailing image inserts a paragraph after it", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const initialState = runtime.createState("text\n![alt](url)");
      const state = runtime.createState("text\n![alt](url)", {
        start: initialState.map.cursorLength,
        end: initialState.map.cursorLength,
        affinity: "forward",
      });

      const nextState = runtime.applyEdit({ type: "insert-line-break" }, state);

      expect(nextState.source).toBe("text\n![alt](url)\n");
      expect(nextState.selection).toEqual({
        start: 7,
        end: 7,
        affinity: "forward",
      });
    });

    test("backspace on an empty paragraph after an image moves selection onto the image", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const state = runtime.createState("![alt](url)\n", {
        start: 2,
        end: 2,
      });

      const nextState = runtime.applyEdit({ type: "delete-backward" }, state);

      expect(nextState.source).toBe("![alt](url)");
      expect(nextState.selection).toEqual({
        start: 0,
        end: 0,
        affinity: "backward",
      });
    });
  });

  describe("normalizeBlock", () => {
    test("normalizes images produced by parsing", () => {
      const runtime = createRuntimeForTests([imageExtension]);
      const state = runtime.createState("![alt](url)");
      expect(state.doc.blocks[0]).toMatchObject({
        type: "block-atom",
        kind: "image",
      });
    });
  });
});
