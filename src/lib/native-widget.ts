import type { Shortcut } from "@/lib/types";

type NativeWidgetMessage =
  | { action: "close" }
  | { action: "copy" | "insert"; text: string; close: boolean }
  | { action: "resize"; width: number; height: number }
  | { action: "shortcut"; shortcut: Shortcut };

type NativeWidgetHandler = {
  postMessage: (message: NativeWidgetMessage) => void;
};

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        talkaiWidget?: NativeWidgetHandler;
      };
    };
  }
}

function handler(): NativeWidgetHandler | null {
  if (typeof window === "undefined") return null;
  return window.webkit?.messageHandlers?.talkaiWidget ?? null;
}

export function isNativeWidget(): boolean {
  return typeof window !== "undefined" && Boolean(handler());
}

export function postNativeWidget(message: NativeWidgetMessage): boolean {
  const bridge = handler();
  if (!bridge) return false;
  bridge.postMessage(message);
  return true;
}

export function syncNativeWidgetShortcut(shortcut: Shortcut): void {
  postNativeWidget({ action: "shortcut", shortcut });
}

export function resizeNativeWidget(height: number): void {
  postNativeWidget({ action: "resize", width: 380, height });
}
