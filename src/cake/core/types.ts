export type Affinity = "backward" | "forward";

export type Selection = {
  start: number;
  end: number;
  affinity?: Affinity;
};

export type Doc = {
  type: "doc";
  blocks: Block[];
};

export type Block = ParagraphBlock | BlockWrapperBlock | AtomBlock;

export type ParagraphBlock = {
  type: "paragraph";
  content: Inline[];
};

export type BlockWrapperBlock = {
  type: "block-wrapper";
  kind: string;
  blocks: Block[];
  data?: Record<string, unknown>;
};

export type AtomBlock = {
  type: "block-atom";
  kind: string;
  data?: Record<string, unknown>;
};

export type Inline = TextInline | InlineWrapper | InlineAtom;

export type TextInline = {
  type: "text";
  text: string;
};

export type InlineWrapper = {
  type: "inline-wrapper";
  kind: string;
  children: Inline[];
  data?: Record<string, unknown>;
};

export type InlineAtom = {
  type: "inline-atom";
  kind: string;
  data?: Record<string, unknown>;
};
