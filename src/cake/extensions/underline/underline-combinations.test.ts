import { describe, expect, it } from "vitest";
import { createRuntime } from "../../core/runtime";
import { boldExtension } from "../bold/bold";
import { italicExtension } from "../italic/italic";
import { strikethroughExtension } from "../strikethrough/strikethrough";
import { linkExtension } from "../link/link";
import { blockquoteExtension } from "../blockquote/blockquote";
import { headingExtension } from "../heading/heading";
import { plainTextListExtension } from "../list/list";
import { combinedEmphasisExtension } from "../combined-emphasis/combined-emphasis";
import { underlineExtension } from "./underline";

const allExtensions = [
  blockquoteExtension,
  headingExtension,
  plainTextListExtension,
  combinedEmphasisExtension,
  boldExtension,
  italicExtension,
  strikethroughExtension,
  underlineExtension,
  linkExtension,
];

describe("underline combinations with other extensions", () => {
  const runtime = createRuntime(allExtensions);

  describe("underline + bold", () => {
    it("parses bold inside underline", () => {
      const source = "<u>**bold**</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses underline inside bold", () => {
      const source = "**<u>underline</u>**";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses adjacent bold and underline", () => {
      const source = "**bold**<u>underline</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses mixed text with bold and underline", () => {
      const source = "text **bold** more <u>underline</u> end";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("underline + italic", () => {
    it("parses italic inside underline", () => {
      const source = "<u>*italic*</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses underline inside italic", () => {
      const source = "*<u>underline</u>*";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses adjacent italic and underline", () => {
      const source = "*italic*<u>underline</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("underline + strikethrough", () => {
    it("parses strikethrough inside underline", () => {
      const source = "<u>~~strike~~</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses underline inside strikethrough", () => {
      const source = "~~<u>underline</u>~~";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses adjacent strikethrough and underline", () => {
      const source = "~~strike~~<u>underline</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("underline + link", () => {
    it("parses link inside underline", () => {
      const source = "<u>[link](https://example.com)</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses underline inside link text", () => {
      const source = "[<u>underline</u>](https://example.com)";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses adjacent link and underline", () => {
      const source = "[link](https://example.com)<u>underline</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("underline + blockquote", () => {
    it("parses underline inside blockquote", () => {
      const source = "> <u>underline</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses underline with other formatting in blockquote", () => {
      const source = "> <u>underline</u> and **bold**";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("underline + heading", () => {
    it("parses underline inside h1", () => {
      const source = "# <u>underline</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses underline inside h2", () => {
      const source = "## <u>underline</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses underline with other formatting in heading", () => {
      const source = "# **bold** <u>underline</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("underline + list", () => {
    it("parses underline inside bullet list", () => {
      const source = "- <u>underline</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses underline inside numbered list", () => {
      const source = "1. <u>underline</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses underline with other formatting in list", () => {
      const source = "- <u>underline</u> and *italic*";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("complex nesting with underline", () => {
    it("parses triple nesting: underline > bold > italic", () => {
      const source = "<u>**_text_**</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("<u>***text***</u>");
    });

    it("parses triple nesting: bold > italic > underline", () => {
      const source = "**_<u>text</u>_**";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe("***<u>text</u>***");
    });

    it("parses underline with all formatting types", () => {
      const source = "<u>underline</u> **bold** *italic* ~~strike~~ [link](u)";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses deeply nested formatting in blockquote", () => {
      const source = "> <u>**bold underline**</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("parses all inline formatting in heading", () => {
      const source = "# <u>u</u> **b** *i* ~~s~~";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });

  describe("edge cases", () => {
    it("handles empty underline tags (collapses)", () => {
      const state = runtime.createState("<u></u>");
      expect(state.source).toBe("");
    });

    it("handles underline at start of line", () => {
      const source = "<u>start</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("handles underline at end of line", () => {
      const source = "text <u>end</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("handles multiple underlines on same line", () => {
      const source = "<u>one</u> middle <u>two</u> end <u>three</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });

    it("handles underline spanning entire line", () => {
      const source = "<u>entire line content</u>";
      const doc = runtime.parse(source);
      const serialized = runtime.serialize(doc);
      expect(serialized.source).toBe(source);
    });
  });
});
