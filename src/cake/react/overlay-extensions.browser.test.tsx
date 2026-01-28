import { createRef, useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { CakeEditor, type CakeEditorRef } from "../index";
import type {
  CakeExtension,
  ParseInlineResult,
  SerializeInlineResult,
} from "../core/runtime";
import { CursorSourceBuilder } from "../core/mapping/cursor-source-map";
import type { Inline } from "../core/types";

afterEach(async () => {
  await cleanup();
});

const HELLO_KIND = "hello-inline";

type HelloOverlayContext = {
  container: HTMLElement;
  contentRoot: HTMLElement;
  toOverlayRect: (rect: DOMRectReadOnly) => {
    top: number;
    left: number;
    width: number;
    height: number;
  };
};

const helloInlineExtension: CakeExtension = {
  name: HELLO_KIND,
  parseInline(source, start, end, context): ParseInlineResult {
    if (source[start] !== "[" || source[start + 1] !== "[") {
      return null;
    }

    const labelStart = start + 2;
    const labelClose = source.indexOf("]]", labelStart);
    if (labelClose === -1 || labelClose >= end) {
      return null;
    }

    const children = context.parseInline(source, labelStart, labelClose);
    return {
      inline: {
        type: "inline-wrapper",
        kind: HELLO_KIND,
        children,
      },
      nextPos: labelClose + 2,
    };
  },
  serializeInline(inline, context): SerializeInlineResult | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== HELLO_KIND) {
      return null;
    }

    const builder = new CursorSourceBuilder();
    builder.appendSourceOnly("[[");
    for (const child of inline.children) {
      builder.appendSerialized(context.serializeInline(child));
    }
    builder.appendSourceOnly("]]");
    return builder.build();
  },
  renderInline(inline, context) {
    if (inline.type !== "inline-wrapper" || inline.kind !== HELLO_KIND) {
      return null;
    }

    const element = document.createElement("span");
    element.className = "cake-hello-inline";
    element.setAttribute("data-testid", "hello-inline");
    for (const child of inline.children) {
      for (const node of context.renderInline(child)) {
        element.append(node);
      }
    }
    return element;
  },
  normalizeInline(inline): Inline | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== HELLO_KIND) {
      return inline;
    }
    return inline.children.length === 0 ? null : inline;
  },
  renderOverlay(context) {
    return (
      <HelloPopoverOverlay
        context={context as unknown as HelloOverlayContext}
      />
    );
  },
};

function HelloPopoverOverlay({ context }: { context: HelloOverlayContext }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);

  const close = () => {
    anchorRef.current = null;
    setAnchor(null);
    setPosition(null);
  };

  const reposition = () => {
    const nextAnchor = anchorRef.current;
    if (!nextAnchor || !nextAnchor.isConnected) {
      close();
      return;
    }
    const rect = context.toOverlayRect(nextAnchor.getBoundingClientRect());
    setPosition({ top: rect.top + rect.height + 6, left: rect.left });
  };

  useEffect(() => {
    if (!anchor) {
      return;
    }
    reposition();
    context.container.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition);
    return () => {
      context.container.removeEventListener("scroll", reposition);
      window.removeEventListener("resize", reposition);
    };
  }, [anchor, context.container]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        close();
        return;
      }
      const nextAnchor = target.closest<HTMLElement>(".cake-hello-inline");
      if (!nextAnchor) {
        close();
        return;
      }
      event.preventDefault();
      anchorRef.current = nextAnchor;
      setAnchor(nextAnchor);
    }

    context.contentRoot.addEventListener("click", handleClick);
    return () => {
      context.contentRoot.removeEventListener("click", handleClick);
    };
  }, [context.contentRoot]);

  if (!anchor || !position) {
    return null;
  }

  return (
    <div
      data-testid="hello-popover"
      style={{
        position: "absolute",
        top: position.top,
        left: position.left,
        pointerEvents: "auto",
        padding: 8,
        background: "white",
        border: "1px solid rgba(0,0,0,0.15)",
      }}
    >
      Hello world
    </div>
  );
}

function renderEditor(markdown: string) {
  const ref = createRef<CakeEditorRef>();

  const renderResult = render(
    <CakeEditor
      ref={ref}
      value={markdown}
      onChange={() => undefined}
      placeholder=""
      style={{ height: 160, overflow: "auto" }}
      extensions={[helloInlineExtension]}
    />,
  );

  return { ref, renderResult };
}

function getCakeContainer(): HTMLElement {
  const cake = document.querySelector<HTMLElement>(".cake");
  if (!cake) {
    throw new Error("Cake container not found");
  }
  return cake;
}

function generateLongContent(lines: number): string {
  return Array.from({ length: lines }, (_, i) => `Line ${i + 1}`).join("\n");
}

describe("cake overlay extensions", () => {
  it("renders a hello popover anchored to inline extension (scroll-aware)", async () => {
    const markdown = `${generateLongContent(50)}\n\n[[hello]]\n\n${generateLongContent(5)}`;
    const { renderResult } = renderEditor(markdown);
    await renderResult;

    const cake = getCakeContainer();
    cake.scrollTop = cake.scrollHeight;
    cake.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const hello = page.getByTestId("hello-inline");
    await expect.element(hello).toBeVisible();

    await userEvent.click(hello);

    const popover = page.getByTestId("hello-popover");
    await expect.element(popover).toBeVisible();

    const helloRect = hello.element().getBoundingClientRect();
    const popoverRect = popover.element().getBoundingClientRect();
    expect(popoverRect.top).toBeGreaterThanOrEqual(helloRect.bottom - 1);
    expect(Math.abs(popoverRect.left - helloRect.left)).toBeLessThan(6);
  });
});
