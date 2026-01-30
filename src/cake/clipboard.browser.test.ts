import { describe, expect, it } from "vitest";
import { htmlToMarkdownForPaste } from "./clipboard";
import { createRuntimeForTests } from "./core/runtime";
import { bundledExtensions } from "./extensions";

function createTestRuntime() {
  return createRuntimeForTests(bundledExtensions);
}

function selectionForText(params: {
  runtime: ReturnType<typeof createRuntimeForTests>;
  state: ReturnType<ReturnType<typeof createRuntimeForTests>["createState"]>;
  text: string;
}) {
  const { runtime, state, text } = params;
  const markdown = runtime.serialize(state.doc).source;
  const start = markdown.indexOf(text);
  if (start === -1) {
    throw new Error(`Missing text in visible output: ${text}`);
  }
  return { start, end: start + text.length };
}

describe("clipboard selection serialization", () => {
  it("serializes formatted selections to markdown", () => {
    const runtime = createTestRuntime();
    const state = runtime.createState(
      "Hello **bold** and *italic* [link](https://example.com)",
    );
    const selection = { start: 0, end: 100 };

    const markdown = runtime.serializeSelection(state, selection);

    expect(markdown).toBe(
      "Hello **bold** and *italic* [link](https://example.com)",
    );
  });

  it("serializes formatted selections to html", () => {
    const runtime = createTestRuntime();
    const state = runtime.createState(
      "Hello **bold** and *italic* [link](https://example.com)",
    );
    const selection = { start: 0, end: 100 };

    const html = runtime.serializeSelectionToHtml(state, selection);

    expect(html).toBe(
      '<div><div>Hello <strong>bold</strong> and <em>italic</em> <a href="https://example.com">link</a></div></div>',
    );
  });

  it("wraps list selections in list markup", () => {
    const runtime = createTestRuntime();
    const state = runtime.createState("- One\n- Two");
    const selection = { start: 0, end: 100 };

    const html = runtime.serializeSelectionToHtml(state, selection);

    expect(html).toBe("<div><ul><li>One</li><li>Two</li></ul></div>");
  });

  it("includes heading markers when selection starts at line start", () => {
    const runtime = createTestRuntime();
    const state = runtime.createState("## Title\nNext");
    const selection = { start: 0, end: 5 };

    const markdown = runtime.serializeSelection(state, selection);

    expect(markdown).toBe("## Title");
  });

  it("returns empty output for empty selections", () => {
    const runtime = createTestRuntime();
    const state = runtime.createState("Hello");
    const selection = { start: 2, end: 2 };

    expect(runtime.serializeSelection(state, selection)).toBe("");
    expect(runtime.serializeSelectionToHtml(state, selection)).toBe("");
  });

  it("keeps newline boundaries for cross-line selections", () => {
    const runtime = createTestRuntime();
    const state = runtime.createState("Hello\nWorld");
    const selection = { start: 2, end: 8 };

    const markdown = runtime.serializeSelection(state, selection);

    expect(markdown).toBe("llo\nWo");
  });

  it("serializes headings to html with proper tags", () => {
    const runtime = createTestRuntime();
    const state = runtime.createState("# Heading 1\n## Heading 2");
    const selection = { start: 0, end: 100 };

    const html = runtime.serializeSelectionToHtml(state, selection);

    expect(html).toContain('<h1 style="margin:0">Heading 1</h1>');
    expect(html).toContain('<h2 style="margin:0">Heading 2</h2>');
  });

  it("serializes numbered lists to html", () => {
    const runtime = createTestRuntime();
    const state = runtime.createState("1. First\n2. Second");
    const selection = { start: 0, end: 100 };

    const html = runtime.serializeSelectionToHtml(state, selection);

    expect(html).toBe("<div><ol><li>First</li><li>Second</li></ol></div>");
  });
});

describe("clipboard html paste", () => {
  it("returns null for plain text html", () => {
    const result = htmlToMarkdownForPaste("<p>Hello world</p>");

    expect(result).toBeNull();
  });

  it("converts formatted html to markdown", () => {
    const result = htmlToMarkdownForPaste(
      "<p>Hello <strong>World</strong> and <em>friends</em></p>",
    );

    expect(result).toBe("Hello **World** and *friends*");
  });

  it("preprocesses Notion html blocks", () => {
    const result = htmlToMarkdownForPaste(
      '<div class="notion-page"><details><summary>Planning</summary></details></div>',
    );

    expect(result).toBe("**Planning**");
  });

  it("preprocesses Google Docs spans", () => {
    const result = htmlToMarkdownForPaste(
      '<div data-source="docs.google.com"><span style="font-weight:bold">Bold</span></div>',
    );

    expect(result).toBe("**Bold**");
  });

  it("handles Word-style formatting", () => {
    const result = htmlToMarkdownForPaste(
      '<p class="MsoNormal"><b>Bold</b> and <i>Italic</i></p>',
    );

    expect(result).toBe("**Bold** and *Italic*");
  });

  it("keeps bold links formatted without literal markers", () => {
    const result = htmlToMarkdownForPaste(
      '<p><strong><a href="https://example.com">Bold Link</a></strong></p>',
    );

    expect(result).toBe("[**Bold Link**](https://example.com)");
  });

  it("converts h4 headings to h3 when pasting", () => {
    const result = htmlToMarkdownForPaste("<h4>Subheading</h4>");

    expect(result).toBe("### Subheading");
  });

  it("converts h5 headings to h3 when pasting", () => {
    const result = htmlToMarkdownForPaste("<h5>Subheading</h5>");

    expect(result).toBe("### Subheading");
  });

  it("converts h6 headings to h3 when pasting", () => {
    const result = htmlToMarkdownForPaste("<h6>Subheading</h6>");

    expect(result).toBe("### Subheading");
  });

  it("preserves h1 headings when pasting", () => {
    const result = htmlToMarkdownForPaste("<h1>Title</h1>");

    expect(result).toBe("# Title");
  });

  it("preserves h2 headings when pasting", () => {
    const result = htmlToMarkdownForPaste("<h2>Section</h2>");

    expect(result).toBe("## Section");
  });

  it("preserves h3 headings when pasting", () => {
    const result = htmlToMarkdownForPaste("<h3>Subsection</h3>");

    expect(result).toBe("### Subsection");
  });

  it("converts strikethrough html to markdown", () => {
    const result = htmlToMarkdownForPaste(
      "<p>Hello <del>deleted</del> and <s>struck</s></p>",
    );

    expect(result).toBe("Hello ~~deleted~~ and ~~struck~~");
  });

  it("converts bullet lists to markdown", () => {
    const result = htmlToMarkdownForPaste("<ul><li>One</li><li>Two</li></ul>");

    expect(result).toBe("- One\n- Two");
  });

  it("converts numbered lists to markdown", () => {
    const result = htmlToMarkdownForPaste(
      "<ol><li>First</li><li>Second</li></ol>",
    );

    expect(result).toBe("1. First\n2. Second");
  });

  it("converts blockquotes to markdown", () => {
    const result = htmlToMarkdownForPaste(
      "<blockquote>This is a quote</blockquote>",
    );

    expect(result).toBe("> This is a quote");
  });

  it("converts inline code to markdown", () => {
    const result = htmlToMarkdownForPaste("<p>Use <code>const</code> here</p>");

    expect(result).toBe("Use `const` here");
  });

  it("converts code blocks to markdown", () => {
    const result = htmlToMarkdownForPaste(
      '<pre><code class="language-js">const x = 1;</code></pre>',
    );

    expect(result).toContain("```js");
    expect(result).toContain("const x = 1;");
    expect(result).toContain("```");
  });

  it("converts images to markdown", () => {
    const result = htmlToMarkdownForPaste(
      '<p><img src="https://example.com/img.png" alt="Example" /></p>',
    );

    expect(result).toBe("![Example](https://example.com/img.png)");
  });

  it("converts links to markdown", () => {
    const result = htmlToMarkdownForPaste(
      '<p><a href="https://example.com">Click here</a></p>',
    );

    expect(result).toBe("[Click here](https://example.com)");
  });
});
