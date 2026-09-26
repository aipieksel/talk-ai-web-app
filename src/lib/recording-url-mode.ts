export const RECORDING_URL_STYLESHEET = "/talkai-recording-mode.css";

export function isRecordingUrlMode(search = window.location.search): boolean {
  return new URLSearchParams(search).get("record") === "1";
}

export function mountRecordingUrlStylesheet(search = window.location.search): () => void {
  if (!isRecordingUrlMode(search)) return () => undefined;

  document.documentElement.classList.add("talkai-recording-url-mode");

  const existing = document.querySelector<HTMLLinkElement>(
    'link[data-talkai-recording-url-mode="true"]',
  );
  if (existing) {
    return () => document.documentElement.classList.remove("talkai-recording-url-mode");
  }

  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  stylesheet.href = RECORDING_URL_STYLESHEET;
  stylesheet.dataset.talkaiRecordingUrlMode = "true";
  document.head.append(stylesheet);

  return () => {
    stylesheet.remove();
    document.documentElement.classList.remove("talkai-recording-url-mode");
  };
}
