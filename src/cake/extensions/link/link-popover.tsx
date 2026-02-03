import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { ExternalLink, Pencil, Unlink } from "lucide-react";
import { ensureHttpsProtocol } from "../../shared/url";
import type { EditCommand } from "../../core/runtime";
import type { CakeEditor } from "../../editor/cake-editor";
import type { LinkExtensionStyles } from "./link";

type PopoverPosition = { top: number; left: number };

type LinkPopoverState =
  | { status: "closed" }
  | {
      status: "open";
      url: string;
      isEditing: boolean;
      draftUrl: string;
      position: PopoverPosition;
    };

function getLinkFromEventTarget(
  target: EventTarget | null,
): HTMLAnchorElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest("a.cake-link");
}

function getLinkFromDomSelection(contentRoot: HTMLElement): HTMLAnchorElement | null {
  const selection = window.getSelection();
  const focusNode = selection?.focusNode ?? null;
  const focusElement =
    focusNode instanceof Element ? focusNode : focusNode?.parentElement ?? null;
  if (!focusElement || !contentRoot.contains(focusElement)) {
    return null;
  }
  const link = focusElement.closest("a.cake-link");
  if (!link || !(link instanceof HTMLAnchorElement)) {
    return null;
  }
  return link;
}

function getPopoverPosition(params: {
  anchor: HTMLElement;
  toOverlayRect: (rect: DOMRect) => {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}): PopoverPosition {
  const anchorRect = params.toOverlayRect(params.anchor.getBoundingClientRect());
  return {
    top: anchorRect.top + anchorRect.height + 6,
    left: anchorRect.left,
  };
}

function cx(...parts: Array<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ");
}

export function CakeLinkPopover({
  editor,
  styles,
}: {
  editor: CakeEditor;
  styles?: LinkExtensionStyles;
}) {
  const contentRoot = editor.getContentRoot();
  if (!contentRoot) {
    return null;
  }
  const toOverlayRect = useCallback((rect: DOMRect) => editor.toOverlayRect(rect), [editor]);
  const getSelection = useCallback(() => {
    const selection = editor.getSelection();
    const focus =
      selection.start === selection.end
        ? selection.start
        : Math.max(selection.start, selection.end);
    return { start: focus, end: focus };
  }, [editor]);
  const executeCommand = useCallback(
    (command: EditCommand) => {
      return editor.executeCommand(command);
    },
    [editor],
  );
  const anchorRef = useRef<HTMLAnchorElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<LinkPopoverState>({ status: "closed" });
  const stateRef = useRef<LinkPopoverState>(state);
  const isEditing = state.status === "open" ? state.isEditing : false;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const close = useCallback(() => {
    anchorRef.current = null;
    setState({ status: "closed" });
  }, []);

  const reposition = useCallback(() => {
    if (state.status !== "open") {
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor || !anchor.isConnected) {
      close();
      return;
    }
    setState((current) => {
      if (current.status !== "open") {
        return current;
      }
      return {
        ...current,
        position: getPopoverPosition({ anchor, toOverlayRect }),
      };
    });
  }, [close, state.status, toOverlayRect]);

  const openForLink = useCallback(
    (link: HTMLAnchorElement, options?: { isEditing?: boolean }) => {
      anchorRef.current = link;
      const url = link.getAttribute("href") ?? "";
      setState({
        status: "open",
        url,
        isEditing: options?.isEditing ?? false,
        draftUrl: url,
        position: getPopoverPosition({ anchor: link, toOverlayRect }),
      });
    },
    [toOverlayRect],
  );

  useEffect(() => {
    if (state.status !== "open") {
      return;
    }
    reposition();
  }, [reposition, state.status, isEditing]);

  useEffect(() => {
    if (state.status !== "open" || !isEditing) {
      return;
    }
    inputRef.current?.focus();
  }, [state.status, isEditing]);

  useEffect(() => {
    function handleContentClick(event: MouseEvent) {
      const link = getLinkFromEventTarget(event.target);
      if (!link) {
        close();
        return;
      }

      const href = link.getAttribute("href") ?? "";
      if (event.metaKey || event.ctrlKey) {
        if (href) {
          window.open(
            ensureHttpsProtocol(href),
            "_blank",
            "noopener,noreferrer",
          );
        }
        return;
      }

      event.preventDefault();
      openForLink(link);
    }

    contentRoot.addEventListener("click", handleContentClick);
    return () => {
      contentRoot.removeEventListener("click", handleContentClick);
    };
  }, [close, contentRoot, openForLink]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key !== "u" || !event.shiftKey || (!event.metaKey && !event.ctrlKey)) {
        return;
      }
      const selection = editor.getSelection();
      if (selection.start !== selection.end) {
        return;
      }
      if (!contentRoot) {
        return;
      }
      const link = getLinkFromDomSelection(contentRoot);
      if (!link) {
        return;
      }
      event.preventDefault();
      openForLink(link, { isEditing: true });
    }

    if (!contentRoot) {
      return;
    }
    contentRoot.addEventListener("keydown", handleKeyDown);
    return () => {
      contentRoot.removeEventListener("keydown", handleKeyDown);
    };
  }, [contentRoot, editor, openForLink]);

  useEffect(() => {
    function handleUpdate() {
      if (stateRef.current.status !== "closed") {
        return;
      }
      const selection = editor.getSelection();
      if (selection.start !== selection.end) {
        return;
      }
      if (!contentRoot) {
        return;
      }
      const link = getLinkFromDomSelection(contentRoot);
      if (!link) {
        return;
      }
      const href = link.getAttribute("href") ?? "";
      if (href !== "") {
        return;
      }
      openForLink(link, { isEditing: true });
    }

    const unsubscribeChange = editor.onChange(() => {
      // Defer check to next frame so DOM selection has settled
      requestAnimationFrame(() => handleUpdate());
    });
    const unsubscribeSelection = editor.onSelectionChange(() => {
      requestAnimationFrame(() => handleUpdate());
    });
    handleUpdate();
    return () => {
      unsubscribeChange();
      unsubscribeSelection();
    };
  }, [contentRoot, editor, openForLink]);

  useEffect(() => {
    if (state.status !== "open") {
      return;
    }
    const container = editor.getContainer();
    container.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", reposition);
    return () => {
      container.removeEventListener("scroll", close);
      window.removeEventListener("resize", reposition);
    };
  }, [close, editor, reposition, state.status]);

  const handleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (event.target instanceof HTMLInputElement) {
        return;
      }
      event.preventDefault();
    },
    [],
  );

  if (state.status !== "open") {
    return null;
  }

  const displayUrl = ensureHttpsProtocol(state.url);

  const handleEdit = () => {
    setState((current) => {
      if (current.status !== "open") {
        return current;
      }
      return { ...current, isEditing: true, draftUrl: current.url };
    });
  };

  const handleCancel = () => {
    setState((current) => {
      if (current.status !== "open") {
        return current;
      }
      return { ...current, isEditing: false, draftUrl: current.url };
    });
  };

  const handleSave = () => {
    if (state.status !== "open") {
      return;
    }
    const draftValue = inputRef.current?.value ?? state.draftUrl;
    const trimmed = draftValue.trim();
    if (!trimmed) {
      close();
      return;
    }
    const nextUrl = ensureHttpsProtocol(trimmed);
    const anchor = anchorRef.current;
    anchor?.setAttribute("href", nextUrl);
    setState({
      status: "open",
      url: nextUrl,
      isEditing: false,
      draftUrl: nextUrl,
      position: state.position,
    });
  };

  const handleOpen = () => {
    window.open(displayUrl, "_blank", "noopener,noreferrer");
  };

  const handleUnlink = () => {
    const selection = getSelection();
    if (!selection) {
      close();
      return;
    }
    executeCommand({
      type: "unlink",
      start: selection.start,
      end: selection.end,
    });
    close();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      handleSave();
    } else if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
    }
  };

  return (
    <div
      className={cx("cake-link-popover", styles?.popover)}
      ref={popoverRef}
      style={{
        position: "absolute",
        top: state.position.top,
        left: state.position.left,
        pointerEvents: "auto",
      }}
      onMouseDown={handleMouseDown}
      onClick={(event) => event.stopPropagation()}
    >
      {state.isEditing ? (
        <form
          className={cx("cake-link-editor", styles?.editor)}
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <input
            className={cx("cake-link-input", styles?.input)}
            type="text"
            value={state.draftUrl}
            ref={inputRef}
            onChange={(event) => {
              setState((current) => {
                if (current.status !== "open") {
                  return current;
                }
                return { ...current, draftUrl: event.target.value };
              });
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="https://"
          />
          <button
            type="submit"
            className={cx("cake-link-save", styles?.saveButton)}
          >
            Save
          </button>
          <button
            type="button"
            className={cx("cake-link-cancel", styles?.cancelButton)}
            onClick={handleCancel}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <div className={cx("cake-link-url", styles?.url)}>
            {displayUrl}
          </div>
          <div className={cx("cake-link-actions", styles?.actions)}>
            <button
              type="button"
              className={cx("cake-link-icon-action", styles?.iconButton)}
              onClick={handleEdit}
              title="Edit link"
              aria-label="Edit link"
            >
              <Pencil className={cx("cake-link-icon", styles?.icon)} />
            </button>
            <button
              type="button"
              className={cx("cake-link-icon-action", styles?.iconButton)}
              onClick={handleOpen}
              title="Open link"
              aria-label="Open link"
            >
              <ExternalLink className={cx("cake-link-icon", styles?.icon)} />
            </button>
            <button
              type="button"
              className={cx("cake-link-icon-action", styles?.iconButton)}
              onClick={handleUnlink}
              title="Remove link"
              aria-label="Remove link"
            >
              <Unlink className={cx("cake-link-icon", styles?.icon)} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
