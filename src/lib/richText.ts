export function isEmptyRichText(html: string | null | undefined): boolean {
  if (!html) return true;
  return html.replace(/<[^>]+>/g, "").replace(/\s|&nbsp;/g, "") === "";
}

export function richTextToPlain(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<\/(p|div|h[1-6]|li|br)\s*\/?>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
