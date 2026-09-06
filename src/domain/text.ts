/**
 * Text wrapping for the diagram. Thai has no spaces, so we break at a space
 * when there is a sensible one and hard-break on the character count otherwise.
 *
 * There is NO line cap and NO ellipsis — every label is shown in full; the
 * layout engine grows the box to fit however many lines come back.
 */
export function wrapLabel(text: string, maxChars: number): string[] {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const lines: string[] = [];
  let rest = clean;
  let guard = 0;
  while (rest.length && guard++ < 80) {
    if (rest.length <= maxChars) {
      lines.push(rest);
      break;
    }
    let cut = rest.lastIndexOf(' ', maxChars);
    if (cut < maxChars * 0.55) cut = maxChars; // no useful space → hard break
    lines.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return lines;
}
