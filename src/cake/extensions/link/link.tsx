import {
  defineExtension,
  type ParseInlineResult,
  type SerializeInlineResult,
} from "../../core/runtime";
import type { Inline } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";
import { CakeLinkPopover } from "./link-popover";
import { getDocLines } from "../../engine/selection/selection-layout";
import {
  cursorOffsetToVisibleOffset,
  getVisibleText,
} from "../../engine/selection/visible-text";
import { ensureHttpsProtocol, isUrl } from "../../shared/url";

const LINK_KIND = "link";

/** Command to wrap selected text in a link */
export type WrapLinkCommand = {
  type: "wrap-link";
  url?: string;
  openPopover?: boolean;
};

/** Command to remove link formatting */
export type UnlinkCommand = {
  type: "unlink";
  start: number;
  end: number;
};

/** All link extension commands */
export type LinkCommand = WrapLinkCommand | UnlinkCommand;

export const linkExtension = defineExtension<LinkCommand>({
  name: "link",
  inlineWrapperAffinity: [{ kind: LINK_KIND, inclusive: false }],
  keybindings: [
    {
      key: "u",
      meta: true,
      shift: true,
      command: (state) => {
        if (state.selection.start === state.selection.end) {
          return null;
        }
        return { type: "wrap-link", openPopover: true };
      },
    },
    {
      key: "u",
      ctrl: true,
      shift: true,
      command: (state) => {
        if (state.selection.start === state.selection.end) {
          return null;
        }
        return { type: "wrap-link", openPopover: true };
      },
    },
  ],
  onEdit(command, state) {
    if (command.type === "unlink") {
      // Find the link at the given cursor position and remove the link markup
      const cursorPos = command.start;
      const sourcePos = state.map.cursorToSource(cursorPos, "forward");
      const source = state.source;

      // Search backwards for the opening bracket
      let linkStart = sourcePos;
      while (linkStart > 0 && source[linkStart] !== "[") {
        linkStart--;
      }
      if (source[linkStart] !== "[") {
        return null;
      }

      // Find the ]( separator
      const labelClose = source.indexOf("](", linkStart + 1);
      if (labelClose === -1) {
        return null;
      }

      // Find the closing )
      const urlClose = source.indexOf(")", labelClose + 2);
      if (urlClose === -1) {
        return null;
      }

      // Extract the label (text between [ and ](  )
      const label = source.slice(linkStart + 1, labelClose);

      // Replace [label](url) with just label
      const nextSource =
        source.slice(0, linkStart) + label + source.slice(urlClose + 1);

      // Calculate new cursor position - place it at the end of the label
      const newState = state.runtime.createState(nextSource);
      const labelEndSource = linkStart + label.length;
      const newCursor = newState.map.sourceToCursor(labelEndSource, "forward");

      return {
        source: nextSource,
        selection: {
          start: newCursor.cursorOffset,
          end: newCursor.cursorOffset,
          affinity: "forward",
        },
      };
    }

    if (command.type !== "wrap-link") {
      return null;
    }
    const selection = state.selection;
    const cursorStart = Math.min(selection.start, selection.end);
    const cursorEnd = Math.max(selection.start, selection.end);
    if (cursorStart === cursorEnd) {
      return null;
    }
    const from = state.map.cursorToSource(cursorStart, "forward");
    const to = state.map.cursorToSource(cursorEnd, "backward");
    if (from === to) {
      return null;
    }
    const label = state.source.slice(from, to);
    const url = command.url ?? "";
    const linkMarkdown = `[${label}](${url})`;
    const nextSource =
      state.source.slice(0, from) + linkMarkdown + state.source.slice(to);
    return {
      source: nextSource,
      selection: {
        start: cursorEnd,
        end: cursorEnd,
        affinity: "backward",
      },
    };
  },
  onPasteText(text, state) {
    if (!isUrl(text)) {
      return null;
    }

    const url = ensureHttpsProtocol(text.trim());
    const selection = state.selection;
    const start = Math.min(selection.start, selection.end);
    const end = Math.max(selection.start, selection.end);

    if (start !== end) {
      const lines = getDocLines(state.doc);
      const visibleText = getVisibleText(lines);
      const visibleStart = cursorOffsetToVisibleOffset(lines, start);
      const visibleEnd = cursorOffsetToVisibleOffset(lines, end);
      const selectedText = visibleText.slice(visibleStart, visibleEnd);
      const linkMarkdown = `[${selectedText}](${url})`;
      return { type: "insert", text: linkMarkdown };
    }

    const linkMarkdown = `[${url}](${url})`;
    return { type: "insert", text: linkMarkdown };
  },
  parseInline(source, start, end, context): ParseInlineResult {
    if (source[start] !== "[") {
      return null;
    }

    // Don't match image syntax ![...](...)
    if (start > 0 && source[start - 1] === "!") {
      return null;
    }

    const labelClose = source.indexOf("](", start + 1);
    if (labelClose === -1 || labelClose >= end) {
      return null;
    }

    const urlClose = source.indexOf(")", labelClose + 2);
    if (urlClose === -1 || urlClose >= end) {
      return null;
    }

    const labelStart = start + 1;
    const labelEnd = labelClose;
    const urlStart = labelClose + 2;
    const urlEnd = urlClose;

    const children = context.parseInline(source, labelStart, labelEnd);
    const url = source.slice(urlStart, urlEnd);

    return {
      inline: {
        type: "inline-wrapper",
        kind: LINK_KIND,
        children,
        data: { url },
      },
      nextPos: urlClose + 1,
    };
  },
  serializeInline(inline, context): SerializeInlineResult | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== LINK_KIND) {
      return null;
    }

    const builder = new CursorSourceBuilder();
    builder.appendSourceOnly("[");
    for (const child of inline.children) {
      const serialized = context.serializeInline(child);
      builder.appendSerialized(serialized);
    }
    builder.appendSourceOnly("](");
    const url = typeof inline.data?.url === "string" ? inline.data.url : "";
    builder.appendSourceOnly(url);
    builder.appendSourceOnly(")");
    return builder.build();
  },
  normalizeInline(inline): Inline | null {
    if (inline.type !== "inline-wrapper" || inline.kind !== LINK_KIND) {
      return inline;
    }

    if (inline.children.length === 0) {
      return null;
    }

    return inline;
  },
  renderInline(inline, context) {
    if (inline.type !== "inline-wrapper" || inline.kind !== LINK_KIND) {
      return null;
    }

    const element = document.createElement("a");
    element.className = "cake-link";
    const url = typeof inline.data?.url === "string" ? inline.data.url : "";
    element.setAttribute("href", url);
    for (const child of inline.children) {
      for (const node of context.renderInline(child)) {
        element.append(node);
      }
    }
    return element;
  },
  renderOverlay(context) {
    if (!context.contentRoot || !context.toOverlayRect) {
      return null;
    }
    return (
      <CakeLinkPopover
        container={context.container}
        contentRoot={context.contentRoot}
        toOverlayRect={context.toOverlayRect}
        getSelection={context.getSelection}
        executeCommand={context.executeCommand}
      />
    );
  },
});
