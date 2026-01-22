function detectPlatform(): "mac" | "windows" | "linux" {
  if (typeof navigator === "undefined") {
    return "linux";
  }
  const platform = navigator.platform;
  if (/Mac|iPhone|iPad|iPod/.test(platform)) {
    return "mac";
  }
  if (/Win/.test(platform)) {
    return "windows";
  }
  return "linux";
}

export const currentPlatform = detectPlatform();

// Do not compute platform at module-load time for behavior decisions that depend
// on the current browser environment (tests may override `navigator.platform`).
export function isMacPlatform(): boolean {
  return detectPlatform() === "mac";
}
