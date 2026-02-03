import { boldExtension } from "./bold/bold";
import { combinedEmphasisExtension } from "./combined-emphasis/combined-emphasis";
import { linkExtension } from "./link/link";
export type { OnRequestLinkInput, LinkExtensionOptions } from "./link/link";
import { blockquoteExtension } from "./blockquote/blockquote";
import { italicExtension } from "./italic/italic";
import { headingExtension } from "./heading/heading";
import { imageExtension } from "./image/image";
import { plainTextListExtension } from "./list/list";
import { scrollbarExtension } from "./scrollbar";
import { strikethroughExtension } from "./strikethrough/strikethrough";
import { underlineExtension } from "./underline/underline";
import { mentionExtension } from "./mention/mention";

export {
  boldExtension,
  combinedEmphasisExtension,
  linkExtension,
  blockquoteExtension,
  italicExtension,
  headingExtension,
  imageExtension,
  plainTextListExtension,
  scrollbarExtension,
  strikethroughExtension,
  underlineExtension,
  mentionExtension,
};

export const bundledExtensionsWithoutImage = [
  blockquoteExtension,
  headingExtension,
  plainTextListExtension,
  combinedEmphasisExtension,
  boldExtension,
  italicExtension,
  strikethroughExtension,
  underlineExtension,
  linkExtension,
];

export const bundledExtensions = [
  ...bundledExtensionsWithoutImage,
  imageExtension,
];
