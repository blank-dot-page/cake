import { defineExtension, type ParseInlineResult } from "../../core/runtime";

const BOLD_KIND = "bold";
const ITALIC_KIND = "italic";

const MARKERS = ["***", "___"] as const;

export const combinedEmphasisExtension = defineExtension({
  name: "combined-emphasis",
  parseInline(source, start, end, context): ParseInlineResult {
    const marker = MARKERS.find((m) => source.slice(start, start + 3) === m);
    if (!marker) {
      return null;
    }

    const char = marker[0];
    // Avoid consuming longer delimiter runs like "****".
    if (source[start + 3] === char) {
      return null;
    }

    const close = source.indexOf(marker, start + 3);
    if (close === -1 || close >= end) {
      return null;
    }

    // Don't match empty delimiter pairs like "******" that often appear as
    // intermediate states while typing.
    if (close === start + 3 && close + 3 < end) {
      return null;
    }

    const children = context.parseInline(source, start + 3, close);

    return {
      inline: {
        type: "inline-wrapper",
        kind: BOLD_KIND,
        children: [
          {
            type: "inline-wrapper",
            kind: ITALIC_KIND,
            children,
          },
        ],
      },
      nextPos: close + 3,
    };
  },
});
