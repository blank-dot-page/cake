import { describe, test, expect } from "vitest";
import { createRuntime } from "../../core/runtime";
import { imageExtension } from "./image";

describe("image extension", () => {
  describe("parseBlock", () => {
    test("parses image with alt and url", () => {
      const runtime = createRuntime([imageExtension]);
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
      const runtime = createRuntime([imageExtension]);
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
      const runtime = createRuntime([imageExtension]);
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
      const runtime = createRuntime([imageExtension]);
      const doc = runtime.parse("text ![alt](url) more text");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("does not parse image without closing bracket", () => {
      const runtime = createRuntime([imageExtension]);
      const doc = runtime.parse("![alt](url");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("does not parse plain text", () => {
      const runtime = createRuntime([imageExtension]);
      const doc = runtime.parse("hello world");
      expect(doc.blocks).toHaveLength(1);
      expect(doc.blocks[0]).toMatchObject({
        type: "paragraph",
      });
    });

    test("parses multiple images", () => {
      const runtime = createRuntime([imageExtension]);
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
      const runtime = createRuntime([imageExtension]);
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
      const runtime = createRuntime([imageExtension]);
      const doc = runtime.parse("![alt](https://example.com/image.png)");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("![alt](https://example.com/image.png)");
    });

    test("serializes image with empty alt", () => {
      const runtime = createRuntime([imageExtension]);
      const doc = runtime.parse("![](https://example.com/image.png)");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("![](https://example.com/image.png)");
    });

    test("serializes uploading image", () => {
      const runtime = createRuntime([imageExtension]);
      const doc = runtime.parse("![uploading:abc123]()");
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("![uploading:abc123]()");
    });

    test("round-trips ready image", () => {
      const runtime = createRuntime([imageExtension]);
      const source = "![photo](https://example.com/photo.jpg)";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    test("round-trips multiple images", () => {
      const runtime = createRuntime([imageExtension]);
      const source = "![a](url1)\n![b](url2)";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("cursor mapping", () => {
    test("image block-atom has no cursor positions", () => {
      const runtime = createRuntime([imageExtension]);
      const state = runtime.createState("![alt](url)");
      expect(state.map.cursorLength).toBe(0);
    });

    test("uploading image has no cursor positions", () => {
      const runtime = createRuntime([imageExtension]);
      const state = runtime.createState("![uploading:abc]()");
      expect(state.map.cursorLength).toBe(0);
    });

    test("multiple images have newline cursor position between them", () => {
      const runtime = createRuntime([imageExtension]);
      const state = runtime.createState("![a](url1)\n![b](url2)");
      expect(state.map.cursorLength).toBe(1);
    });
  });

  describe("normalizeBlock", () => {
    test("normalizes images produced by parsing", () => {
      const runtime = createRuntime([imageExtension]);
      const state = runtime.createState("![alt](url)");
      expect(state.doc.blocks[0]).toMatchObject({ type: "block-atom", kind: "image" });
    });
  });
});
