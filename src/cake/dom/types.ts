import type { Block, Inline } from "../core/types";
import type { TextRun } from "./dom-map";

export type DomRenderContext = {
  renderInline: (inline: Inline) => Node[];
  renderBlock: (block: Block) => Node[];
  renderBlocks: (blocks: Block[]) => Node[];
  createTextRun: (node: Text) => TextRun;
  getLineIndex: () => number;
  incrementLineIndex: () => void;
};
