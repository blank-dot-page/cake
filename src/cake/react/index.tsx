import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Selection } from "../core/types";
import type {
  CakeExtension,
  CakeUIComponent,
  EditCommand,
} from "../core/runtime";
import { CakeEditor as CakeEditorEngine } from "../editor/cake-editor";

function toEngineSelection(selection?: CakeEditorSelection): Selection {
  if (!selection) {
    return { start: 0, end: 0, affinity: "forward" };
  }
  return {
    start: selection.start,
    end: selection.end,
    affinity: selection.affinity,
  };
}

export type CakeEditorSelection = {
  start: number;
  end: number;
  affinity?: "backward" | "forward";
};

export interface CakeEditorUpdate {
  value?: string;
  selection?: CakeEditorSelection;
  focus?: boolean;
}

export interface CakeEditorProps {
  value: string;
  onChange: (value: string) => void;
  selection?: CakeEditorSelection;
  onSelectionChange?: (
    start: number,
    end: number,
    affinity?: "backward" | "forward",
  ) => void;
  placeholder?: string;
  disabled?: boolean;
  spellCheck?: boolean;
  className?: string;
  style?: React.CSSProperties;
  scrollerStyle?: React.CSSProperties;
  scrollerClassName?: string;
  extensions: CakeExtension[];
  onBlur?: (event?: FocusEvent) => void;
}

export interface CakeEditorRef {
  element: HTMLElement | null;
  focus: (selection?: CakeEditorSelection) => void;
  blur: () => void;
  hasFocus: () => boolean;
  selectAll: () => void;
  getText: () => string;
  getTextSelection: () => { start: number; end: number };
  setTextSelection: (selection: { start: number; end: number }) => void;
  getTextBeforeCursor: (maxChars?: number) => string;
  getTextAroundCursor: (
    before: number,
    after: number,
  ) => { before: string; after: string };
  replaceTextBeforeCursor: (chars: number, replacement: string) => void;
  /**
   * Execute a semantic edit command.
   *
   * Semantic commands are defined by extensions and allow callers to use
   * high-level commands like `{ type: "toggle-bold" }` instead of
   * syntax-specific commands like `{ type: "toggle-inline", marker: "**" }`.
   *
   * Available commands depend on which extensions are registered.
   *
   * @param command - The command to execute
   * @param options.restoreFocus - If true, refocus the editor after executing.
   *   Use this when calling from a toolbar button that steals focus.
   */
  executeCommand: (
    command: EditCommand,
    options?: { restoreFocus?: boolean },
  ) => boolean;
  applyUpdate: (update: CakeEditorUpdate) => void;
  getValue: () => string;
  getSelection: () => { start: number; end: number } | null;
  getCursorLength: () => number;
  insertText: (text: string) => void;
  replaceText: (oldText: string, newText: string) => void;
  getActiveMarks: () => string[];
}

export const CakeEditor = forwardRef<CakeEditorRef | null, CakeEditorProps>(
  function CakeEditor(props: CakeEditorProps, outerRef) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const extensionsRootRef = useRef<HTMLDivElement | null>(null);
    const engineRef = useRef<CakeEditorEngine | null>(null);
    const onChangeRef = useRef(props.onChange);
    const onSelectionChangeRef = useRef(props.onSelectionChange);
    const lastEmittedValueRef = useRef<string | null>(null);
    const lastEmittedSelectionRef = useRef<Selection | null>(null);
    const [uiComponents, setUiComponents] = useState<CakeUIComponent[]>([]);

    const extensionsRef = useRef<CakeExtension[]>(props.extensions);

    useEffect(() => {
      onChangeRef.current = props.onChange;
      onSelectionChangeRef.current = props.onSelectionChange;
    }, [props.onChange, props.onSelectionChange]);

    useEffect(() => {
      engineRef.current?.syncPlaceholder();
    }, [props.placeholder]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const extensionsRoot = document.createElement("div");
      extensionsRoot.className = "cake-extension-overlay";
      extensionsRoot.contentEditable = "false";
      document.body.appendChild(extensionsRoot);
      extensionsRootRef.current = extensionsRoot;

      let rafId: number | null = null;
      const syncOverlayPosition = () => {
        rafId = null;
        if (!extensionsRootRef.current) {
          return;
        }
        const rect = container.getBoundingClientRect();
        const overlay = extensionsRootRef.current;
        overlay.style.position = "fixed";
        overlay.style.top = `${rect.top}px`;
        overlay.style.left = `${rect.left}px`;
        overlay.style.width = `${rect.width}px`;
        overlay.style.height = `${rect.height}px`;
        overlay.style.pointerEvents = "none";
        // Important: allow popovers (e.g. mentions) to overflow editor bounds without being clipped.
        overlay.style.overflow = "visible";
      };

      const scheduleSync = () => {
        if (rafId !== null) {
          return;
        }
        rafId = window.requestAnimationFrame(syncOverlayPosition);
      };

      // Initial positioning before engine mounts overlays.
      syncOverlayPosition();

      document.addEventListener("scroll", scheduleSync, {
        capture: true,
        passive: true,
      });
      window.addEventListener("resize", scheduleSync, { passive: true });

      let resizeObserver: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(scheduleSync);
        resizeObserver.observe(container);
      }

      const engine = new CakeEditorEngine({
        container,
        extensionsRoot,
        value: props.value,
        selection: props.selection ?? undefined,
        extensions: extensionsRef.current,
        readOnly: props.disabled ?? false,
        spellCheckEnabled: props.spellCheck ?? false,
        onChange: (value, selection) => {
          lastEmittedValueRef.current = value;
          lastEmittedSelectionRef.current = selection;
          onChangeRef.current(value);
          onSelectionChangeRef.current?.(
            selection.start,
            selection.end,
            selection.affinity,
          );
        },
        onSelectionChange: (selection) => {
          lastEmittedSelectionRef.current = selection;
          onSelectionChangeRef.current?.(
            selection.start,
            selection.end,
            selection.affinity,
          );
        },
      });

      engineRef.current = engine;
      setUiComponents(engine.getUIComponents());

      return () => {
        document.removeEventListener("scroll", scheduleSync, { capture: true });
        window.removeEventListener("resize", scheduleSync);
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
        }
        resizeObserver?.disconnect();

        engine.destroy();
        engineRef.current = null;
        setUiComponents([]);

        extensionsRootRef.current = null;
        extensionsRoot.remove();
      };
    }, []);

    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) {
        return;
      }
      engine.setReadOnly(props.disabled ?? false);
    }, [props.disabled]);

    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) {
        return;
      }
      engine.setSpellCheckEnabled(props.spellCheck ?? false);
    }, [props.spellCheck]);

    useEffect(() => {
      const engine = engineRef.current;
      if (!engine) {
        return;
      }
      const nextValue = props.value;
      const nextSelection = props.selection
        ? toEngineSelection(props.selection)
        : undefined;
      const lastEmittedValue = lastEmittedValueRef.current;

      // If the value matches what we emitted, don't accept selection changes from props.
      // This prevents stale selection props (from React batching during fast typing)
      // from resetting the engine's selection.
      if (lastEmittedValue === nextValue) {
        return;
      }
      engine.setValue({
        value: nextValue,
        selection: nextSelection,
      });
    }, [props.value, props.selection]);

    useImperativeHandle(outerRef, () => {
      return {
        element: containerRef.current,
        focus: (selection?: CakeEditorSelection) => {
          const sel = selection ? toEngineSelection(selection) : undefined;
          engineRef.current?.focus(sel);
        },
        blur: () => {
          engineRef.current?.blur();
        },
        hasFocus: () => {
          return engineRef.current?.hasFocus() ?? false;
        },
        selectAll: () => {
          engineRef.current?.selectAll();
        },
        executeCommand: (
          command: EditCommand,
          options?: { restoreFocus?: boolean },
        ) => {
          if (!engineRef.current) {
            return false;
          }
          return engineRef.current.executeCommand(command, options);
        },
        applyUpdate: (update: CakeEditorUpdate) => {
          if (!engineRef.current) {
            return;
          }
          const engine = engineRef.current;
          const selection = update.selection
            ? toEngineSelection(update.selection)
            : undefined;
          if (update.value !== undefined) {
            engine.setValue({
              value: update.value,
              selection,
            });
            if (update.focus) {
              engine.focus(selection);
            }
            return;
          }
          if (update.selection) {
            if (!selection) {
              return;
            }
            engine.setSelection(selection);
            if (update.focus) {
              engine.focus(selection);
            }
            return;
          }
          if (update.focus) {
            engine.focus();
          }
        },
        getValue: () => engineRef.current?.getValue() ?? props.value,
        getSelection: () => {
          const selection = engineRef.current?.getSelection();
          if (!selection) {
            return null;
          }
          return { start: selection.start, end: selection.end };
        },
        getText: () => engineRef.current?.getText() ?? "",
        getTextSelection: () =>
          engineRef.current?.getTextSelection() ?? { start: 0, end: 0 },
        setTextSelection: (selection: { start: number; end: number }) => {
          engineRef.current?.setTextSelection(selection);
        },
        getTextBeforeCursor: (maxChars?: number) =>
          engineRef.current?.getTextBeforeCursor(maxChars) ?? "",
        getTextAroundCursor: (before: number, after: number) =>
          engineRef.current?.getTextAroundCursor(before, after) ?? {
            before: "",
            after: "",
          },
        replaceTextBeforeCursor: (chars: number, replacement: string) => {
          engineRef.current?.replaceTextBeforeCursor(chars, replacement);
        },
        getCursorLength: () => engineRef.current?.getCursorLength() ?? 0,
        insertText: (text: string) => {
          engineRef.current?.insertText(text);
        },
        replaceText: (oldText: string, newText: string) => {
          engineRef.current?.replaceText(oldText, newText);
        },
        getActiveMarks: () => engineRef.current?.getActiveMarks() ?? [],
      };
    }, [props.value]);

    const rootStyle = props.style
      ? { ...props.style, position: props.style.position ?? "relative" }
      : ({ position: "relative" } satisfies React.CSSProperties);

    const rootClassName = props.className
      ? `cake-root ${props.className}`
      : "cake-root";

    const scrollerClassName = props.scrollerClassName
      ? `cake-scroller ${props.scrollerClassName}`
      : "cake-scroller";

    const scrollerBaselineStyle = {
      height: "100%",
      width: "100%",
      overflowY: "auto",
      overflowX: "hidden",
    } satisfies React.CSSProperties;

    const scrollerStyle = props.scrollerStyle
      ? { ...scrollerBaselineStyle, ...props.scrollerStyle }
      : scrollerBaselineStyle;

    return (
      <div ref={rootRef} className={rootClassName} style={rootStyle}>
        <div
          ref={containerRef}
          className={scrollerClassName}
          data-placeholder={props.placeholder}
          style={scrollerStyle}
          onBlur={(event) => {
            props.onBlur?.(event.nativeEvent);
          }}
        />
        {engineRef.current && uiComponents.length > 0
          ? createPortal(
              uiComponents.map((Component, index) => (
                <Component key={index} editor={engineRef.current!} />
              )),
              engineRef.current.getOverlayRoot(),
            )
          : null}
      </div>
    );
  },
);

CakeEditor.displayName = "CakeEditor";
