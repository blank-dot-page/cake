import {
  defineExtension,
  type ParseBlockResult,
  type SerializeBlockResult,
} from "../../core/runtime";
import { CursorSourceBuilder } from "../../core/mapping/cursor-source-map";
import type { Block } from "../../core/types";

const IMAGE_KIND = "image";
const IMAGE_PATTERN = /^!\[([^\]]*)\]\(([^)]*)\)$/;
const UPLOADING_PATTERN = /^!\[uploading:([^\]]+)\]\(\)$/;
const UPLOADING_PLACEHOLDER_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

type ImageData =
  | { status: "uploading"; id: string }
  | { status: "ready"; alt: string; url: string };

function isImageData(data: unknown): data is ImageData {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  if (obj.status === "uploading" && typeof obj.id === "string") {
    return true;
  }
  if (
    obj.status === "ready" &&
    typeof obj.alt === "string" &&
    typeof obj.url === "string"
  ) {
    return true;
  }
  return false;
}

export const imageExtension = defineExtension({
  name: "image",
  parseBlock(source, start): ParseBlockResult {
    let lineEnd = source.indexOf("\n", start);
    if (lineEnd === -1) {
      lineEnd = source.length;
    }

    const line = source.slice(start, lineEnd).trim();
    const uploadingMatch = line.match(UPLOADING_PATTERN);
    if (uploadingMatch) {
      return {
        block: {
          type: "block-atom",
          kind: IMAGE_KIND,
          data: {
            status: "uploading",
            id: uploadingMatch[1],
          } satisfies ImageData,
        },
        nextPos: lineEnd,
      };
    }

    const imageMatch = line.match(IMAGE_PATTERN);
    if (!imageMatch) {
      return null;
    }

    return {
      block: {
        type: "block-atom",
        kind: IMAGE_KIND,
        data: {
          status: "ready",
          alt: imageMatch[1],
          url: imageMatch[2],
        } satisfies ImageData,
      },
      nextPos: lineEnd,
    };
  },
  serializeBlock(block, _context): SerializeBlockResult | null {
    if (block.type !== "block-atom" || block.kind !== IMAGE_KIND) {
      return null;
    }

    let source = "";
    if (isImageData(block.data)) {
      if (block.data.status === "uploading") {
        source = `![uploading:${block.data.id}]()`;
      } else {
        source = `![${block.data.alt}](${block.data.url})`;
      }
    }

    const builder = new CursorSourceBuilder();
    builder.appendSourceOnly(source);
    return builder.build();
  },
  normalizeBlock(block): Block | null {
    if (block.type !== "block-atom" || block.kind !== IMAGE_KIND) {
      return block;
    }
    return block;
  },
  renderBlock(block, context) {
    if (block.type !== "block-atom" || block.kind !== IMAGE_KIND) {
      return null;
    }

    const element = document.createElement("div");
    element.setAttribute("data-block-atom", IMAGE_KIND);
    element.setAttribute("data-block-extension", IMAGE_KIND);
    element.setAttribute("data-line-index", String(context.getLineIndex()));
    element.classList.add("cake-line");
    context.incrementLineIndex();

    element.setAttribute("contenteditable", "false");
    if (isImageData(block.data)) {
      if (block.data.status === "uploading") {
        const skeleton = document.createElement("div");
        skeleton.dataset.testid = "image-upload-skeleton";
        skeleton.className =
          "cake-image-skeleton animate-pulse bg-gray-200 dark:bg-gray-700 rounded";
        skeleton.style.width = "300px";
        skeleton.style.height = "200px";
        element.appendChild(skeleton);

        const image = document.createElement("img");
        image.src = UPLOADING_PLACEHOLDER_SRC;
        image.alt = "";
        image.className = "cake-image";
        element.appendChild(image);
      } else {
        const image = document.createElement("img");
        image.src = block.data.url;
        image.alt = block.data.alt;
        image.className = "cake-image";
        element.appendChild(image);
      }
    }

    return element;
  },
});
