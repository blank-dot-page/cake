import {
  type CakeExtension,
  type EditResult,
  type ParseBlockResult,
  type SerializeBlockResult,
} from "../../core/runtime";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";
import type { Block } from "../../core/types";

const DIVIDER_KIND = "divider";
const DIVIDER_PATTERN = /^-{3,}$/;

function findLineStartInSource(source: string, sourceOffset: number): number {
  let lineStart = sourceOffset;
  while (lineStart > 0 && source[lineStart - 1] !== "\n") {
    lineStart -= 1;
  }
  return lineStart;
}

function handleDividerAutoformat(
  source: string,
  sourcePos: number,
): { nextSource: string; nextSourceCursor: number } | null {
  const lineStart = findLineStartInSource(source, sourcePos);
  let lineEnd = source.indexOf("\n", sourcePos);
  if (lineEnd === -1) {
    lineEnd = source.length;
  }

  if (source.slice(lineStart, sourcePos) !== "--") {
    return null;
  }

  if (source.slice(sourcePos, lineEnd) !== "") {
    return null;
  }

  const lineReplacement = lineEnd === source.length ? "---\n" : "---";
  const nextSource =
    source.slice(0, lineStart) + lineReplacement + source.slice(lineEnd);
  const nextSourceCursor =
    lineStart + lineReplacement.length + (lineEnd === source.length ? 0 : 1);

  return {
    nextSource,
    nextSourceCursor,
  };
}

export const dividerExtension: CakeExtension = (editor) => {
  const disposers: Array<() => void> = [];

  disposers.push(
    editor.registerParseBlock((source, start): ParseBlockResult => {
      let lineEnd = source.indexOf("\n", start);
      if (lineEnd === -1) {
        lineEnd = source.length;
      }

      const line = source.slice(start, lineEnd).trim();
      if (!DIVIDER_PATTERN.test(line)) {
        return null;
      }

      return {
        block: {
          type: "block-atom",
          kind: DIVIDER_KIND,
        },
        nextPos: lineEnd,
      };
    }),
  );

  disposers.push(
    editor.registerSerializeBlock((block): SerializeBlockResult | null => {
      if (block.type !== "block-atom" || block.kind !== DIVIDER_KIND) {
        return null;
      }

      const builder = new CursorSourceBuilder();
      builder.appendCursorAtom("---");
      return builder.build();
    }),
  );

  disposers.push(
    editor.registerNormalizeBlock((block): Block | null => {
      if (block.type !== "block-atom" || block.kind !== DIVIDER_KIND) {
        return block;
      }

      return block;
    }),
  );

  disposers.push(
    editor.registerBlockRenderer((block, context) => {
      if (block.type !== "block-atom" || block.kind !== DIVIDER_KIND) {
        return null;
      }

      const element = document.createElement("div");
      element.setAttribute("data-block-atom", DIVIDER_KIND);
      element.setAttribute("data-block-extension", DIVIDER_KIND);
      element.setAttribute("data-line-index", String(context.getLineIndex()));
      element.classList.add("cake-line");
      context.incrementLineIndex();

      element.setAttribute("contenteditable", "false");
      element.style.lineHeight = "inherit";
      element.style.minHeight = "1lh";
      element.style.display = "flex";
      element.style.alignItems = "center";

      const divider = document.createElement("hr");
      divider.className = "cake-divider";
      divider.style.width = "100%";
      divider.style.margin = "0";
      element.appendChild(divider);

      return element;
    }),
  );

  disposers.push(
    editor.registerSerializeBlockToHtml((block) => {
      if (block.type !== "block-atom" || block.kind !== DIVIDER_KIND) {
        return null;
      }

      return "<hr>";
    }),
  );

  disposers.push(
    editor.registerOnEdit((command, state): EditResult | null => {
      if (command.type !== "insert" || command.text !== "-") {
        return null;
      }

      const { source, selection, map, runtime } = state;
      if (selection.start !== selection.end) {
        return null;
      }

      const cursorPos = Math.max(
        0,
        Math.min(map.cursorLength, selection.start),
      );
      const sourcePos = map.cursorToSource(
        cursorPos,
        selection.affinity ?? "forward",
      );
      const autoformat = handleDividerAutoformat(source, sourcePos);
      if (!autoformat) {
        return null;
      }

      const next = runtime.createState(autoformat.nextSource);
      const caretCursor = next.map.sourceToCursor(
        autoformat.nextSourceCursor,
        "forward",
      );

      return {
        source: autoformat.nextSource,
        selection: {
          start: caretCursor.cursorOffset,
          end: caretCursor.cursorOffset,
          affinity: "forward",
        },
      };
    }),
  );

  return () =>
    disposers
      .splice(0)
      .reverse()
      .forEach((d) => d());
};
