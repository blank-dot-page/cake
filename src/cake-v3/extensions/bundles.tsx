import type { CakeV3ExtensionBundle } from "./types";
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

export const bundledExtensionBundles: CakeV3ExtensionBundle[] = [
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
