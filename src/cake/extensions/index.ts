import { boldExtension } from "./bold/bold";
import { combinedEmphasisExtension } from "./combined-emphasis/combined-emphasis";
import { linkExtension } from "./link/link";
import { blockquoteExtension } from "./blockquote/blockquote";
import { italicExtension } from "./italic/italic";
import { headingExtension } from "./heading/heading";
import { imageExtension } from "./image/image";
import { plainTextListExtension } from "./list/list";
import { scrollbarExtension } from "./scrollbar";
import { strikethroughExtension } from "./strikethrough/strikethrough";

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
};

export const bundledExtensionsWithoutImage = [
  blockquoteExtension,
  headingExtension,
  plainTextListExtension,
  combinedEmphasisExtension,
  boldExtension,
  italicExtension,
  strikethroughExtension,
  linkExtension,
];

export const bundledExtensions = [
  ...bundledExtensionsWithoutImage,
  imageExtension,
];
