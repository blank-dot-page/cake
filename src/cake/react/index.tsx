import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Selection } from "../core/types";
import type {
  CakeExtension,
  EditCommand,
  OverlayExtensionContext,
} from "../core/runtime";
import { CakeEngine } from "../engine/cake-engine";

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
  extensions: CakeExtension[];
  onBlur?: (event?: FocusEvent) => void;
}

export interface CakeEditorRef {
  element: HTMLElement | null;
  focus: (selection?: CakeEditorSelection) => void;
  blur: () => void;
  hasFocus: () => boolean;
  selectAll: () => void;
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
}

export const CakeEditor = forwardRef<CakeEditorRef | null, CakeEditorProps>(
  function CakeEditor(props: CakeEditorProps, outerRef) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const engineRef = useRef<CakeEngine | null>(null);
    const onChangeRef = useRef(props.onChange);
    const onSelectionChangeRef = useRef(props.onSelectionChange);
    const lastEmittedValueRef = useRef<string | null>(null);
    const lastEmittedSelectionRef = useRef<Selection | null>(null);
    const [contentRoot, setContentRoot] = useState<HTMLElement | null>(null);

    const extensionsRef = useRef<CakeExtension[]>(props.extensions);
    const hasOverlayExtensions = extensionsRef.current.some(
      (ext) => ext.renderOverlay,
    );

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

      const engine = new CakeEngine({
        container,
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
      setContentRoot(engine.getContentRoot());

      return () => {
        engine.destroy();
        engineRef.current = null;
        setContentRoot(null);
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
        executeCommand: (command: EditCommand, options?: { restoreFocus?: boolean }) => {
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
        getCursorLength: () => engineRef.current?.getCursorLength() ?? 0,
        insertText: (text: string) => {
          engineRef.current?.insertText(text);
        },
        replaceText: (oldText: string, newText: string) => {
          engineRef.current?.replaceText(oldText, newText);
        },
      };
    }, [props.value]);

    const containerStyle = props.style
      ? { ...props.style }
      : ({} satisfies React.CSSProperties);
    if (!containerStyle.position) {
      containerStyle.position = "relative";
    }

    const containerClassName = props.className
      ? `cake ${props.className}`
      : "cake";

    const overlayContext =
      containerRef.current && contentRoot
        ? ({
            container: containerRef.current,
            contentRoot,
            toOverlayRect: (rect) => {
              const containerRect =
                containerRef.current?.getBoundingClientRect();
              if (!containerRect) {
                return {
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                };
              }
              return {
                top: rect.top - containerRect.top,
                left: rect.left - containerRect.left,
                width: rect.width,
                height: rect.height,
              };
            },
            insertText: (text: string) => {
              engineRef.current?.insertText(text);
            },
            replaceText: (oldText: string, newText: string) => {
              engineRef.current?.replaceText(oldText, newText);
            },
            getSelection: () => {
              const selection = engineRef.current?.getSelection();
              if (!selection) {
                return null;
              }
              const focus =
                selection.start === selection.end
                  ? selection.start
                  : Math.max(selection.start, selection.end);
              return { start: focus, end: focus };
            },
            executeCommand: (command) => {
              return engineRef.current?.executeCommand(command) ?? false;
            },
          } satisfies OverlayExtensionContext)
        : null;

    return (
      <div style={{ position: "relative", height: "100%" }}>
        <div
          ref={containerRef}
          className={containerClassName}
          style={containerStyle}
          data-placeholder={props.placeholder}
          onBlur={(event) => {
            props.onBlur?.(event.nativeEvent);
          }}
        />
        {overlayContext && hasOverlayExtensions
          ? extensionsRef.current.map((extension) =>
              extension.renderOverlay ? (
                <Fragment key={extension.name}>
                  {extension.renderOverlay(overlayContext)}
                </Fragment>
              ) : null,
            )
          : null}
      </div>
    );
});

CakeEditor.displayName = "CakeEditor";
