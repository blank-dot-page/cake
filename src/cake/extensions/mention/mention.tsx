import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  CakeExtension,
  ParseInlineResult,
  SerializeInlineResult,
} from "../../core/runtime";
import type { Inline } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";
import type { CakeEditor } from "../../editor/cake-editor";

export type MentionItem = {
  id: string;
  label: string;
};

export type MentionExtensionOptions<Item extends MentionItem = MentionItem> = {
  getItems: (query: string) => Promise<Item[]>;
  /**
   * Optional item accessors, for non-standard item shapes.
   * Defaults assume { id, label }.
   */
  getItemId?: (item: Item) => string;
  getItemLabel?: (item: Item) => string;
  /**
   * Customize how mentions are encoded in markdown.
   *
   * Default: "@[id](label)".
   */
  serializeMention?: (mention: { id: string; label: string }) => string;
  /**
   * Customize how mentions are parsed from markdown.
   *
   * Return null to indicate no match at `start`.
   */
  parseMention?: (source: string, start: number, end: number) => {
    mention: { id: string; label: string };
    nextPos: number;
  } | null;
  renderItem?: (item: Item, context: { query: string; isActive: boolean }) => ReactNode;
  /**
   * Allows callers to add attributes/classes/styles to the mention element.
   *
   * Note: the element must remain a single cursor unit; do not add extra text nodes.
   */
  decorateMentionElement?: (params: {
    element: HTMLSpanElement;
    mention: { id: string; label: string };
  }) => void;
  styles?: {
    popover?: string;
    popoverList?: string;
    popoverItem?: string;
    popoverItemActive?: string;
    mention?: string;
  };
};

export function mentionExtension(
  options: MentionExtensionOptions,
): CakeExtension {
  const getItemId = options.getItemId ?? ((item: any) => String(item.id ?? ""));
  const getItemLabel =
    options.getItemLabel ?? ((item: any) => String(item.label ?? ""));
  const serializeMention =
    options.serializeMention ??
    ((mention: { id: string; label: string }) =>
      `@[${mention.id}](${mention.label})`);
  const parseMention = options.parseMention ?? defaultParseMention;

  return (editor) => {
    const disposers: Array<() => void> = [];

    disposers.push(
      editor.registerParseInline(
        (source, start, end): ParseInlineResult => {
          const result = parseMention(source, start, end);
          if (!result) {
            return null;
          }
          return {
            inline: {
              type: "inline-atom",
              kind: "mention",
              data: result.mention,
            },
            nextPos: result.nextPos,
          };
        },
      ),
    );

    disposers.push(
      editor.registerSerializeInline(
        (inline): SerializeInlineResult | null => {
          if (inline.type !== "inline-atom" || inline.kind !== "mention") {
            return null;
          }
          const data = inline.data as
            | { id?: unknown; label?: unknown }
            | undefined;
          const id = typeof data?.id === "string" ? data.id : "";
          const label = typeof data?.label === "string" ? data.label : "";
          const source = serializeMention({ id, label });
          const builder = new CursorSourceBuilder();
          builder.appendCursorAtom(source, 1);
          return builder.build();
        },
      ),
    );

    disposers.push(
      editor.registerNormalizeInline((inline): Inline | null => {
        if (inline.type !== "inline-atom" || inline.kind !== "mention") {
          return inline;
        }
        const data = inline.data as
          | { id?: unknown; label?: unknown }
          | undefined;
        if (typeof data?.id !== "string") {
          return null;
        }
        return inline;
      }),
    );

    disposers.push(
      editor.registerInlineRenderer((inline, context) => {
        if (inline.type !== "inline-atom" || inline.kind !== "mention") {
          return null;
        }
        const data = inline.data as
          | { id?: unknown; label?: unknown }
          | undefined;
        const id = typeof data?.id === "string" ? data.id : "";
        const label = typeof data?.label === "string" ? data.label : "";

        const element = document.createElement("span");
        element.className = [
          "cake-inline-atom",
          "cake-inline-atom--mention",
          "cake-mention",
          options.styles?.mention,
        ]
          .filter(Boolean)
          .join(" ");
        element.setAttribute("data-cake-mention", "true");
        element.setAttribute("data-mention-id", id);
        element.setAttribute("data-mention-label", label);
        options.decorateMentionElement?.({
          element,
          mention: { id, label },
        });

        // IMPORTANT: keep exactly one text node so DOM<->cursor mapping stays 1:1.
        const placeholder = document.createTextNode(" ");
        context.createTextRun(placeholder);
        element.append(placeholder);
        return element;
      }),
    );

    const MentionUI = ({ editor }: { editor: CakeEditor }) => (
      <CakeMentionUI
        editor={editor}
        getItems={options.getItems}
        getItemId={getItemId}
        getItemLabel={getItemLabel}
        serializeMention={serializeMention}
        renderItem={options.renderItem}
        styles={options.styles}
      />
    );
    disposers.push(editor.registerUI(MentionUI));

    return () => disposers.reverse().forEach((d) => d());
  };
}

function defaultParseMention(
  source: string,
  start: number,
  end: number,
): { mention: { id: string; label: string }; nextPos: number } | null {
  // Default format: @[id](label)
  if (source[start] !== "@" || source[start + 1] !== "[") {
    return null;
  }
  const idStart = start + 2;
  const idClose = source.indexOf("]", idStart);
  if (idClose === -1 || idClose >= end) {
    return null;
  }
  if (source[idClose + 1] !== "(") {
    return null;
  }
  const labelStart = idClose + 2;
  const labelClose = source.indexOf(")", labelStart);
  if (labelClose === -1 || labelClose >= end) {
    return null;
  }
  const id = source.slice(idStart, idClose);
  const label = source.slice(labelStart, labelClose);
  return {
    mention: { id, label },
    nextPos: labelClose + 1,
  };
}

type PopoverPosition = { top: number; left: number };

type MentionPopoverState<Item extends MentionItem> =
  | { status: "closed" }
  | {
      status: "open";
      mode: "trigger" | "replace";
      query: string;
      replaceChars: number;
      /**
       * When opening a replace popover, the caret may be placed either before
       * (offset 0) or after (offset 1) the atom. If it's before, we need to
       * advance by 1 cursor unit before doing `replaceTextBeforeCursor(1, ...)`.
       */
      replaceAdvanceCursor: number;
      items: Item[];
      loading: boolean;
      position: PopoverPosition;
      activeIndex: number;
    };

function ensureMentionStyles() {
  const id = "cake-mention-styles";
  if (document.getElementById(id)) {
    return;
  }
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
    .cake-mention {
      display: inline-flex;
      align-items: center;
      border-radius: 9999px;
      padding: 0 6px;
      background: rgba(59, 130, 246, 0.15);
      color: rgb(37, 99, 235);
      font-weight: 500;
      white-space: nowrap;
    }
    .cake-mention::before {
      content: "@" attr(data-mention-label);
    }
    .cake-mention > * {
      display: none;
    }
    .cake-mention-popover {
      min-width: 220px;
      max-width: 320px;
      max-height: 220px;
      overflow: auto;
      background: white;
      border: 1px solid rgba(0,0,0,0.12);
      border-radius: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.16);
      padding: 6px;
    }
    .cake-mention-popover button {
      width: 100%;
      text-align: left;
      border: 0;
      background: transparent;
      padding: 6px 8px;
      border-radius: 8px;
      cursor: pointer;
    }
    .cake-mention-popover button:hover {
      background: rgba(0,0,0,0.06);
    }
    .cake-mention-popover button[aria-selected="true"] {
      background: rgba(59, 130, 246, 0.12);
    }
  `;
  document.head.appendChild(style);
}

function getTriggerQuery(textBeforeCursor: string): string | null {
  // Require the trigger to be at the start or preceded by a non-word character
  // to avoid matching emails/words like "foo@bar", while still supporting
  // punctuation boundaries like "(@alice".
  const match = textBeforeCursor.match(/(?:^|[^\w])@([^\s@]*)$/);
  return match ? match[1] ?? "" : null;
}

function getPopoverPositionFromCaret(editor: CakeEditor): PopoverPosition | null {
  const rect = editor.getFocusRect();
  if (!rect) {
    return null;
  }
  // `editor.getFocusRect()` is in the same coordinate space as the selection
  // overlay, which scrolls with the container content. Extension overlays are
  // "pinned" (they counteract scroll via transform), so convert into viewport
  // coordinates by subtracting the container scroll offsets.
  const container = editor.getContainer();
  return {
    top: rect.top - container.scrollTop + rect.height + 6,
    left: rect.left - container.scrollLeft,
  };
}

function getPopoverPositionFromElement(
  editor: CakeEditor,
  anchor: HTMLElement,
): PopoverPosition {
  const containerRect = editor.getContainer().getBoundingClientRect();
  const rect = anchor.getBoundingClientRect();
  return {
    top: rect.top - containerRect.top + rect.height + 6,
    left: rect.left - containerRect.left,
  };
}

function CakeMentionUI<Item extends MentionItem>({
  editor,
  getItems,
  getItemId,
  getItemLabel,
  serializeMention,
  renderItem,
  styles,
}: {
  editor: CakeEditor;
  getItems: (query: string) => Promise<Item[]>;
  getItemId: (item: Item) => string;
  getItemLabel: (item: Item) => string;
  serializeMention: (mention: { id: string; label: string }) => string;
  renderItem?: MentionExtensionOptions<Item>["renderItem"];
  styles?: MentionExtensionOptions<Item>["styles"];
}) {
  const container = editor.getContainer();
  const contentRoot = editor.getContentRoot();
  const requestIdRef = useRef(0);
  const stateRef = useRef<MentionPopoverState<Item>>({ status: "closed" });
  const [state, setState] = useState<MentionPopoverState<Item>>({
    status: "closed",
  });

  useEffect(() => {
    ensureMentionStyles();
  }, []);

  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  const close = useCallback(() => {
    setState({ status: "closed" });
  }, []);

  const handleChoose = useCallback(
    (item: Item) => {
      const current = stateRef.current;
      if (current.status !== "open") {
        return;
      }
      if (current.replaceAdvanceCursor > 0) {
        const sel = editor.getSelection();
        const cursorLength = editor.getCursorLength();
        const next = Math.min(
          Math.max(0, sel.start + current.replaceAdvanceCursor),
          cursorLength,
        );
        editor.setSelection({ start: next, end: next, affinity: "forward" });
      }
      const id = getItemId(item);
      const label = getItemLabel(item);
      const text = serializeMention({ id, label });
      editor.replaceTextBeforeCursor(current.replaceChars, text);
      close();
      editor.focus();
    },
    [close, editor, getItemId, getItemLabel, serializeMention],
  );

  const open = useCallback(
    (next: Omit<Extract<MentionPopoverState<Item>, { status: "open" }>, "items" | "loading" | "activeIndex"> & { items?: Item[] }) => {
      setState({
        status: "open",
        mode: next.mode,
        query: next.query,
        replaceChars: next.replaceChars,
        replaceAdvanceCursor: next.replaceAdvanceCursor ?? 0,
        position: next.position,
        items: next.items ?? [],
        loading: true,
        activeIndex: 0,
      });
    },
    [],
  );

  const fetch = useCallback(
    (query: string) => {
      const requestId = (requestIdRef.current += 1);
      let promise: Promise<Item[]>;
      try {
        promise = Promise.resolve(getItems(query));
      } catch {
        promise = Promise.resolve([]);
      }
      return promise
        .then((items) => {
          if (requestId !== requestIdRef.current) {
            return;
          }
          setState((current) => {
            if (current.status !== "open") {
              return current;
            }
            return {
              ...current,
              items,
              loading: false,
              activeIndex: Math.min(current.activeIndex, Math.max(0, items.length - 1)),
            };
          });
        })
        .catch(() => {
          if (requestId !== requestIdRef.current) {
            return;
          }
          setState((current) => {
            if (current.status !== "open") {
              return current;
            }
            return { ...current, items: [], loading: false };
          });
        });
    },
    [getItems],
  );

  useLayoutEffect(() => {
    // Trigger mode: driven by typing in the editor.
    const updateFromEditor = () => {
      const selection = editor.getSelection();
      if (selection.start !== selection.end) {
        if (
          stateRef.current.status === "open" &&
          stateRef.current.mode === "trigger"
        ) {
          close();
        }
        return;
      }

      const query = getTriggerQuery(editor.getTextBeforeCursor(80));
      if (query === null) {
        if (
          stateRef.current.status === "open" &&
          stateRef.current.mode === "trigger"
        ) {
          close();
        }
        return;
      }
      const position = getPopoverPositionFromCaret(editor);
      if (!position) {
        return;
      }

      const replaceChars = query.length + 1;
      open({
        status: "open",
        mode: "trigger",
        query,
        replaceChars,
        replaceAdvanceCursor: 0,
        position,
      });
      fetch(query);
    };

    const unsubscribe = editor.onChange(updateFromEditor);
    // In case the user typed before React effects ran, sync from current state.
    updateFromEditor();
    return unsubscribe;
  }, [close, editor, fetch, open]);

  useEffect(() => {
    if (!contentRoot) {
      return;
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        close();
        return;
      }
      const mention = target.closest<HTMLElement>("[data-cake-mention]");
      if (!mention) {
      if (stateRef.current.status === "open" && stateRef.current.mode === "replace") {
          close();
        }
        return;
      }
      const rect = mention.getBoundingClientRect();
      const midpoint = rect.left + rect.width / 2;
      const placeBefore = event.clientX < midpoint;

      queueMicrotask(() => {
        const domSelection = window.getSelection();
        if (!domSelection) {
          return;
        }

        const walker = document.createTreeWalker(mention, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode();
        const placeholder = node instanceof Text ? node : null;

        const range = document.createRange();
        if (placeholder && placeholder.data.length >= 1) {
          const offset = placeBefore ? 0 : 1;
          range.setStart(placeholder, offset);
          range.setEnd(placeholder, offset);
          domSelection.removeAllRanges();
          domSelection.addRange(range);
          editor.syncSelectionFromDOM();
        }
      });

      const position = getPopoverPositionFromElement(editor, mention);
      open({
        status: "open",
        mode: "replace",
        query: "",
        replaceChars: 1,
        replaceAdvanceCursor: placeBefore ? 1 : 0,
        position,
      });
      fetch("");
    }

    contentRoot.addEventListener("click", handleClick);
    return () => {
      contentRoot.removeEventListener("click", handleClick);
    };
  }, [close, contentRoot, editor, fetch, open]);

  useEffect(() => {
    return editor.registerKeyDownInterceptor((event) => {
      const current = stateRef.current;
      if (current.status !== "open") {
        return false;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return true;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        setState((prev) => {
          if (prev.status !== "open") {
            return prev;
          }
          const length = prev.items.length;
          if (length === 0) {
            return prev;
          }
          const nextIndex = (prev.activeIndex + delta + length) % length;
          return { ...prev, activeIndex: nextIndex };
        });
        return true;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        editor.suppressNextBeforeInput();
        const item = current.items[current.activeIndex];
        if (item) {
          handleChoose(item);
        }
        return true;
      }
      return false;
    });
  }, [close, editor, handleChoose]);

  useEffect(() => {
    if (state.status !== "open") {
      return;
    }
    container.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      container.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [close, container, state.status]);

  const className = useMemo(
    () =>
      ["cake-mention-popover", styles?.popover]
        .filter(Boolean)
        .join(" "),
    [styles?.popover],
  );

  if (state.status !== "open") {
    return null;
  }

  return (
    <div
      data-testid="cake-mention-popover"
      className={className}
      style={{
        position: "absolute",
        top: state.position.top,
        left: state.position.left,
        pointerEvents: "auto",
        zIndex: 10,
      }}
      onMouseDown={(event) => {
        // Keep focus from leaving the editor on click-drag.
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      <div className={styles?.popoverList}>
        {state.items.map((item, index) => {
          const label = getItemLabel(item);
          const isActive = index === state.activeIndex;
          const itemClass = [
            styles?.popoverItem,
            isActive ? styles?.popoverItemActive : null,
          ]
            .filter(Boolean)
            .join(" ");
          const content = renderItem
            ? renderItem(item, { query: state.query, isActive })
            : label;
          return (
            <button
              key={getItemId(item) || String(index)}
              type="button"
              className={itemClass}
              aria-label={label}
              aria-selected={isActive}
              data-active={isActive ? "true" : undefined}
              onMouseEnter={() => {
                setState((prev) => {
                  if (prev.status !== "open") {
                    return prev;
                  }
                  return { ...prev, activeIndex: index };
                });
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleChoose(item);
              }}
            >
              {content}
            </button>
          );
        })}
        {state.items.length === 0 && !state.loading ? (
          <div style={{ padding: 8, opacity: 0.6 }}>No results</div>
        ) : null}
        {state.items.length === 0 && state.loading ? (
          <div style={{ padding: 8, opacity: 0.6 }}>Searching…</div>
        ) : null}
      </div>
    </div>
  );
}
