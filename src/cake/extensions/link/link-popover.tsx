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
import type { CakeEditorUI, EditCommand } from "../../core/runtime";

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

function getPopoverPosition(params: {
  anchor: HTMLElement;
  toOverlayRect: (rect: DOMRectReadOnly) => {
    top: number;
    left: number;
    width: number;
    height: number;
  };
}): PopoverPosition {
  const anchorRect = params.toOverlayRect(
    params.anchor.getBoundingClientRect(),
  );
  return {
    top: anchorRect.top + anchorRect.height + 6,
    left: anchorRect.left,
  };
}

export function CakeLinkPopover({ editor }: { editor: CakeEditorUI }) {
  const container = editor.getContainer();
  const contentRoot = editor.getContentRoot();
  if (!contentRoot) {
    return null;
  }
  const toOverlayRect = useCallback(
    (rect: DOMRectReadOnly) => {
      const containerRect = container.getBoundingClientRect();
      return {
        top: rect.top - containerRect.top,
        left: rect.left - containerRect.left,
        width: rect.width,
        height: rect.height,
      };
    },
    [container],
  );
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
  const isEditing = state.status === "open" ? state.isEditing : false;

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
    function handleLinkOpen(event: Event) {
      const customEvent = event as CustomEvent<{
        link?: HTMLAnchorElement;
        isEditing?: boolean;
      }>;
      const link = customEvent.detail?.link;
      if (!link || !(link instanceof HTMLAnchorElement)) {
        return;
      }
      openForLink(link, { isEditing: customEvent.detail?.isEditing });
    }

    contentRoot.addEventListener("cake-link-popover-open", handleLinkOpen);
    return () => {
      contentRoot.removeEventListener("cake-link-popover-open", handleLinkOpen);
    };
  }, [contentRoot, openForLink]);

  useEffect(() => {
    if (state.status !== "open") {
      return;
    }
    container.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", reposition);
    return () => {
      container.removeEventListener("scroll", close);
      window.removeEventListener("resize", reposition);
    };
  }, [close, container, reposition, state.status]);

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
      className="cake-link-popover"
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
          className="cake-link-editor"
          onSubmit={(event) => {
            event.preventDefault();
            handleSave();
          }}
        >
          <input
            className="cake-link-input"
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
          <button type="submit" className="cake-link-save">
            Save
          </button>
          <button
            type="button"
            className="cake-link-cancel"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <div className="cake-link-url" title={displayUrl}>
            {displayUrl}
          </div>
          <div className="cake-link-actions">
            <button
              type="button"
              className="cake-link-icon-action"
              onClick={handleEdit}
              title="Edit link"
              aria-label="Edit link"
            >
              <Pencil className="cake-link-icon" />
            </button>
            <button
              type="button"
              className="cake-link-icon-action"
              onClick={handleOpen}
              title="Open link"
              aria-label="Open link"
            >
              <ExternalLink className="cake-link-icon" />
            </button>
            <button
              type="button"
              className="cake-link-icon-action"
              onClick={handleUnlink}
              title="Remove link"
              aria-label="Remove link"
            >
              <Unlink className="cake-link-icon" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
