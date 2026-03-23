import { boldExtension } from "./bold/bold";
import { combinedEmphasisExtension } from "./combined-emphasis/combined-emphasis";
import { linkExtension } from "./link/link";
export type { OnRequestLinkInput, LinkExtensionOptions } from "./link/link";
import { blockquoteExtension } from "./blockquote/blockquote";
import { dividerExtension } from "./divider/divider";
import { italicExtension } from "./italic/italic";
import { headingExtension } from "./heading/heading";
import { imageExtension } from "./image/image";
import { plainTextListExtension } from "./list/list";
import { scrollbarExtension } from "./scrollbar";
import { strikethroughExtension } from "./strikethrough/strikethrough";
import { underlineExtension } from "./underline/underline";
import { mentionExtension } from "./mention/mention";
import { structuralReparsePolicyExtension } from "./shared/structural-reparse-policy";

export {
  boldExtension,
  combinedEmphasisExtension,
  linkExtension,
  blockquoteExtension,
  dividerExtension,
  italicExtension,
  headingExtension,
  imageExtension,
  plainTextListExtension,
  scrollbarExtension,
  strikethroughExtension,
  underlineExtension,
  mentionExtension,
  structuralReparsePolicyExtension,
};

export const bundledExtensionsWithoutImage = [
  structuralReparsePolicyExtension,
  blockquoteExtension,
  dividerExtension,
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
