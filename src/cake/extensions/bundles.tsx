import type { CakeExtensionBundle } from "./types";
import {
  blockquoteExtension,
  boldExtension,
  combinedEmphasisExtension,
  headingExtension,
  imageExtension,
  italicExtension,
  linkExtension,
  listExtension,
  pipeLinkExtension,
  strikethroughExtension,
} from "./index";

export const bundledExtensionBundles: CakeExtensionBundle[] = [
  { name: "blockquote", extensions: [blockquoteExtension] },
  { name: "heading", extensions: [headingExtension] },
  { name: "list", extensions: [listExtension] },
  { name: "combined-emphasis", extensions: [combinedEmphasisExtension] },
  { name: "bold", extensions: [boldExtension] },
  { name: "italic", extensions: [italicExtension] },
  { name: "strikethrough", extensions: [strikethroughExtension] },
  { name: "pipe-link", extensions: [pipeLinkExtension] },
  {
    name: "link",
    extensions: [linkExtension],
  },
  { name: "image", extensions: [imageExtension] },
];
