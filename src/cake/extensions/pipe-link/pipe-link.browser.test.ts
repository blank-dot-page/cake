import { describe, expect, it, afterEach } from "vitest";
import { createRuntime } from "../../core/runtime";
import { pipeLinkExtension } from "./pipe-link";
import { renderDoc, renderDocContent } from "../../dom/render";

describe("pipe-link DOM rendering", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders pipe-link as anchor element via renderDoc", () => {
    const runtime = createRuntime([pipeLinkExtension]);
    const state = runtime.createState("|link|https://example.com|");

    const { root } = renderDoc(state.doc, runtime.extensions);
    document.body.append(root);

    const anchor = root.querySelector("a");
    expect(anchor).toBeTruthy();
    if (anchor) {
      expect(anchor.getAttribute("href")).toBe("https://example.com");
      expect(anchor.textContent).toBe("link");
    }
  });

  it("renders pipe-link as anchor element via renderDocContent", () => {
    const runtime = createRuntime([pipeLinkExtension]);
    const state = runtime.createState("|link|https://example.com|");

    const root = document.createElement("div");
    const { content } = renderDocContent(state.doc, runtime.extensions, root);
    root.append(...content);
    document.body.append(root);

    const anchor = root.querySelector("a");
    expect(anchor).toBeTruthy();
    if (anchor) {
      expect(anchor.getAttribute("href")).toBe("https://example.com");
      expect(anchor.textContent).toBe("link");
    }
  });

  it("renders pipe-link with surrounding text", () => {
    const runtime = createRuntime([pipeLinkExtension]);
    const state = runtime.createState("See |link|https://example.com| here");

    const { root } = renderDoc(state.doc, runtime.extensions);
    document.body.append(root);

    const anchor = root.querySelector("a");
    expect(anchor).toBeTruthy();
    if (anchor) {
      expect(anchor.getAttribute("href")).toBe("https://example.com");
      expect(anchor.textContent).toBe("link");
    }

    // Check total text content
    expect(root.textContent).toBe("See link here");
  });
});
