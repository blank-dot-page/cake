import type { CakeExtension } from "../core/runtime";

export type CakeExtensionBundle = {
  name: string;
  extensions: CakeExtension[];
};
