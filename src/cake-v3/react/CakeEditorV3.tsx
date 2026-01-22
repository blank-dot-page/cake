import {
  Fragment,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { StateCommand } from "@codemirror/state";
import type { EditorProps, EditorRefHandle, EditorUpdate } from "../../editor";
import type { Selection } from "../core/types";
import type { EditCommand } from "../core/runtime";
import { CakeV3Engine } from "../engine/cake-v3-engine";
import type { CakeV3ExtensionBundle } from "../extensions/types";
import { bundledExtensionBundles } from "../extensions/bundles";
import type {
  OverlayExtension,
  OverlayExtensionContext,
} from "../../cake/extensions/types";
import {
  toggleBold,
  toggleItalic,
  toggleLink,
  toggleBulletList,
  toggleNumberedList,
  toggleStrikethrough,
} from "../../codemirror/markdown-commands";

function toEngineSelection(selection?: EditorProps["selection"]): Selection {
  if (!selection) {
    return { start: 0, end: 0, affinity: "forward" };
  }
  return {
    start: selection.start,
    end: selection.end,
    affinity: selection.affinity,
  };
}

const BOLD_MARKER = "**";
const ITALIC_MARKER = "*";
const STRIKETHROUGH_MARKER = "~~";

function mapCommandToEditCommand(command: StateCommand): EditCommand | null {
  if (command === toggleBold) {
    return { type: "toggle-inline", marker: BOLD_MARKER };
  }
  if (command === toggleItalic) {
    return { type: "toggle-inline", marker: ITALIC_MARKER };
  }
  if (command === toggleStrikethrough) {
    return { type: "toggle-inline", marker: STRIKETHROUGH_MARKER };
  }
  if (command === toggleLink) {
    return { type: "wrap-link", openPopover: true };
  }
  if (command === toggleBulletList) {
    return { type: "toggle-bullet-list" };
  }
  if (command === toggleNumberedList) {
    return { type: "toggle-numbered-list" };
  }
  return null;
}

export type CakeEditorV3Props = Omit<EditorProps, "ref"> & {
  extensionBundles?: CakeV3ExtensionBundle[];
};

export const CakeEditorV3 = forwardRef<
  EditorRefHandle | null,
  CakeEditorV3Props
>(function CakeEditorV3(props: CakeEditorV3Props, outerRef) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CakeV3Engine | null>(null);
  const onChangeRef = useRef(props.onChange);
  const onSelectionChangeRef = useRef(props.onSelectionChange);
  const lastEmittedValueRef = useRef<string | null>(null);
  const lastEmittedSelectionRef = useRef<Selection | null>(null);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);
  const [contentRoot, setContentRoot] = useState<HTMLElement | null>(null);

  const extensionBundlesRef = useRef<CakeV3ExtensionBundle[]>(
    props.extensionBundles ?? bundledExtensionBundles,
  );

  const overlayExtensions = useMemo(
    () =>
      (props.extensions ?? []).filter(
        (extension): extension is OverlayExtension =>
          extension.type === "overlay",
      ),
    [props.extensions],
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

    const engine = new CakeV3Engine({
      container,
      value: props.value ?? props.initialValue ?? "",
      selection: props.selection ?? undefined,
      extensions: extensionBundlesRef.current.flatMap(
        (bundle) => bundle.extensions,
      ),
      readOnly: props.disabled ?? false,
      spellCheckEnabled: props.settings.spellCheckEnabled,
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
    setOverlayRoot(engine.getOverlayRoot());
    setContentRoot(engine.getContentRoot());

    return () => {
      engine.destroy();
      engineRef.current = null;
      setOverlayRoot(null);
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
    engine.setSpellCheckEnabled(props.settings.spellCheckEnabled);
  }, [props.settings.spellCheckEnabled]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      return;
    }
    const nextValue = props.value ?? props.initialValue ?? "";
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
  }, [props.value, props.initialValue, props.selection]);

  useImperativeHandle(outerRef, () => {
    return {
      element: containerRef.current,
      focus: (options?: { selection?: EditorProps["selection"] }) => {
        const selection = options?.selection
          ? toEngineSelection(options.selection)
          : undefined;
        engineRef.current?.focus(selection);
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
      executeCommand: (command: StateCommand) => {
        if (!engineRef.current) {
          return false;
        }
        const editCommand = mapCommandToEditCommand(command);
        if (!editCommand) {
          return false;
        }
        return engineRef.current.executeCommand(editCommand);
      },
      applyUpdate: (update: EditorUpdate) => {
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
      getValue: () => engineRef.current?.getValue() ?? props.value ?? "",
      getSelectedText: () => null,
      getSelectedMarkdown: () => null,
      getDocSelectionRange: () => {
        const selection = engineRef.current?.getSelection();
        if (!selection) {
          return null;
        }
        return { start: selection.start, end: selection.end };
      },
      getDocTextBetween: () => null,
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
    overlayRoot && containerRef.current && contentRoot
      ? ({
          container: containerRef.current,
          contentRoot,
          overlayRoot,
          toOverlayRect: (rect) => {
            const containerRect = containerRef.current?.getBoundingClientRect();
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
        } satisfies OverlayExtensionContext)
      : null;

  return (
    <>
      <div
        ref={containerRef}
        className={containerClassName}
        style={containerStyle}
        data-placeholder={props.placeholder}
        onBlur={(event) => {
          props.onBlur?.(event.nativeEvent);
        }}
      />
      {overlayRoot && overlayContext
        ? createPortal(
            <>
              {extensionBundlesRef.current.flatMap((bundle) =>
                bundle.extensions.map((extension) =>
                  extension.renderOverlay ? (
                    <Fragment key={`${bundle.name}:${extension.name}`}>
                      {extension.renderOverlay(overlayContext)}
                    </Fragment>
                  ) : null,
                ),
              )}
              {overlayExtensions.map((extension) => {
                return (
                  <Fragment key={extension.name}>
                    {extension.render(overlayContext)}
                  </Fragment>
                );
              })}
            </>,
            overlayRoot,
          )
        : null}
    </>
  );
});

CakeEditorV3.displayName = "CakeEditorV3";
