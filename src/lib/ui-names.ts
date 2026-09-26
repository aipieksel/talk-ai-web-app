export const UI_PREFIX = "talkai";

export function uiDomId(...parts: Array<string | number | null | undefined>): string {
  const suffix = parts
    .filter((part): part is string | number => part !== null && part !== undefined)
    .map((part) => String(part).trim().toLowerCase())
    .filter(Boolean)
    .join("-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
  return suffix ? `${UI_PREFIX}-${suffix}` : UI_PREFIX;
}
