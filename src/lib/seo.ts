/**
 * Truncate plain text to a max length, cutting at a word boundary and
 * appending an ellipsis. HTML tags are stripped first. Whitespace is
 * collapsed so multi-paragraph descriptions don't waste characters.
 */
export function metaDescription(input: string | null | undefined, max = 160): string {
  if (!input) return "";
  const plain = input
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;

  const cutoff = max - 1; // leave room for the ellipsis
  const slice = plain.slice(0, cutoff);
  const lastBreak = slice.search(/[\s.,;:!?—–-][^\s.,;:!?—–-]*$/);
  const safe = lastBreak > max * 0.6 ? slice.slice(0, lastBreak) : slice;
  return `${safe.replace(/[\s.,;:!?—–-]+$/, "")}…`;
}
