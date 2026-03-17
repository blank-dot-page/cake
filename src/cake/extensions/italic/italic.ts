import {
  type CakeExtension,
  type SerializeBlockResult,
  type EditCommand,
  type ParseInlineResult,
  type SerializeInlineResult,
} from "../../core/runtime";
import type { Block, Inline } from "../../core/types";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";
import { hasInlineMarkerBoundaryBefore } from "../shared/inline-marker-boundary";

const ITALIC_KIND = "italic";

function buildItalicSerialization(
  childResults: SerializeInlineResult[],
  marker: "*" | "_",
): SerializeInlineResult {
  const builder = new CursorSourceBuilder();
  builder.appendSourceOnly(marker);
  for (const child of childResults) {
    builder.appendSerialized(child);
  }
  builder.appendSourceOnly(marker);
  return builder.build();
}

function canParseSerializedUnderscoreRun(
  source: string,
  start: number,
  close: number,
): boolean {
  return (
    source[start + 1] === "*" ||
    source[close - 1] === "*" ||
    source[close + 1] === "*"
  );
}

export function serializeItalicInlineWithMarker(
  inline: Inline & { type: "inline-wrapper" },
  context: {
    serializeInline: (inline: Inline) => SerializeInlineResult;
  },
  marker: "*" | "_",
): SerializeInlineResult {
  const childResults = inline.children.map((child) => context.serializeInline(child));
  return buildItalicSerialization(childResults, marker);
}

function serializeInlineSequenceWithSafeItalic(
  inlines: Inline[],
  context: {
    serializeInline: (inline: Inline) => SerializeInlineResult;
  },
): SerializeBlockResult {
  const builder = new CursorSourceBuilder();
  const defaultResults = inlines.map((inline) => context.serializeInline(inline));
  let previousSource = "";

  inlines.forEach((inline, index) => {
    const nextSource = defaultResults[index + 1]?.source ?? "";
    const serialized =
      inline.type === "inline-wrapper" &&
      inline.kind === ITALIC_KIND &&
      (previousSource.endsWith("*") || nextSource.startsWith("*"))
        ? serializeItalicInlineWithMarker(inline, context, "_")
        : (defaultResults[index] ?? context.serializeInline(inline));
    builder.appendSerialized(serialized);
    previousSource = serialized.source;
  });

  return builder.build();
}

function findItalicClose(
  source: string,
  start: number,
  end: number,
  marker: "*" | "_",
): number {
  if (marker === "_") {
    return source.indexOf("_", start + 1);
  }

  for (let i = start + 1; i < end; i += 1) {
    if (source[i] !== "*") {
      continue;
    }

    let runStart = i;
    while (runStart > start + 1 && source[runStart - 1] === "*") {
      runStart -= 1;
    }
    let runEnd = i;
    while (runEnd + 1 < end && source[runEnd + 1] === "*") {
      runEnd += 1;
    }

    const runLength = runEnd - runStart + 1;
    if (runLength === 1) {
      if (hasUnmatchedBoldRun(source, start + 1, i)) {
        continue;
      }
      return i;
    }

    const hasUnmatchedBold = hasUnmatchedBoldRun(source, start + 1, runStart);
    const hasBoldCloserAhead = source.indexOf("**", runEnd + 1) !== -1;
    if (!hasBoldCloserAhead) {
      if (runLength === 2 && hasUnmatchedBold) {
        i = runEnd;
        continue;
      }
      if (runLength >= 3 && hasUnmatchedBold) {
        return runEnd;
      }
      return runStart;
    }

    i = runEnd;
  }
  return -1;
}

function hasUnmatchedBoldRun(
  source: string,
  start: number,
  end: number,
): boolean {
  let parity = 0;
  for (let i = start; i < end; i += 1) {
    if (source[i] !== "*" || source[i + 1] !== "*") {
      continue;
    }
    if (source[i - 1] === "*" || source[i + 2] === "*") {
      continue;
    }
    parity ^= 1;
    i += 1;
  }
  return parity === 1;
}

/** Semantic command to toggle italic formatting */
type ToggleItalicCommand = { type: "toggle-italic" };

export const italicExtension: CakeExtension = (editor) => {
  const disposers: Array<() => void> = [];

  disposers.push(
    editor.registerToggleInline({ kind: ITALIC_KIND, markers: ["*", "_"] }),
  );
  disposers.push(
    editor.registerKeybindings([
      { key: "i", meta: true, command: { type: "toggle-italic" } },
      { key: "i", ctrl: true, command: { type: "toggle-italic" } },
    ]),
  );
  disposers.push(
    editor.registerInlineWrapperAffinity([
      { kind: ITALIC_KIND, inclusive: true },
    ]),
  );
  disposers.push(
    editor.registerOnEdit((command) => {
      // Handle semantic command by delegating to toggle-inline
      if (command.type === "toggle-italic") {
        return { type: "toggle-inline", marker: "*" } as EditCommand;
      }
      return null;
    }),
  );
  disposers.push(
    editor.registerParseInline(
      (source, start, end, context): ParseInlineResult => {
        const char = source[start];
        // Support both * and _ for italic (like v1)
        // Note: ** is handled by bold extension which should be registered first
        if (char !== "_" && char !== "*") {
          return null;
        }
        // Don't match ** (that's bold)
        if (char === "*" && source[start + 1] === "*") {
          return null;
        }
        // Avoid parsing a trailing "*hello*" when the opener is part of an
        // unbalanced bold delimiter run (e.g. "**hello*"). In those cases, Cake
        // should render the text literally rather than applying partial formatting.
        if (char === "*" && start > 0 && source[start - 1] === "*") {
          return null;
        }

        const close = findItalicClose(
          source,
          start,
          end,
          char as "*" | "_",
        );
        if (close === -1 || close >= end) {
          return null;
        }
        if (
          char === "_" &&
          !hasInlineMarkerBoundaryBefore(source, start) &&
          !canParseSerializedUnderscoreRun(source, start, close)
        ) {
          return null;
        }
        // Don't match empty delimiters like ** that could be start of bold
        if (close === start + 1 && close + 1 < end) {
          return null;
        }

        const children = context.parseInline(source, start + 1, close);
        return {
          inline: {
            type: "inline-wrapper",
            kind: ITALIC_KIND,
            children,
          },
          nextPos: close + 1,
        };
      },
    ),
  );
  disposers.push(
    editor.registerSerializeBlock(
      (block, context): SerializeBlockResult | null => {
        if (block.type !== "paragraph") {
          return null;
        }

        return serializeInlineSequenceWithSafeItalic(
          (block as Block & { type: "paragraph" }).content,
          context,
        );
      },
    ),
  );
  disposers.push(
    editor.registerSerializeInline(
      (inline, context): SerializeInlineResult | null => {
        if (inline.type !== "inline-wrapper" || inline.kind !== ITALIC_KIND) {
          return null;
        }

        const childResults = inline.children.map((child) =>
          context.serializeInline(child),
        );
        const firstChildSource = childResults[0]?.source ?? "";
        const lastChildSource = childResults[childResults.length - 1]?.source ?? "";
        const useUnderscore =
          childResults.length > 1 &&
          (firstChildSource.startsWith("*") || lastChildSource.endsWith("*"));

        return buildItalicSerialization(
          childResults,
          useUnderscore ? "_" : "*",
        );
      },
    ),
  );
  disposers.push(
    editor.registerNormalizeInline((inline): Inline | null => {
      if (inline.type !== "inline-wrapper" || inline.kind !== ITALIC_KIND) {
        return inline;
      }

      if (inline.children.length === 0) {
        return null;
      }

      return inline;
    }),
  );
  disposers.push(
    editor.registerInlineRenderer((inline, context) => {
      if (inline.type !== "inline-wrapper" || inline.kind !== ITALIC_KIND) {
        return null;
      }

      const element = document.createElement("em");
      for (const child of inline.children) {
        for (const node of context.renderInline(child)) {
          element.append(node);
        }
      }
      return element;
    }),
  );
  disposers.push(
    editor.registerInlineHtmlSerializer((mark, content) => {
      if (mark.kind !== ITALIC_KIND) {
        return null;
      }
      return `<em>${content}</em>`;
    }),
  );

  return () =>
    disposers
      .splice(0)
      .reverse()
      .forEach((d) => d());
};
