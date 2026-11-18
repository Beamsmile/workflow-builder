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
  const max = Math.max(1, maxChars);
  const lines: string[] = [];
  let line = '';
  for (const word of thaiWords(clean)) {
    if ((line + word).length <= max) {
      line += word;
      continue;
    }
    if (line.trim()) lines.push(line.trim());
    line = word.trimStart();
    // คำเดียวยาวเกินบรรทัด (เช่น รหัสยาว ๆ) — จำเป็นต้องหักกลางคำ แต่ไม่ให้สระ/วรรณยุกต์หลุดไปขึ้นบรรทัดใหม่
    while (line.length > max) {
      const cut = safeCut(line, max);
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

/**
 * แบ่งข้อความเป็นคำ — ภาษาไทยไม่เว้นวรรคระหว่างคำ ถ้าตัดตามจำนวนตัวอักษรจะได้
 * "ซ่อมแ / ซม" หรือสระลอย "ขั / ้นตอน" (เจอในงานจริง 18 พ.ย. 2569)
 * จึงใช้ตัวตัดคำไทยที่มีในเบราว์เซอร์ (Intl.Segmenter) — ถ้าเครื่องไหนไม่มี ใช้คำละช่องว่างแทน
 */
const segmenter: { segment(s: string): Iterable<{ segment: string }> } | null = (() => {
  try {
    const S = (Intl as unknown as { Segmenter?: new (l: string, o: object) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
    return S ? new S('th', { granularity: 'word' }) : null;
  } catch {
    return null;
  }
})();

function thaiWords(text: string): string[] {
  if (!segmenter) return text.split(/(?<= )/);
  const out: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    // ช่องว่างติดไปกับคำหน้า บรรทัดใหม่จึงไม่ขึ้นต้นด้วยช่องว่าง และวงเล็บเปิดติดไปกับคำหลัง "(ZPM4)"
    if (segment === ' ' && out.length) out[out.length - 1] += segment;
    // วงเล็บปิด / เครื่องหมายวรรคตอน / ๆ ฯ ติดไปกับคำหน้า — ไม่ให้ ")" หลุดไปขึ้นต้นบรรทัดใหม่
    else if (out.length && /^[)\]”’,.:;!?%ๆฯ]+$/.test(segment)) out[out.length - 1] += segment;
    else if (out.length && /^[(\[“"]$/.test(out[out.length - 1])) out[out.length - 1] += segment;
    else out.push(segment);
  }
  return out;
}

/** จุดหักกลางคำที่ไม่ทำให้สระบน/ล่าง วรรณยุกต์ หรือสระ ำ ไปขึ้นต้นบรรทัดใหม่ */
function safeCut(s: string, max: number): number {
  let cut = max;
  while (cut > 1 && /[ะ-ฺ็-๎]/.test(s[cut])) cut--;
  return cut;
}

/** สระบน/ล่างและวรรณยุกต์ไทยไม่กินที่แนวนอน — ไม่นับตอนกะความกว้าง */
const THAI_MARKS = /[ัิ-ฺ็-๎]/g;

/**
 * ความกว้างโดยประมาณ (px) ของป้ายกิ่งบนเส้น (ตัวอักษร 11.5px ตัวหนา + ขอบ)
 * ใช้ทั้งตอนวางผัง (หลบเส้น/ป้ายอื่น) และตอนวาดพื้นขาวใต้ป้าย ให้สองที่ตรงกัน
 */
export function edgeLabelWidth(text: string): number {
  return text.replace(THAI_MARKS, '').length * 6.4 + 16;
}

/**
 * ความกว้าง (px) ของจุดเชื่อม/ข้ามหน้า บนเว็บ — เดิมวงกลมตายตัวแล้วตัดป้ายเหลือ 2 ตัว
 * ทำให้ "C8.1.6" (อ้างถึงกระบวนการอื่น) เหลือแค่ "C8" ตอนนี้ป้ายสั้นยังเป็นวงกลม ป้ายยาวยืดเป็นวงรี
 */
export function connectorWidth(label: string, min: number): number {
  return Math.max(min, Math.round((label || 'A').replace(THAI_MARKS, '').length * 8.2 + 20));
}
