import type { StateCommand } from "@codemirror/state";
import type { BlockExtension, Extension } from "./cake/extensions/overlay-types";

export interface EditorSelectionRange {
  anchor: number;
  head: number;
}

export type EditorSelection = {
  start: number;
  end: number;
  affinity?: "backward" | "forward";
};

export interface EditorChangeMetadata {
  selectionBefore?: EditorSelectionRange | null;
  selectionAfter?: EditorSelectionRange | null;
}

export type EditorSettings = {
  theme: "light" | "dark";
  fullScreenEnabled: boolean;
  spellCheckEnabled: boolean;
  showUpgradeSuccessModal: boolean;
  counterVisible: boolean;
  goalType: "word" | "character" | null;
  goalValue: number | null;
};

export interface EditorUpdate {
  value?: string;
  selection?: EditorSelection;
  focus?: boolean;
  addToHistory?: boolean;
}

export interface EditorTextSegment {
  textStart: number;
  textEnd: number;
  docStart: number;
  docEnd: number;
}

export interface EditorTextSlice {
  text: string;
  segments: EditorTextSegment[] | null;
}

export const defaultEditorSettings: EditorSettings = {
  theme: "light",
  spellCheckEnabled: false,
  fullScreenEnabled: false,
  showUpgradeSuccessModal: true,
  counterVisible: false,
  goalType: null,
  goalValue: null,
};

export interface EditorProps {
  initialValue: string;
  value: string;
  disabled?: boolean;
  ref: React.MutableRefObject<HTMLElement | null>;
  extensions?: Extension[];
  blockExtensions?: BlockExtension[];
  onSelectionChange?: (
    start: number,
    end: number,
    affinity?: EditorSelection["affinity"],
  ) => void;
  selection?: EditorSelection;
  onBlur?: (event?: FocusEvent) => void;
  onChange: (value: string, metadata?: EditorChangeMetadata) => void;
  settings: EditorSettings;
  className?: string;
  placeholder: string;
  style?: React.CSSProperties;
  headerHeight?: number;
  pageId: string | null;
  canUploadImage: () => boolean;
  onHistoryChange?: (params: { canUndo: boolean; canRedo: boolean }) => void;
}

export interface EditorRefHandle {
  element: HTMLElement | null;
  focus: (props?: { selection?: EditorSelection }) => void;
  blur: () => void;
  hasFocus: () => boolean;
  selectAll: () => void;
  executeCommand: (command: StateCommand) => boolean;
  applyUpdate: (update: EditorUpdate) => void;
  getValue?: () => string;
  getSelectedText?: () => EditorTextSlice | null;
  getSelectedMarkdown?: () => string | null;
  getDocSelectionRange?: () => { start: number; end: number } | null;
  getDocTextBetween?: (start: number, end: number) => EditorTextSlice | null;
}
