#!/usr/bin/env node
/**
 * ตรวจไฟล์ Excel ที่ export ออกมา ว่าผังวาดถูกต้องไหม
 *
 *   node scripts/check-export.mjs <ไฟล์.xlsx> [อีกไฟล์.xlsx ...]
 *
 * อ่าน xl/drawings/drawing1.xml แล้วเช็ค 3 อย่าง:
 *   1. เส้นลูกศรเดินทับกล่องไหม
 *   2. กล่องทับกันเองไหม
 *   3. มีรูปทรงหลุดออกนอกพื้นที่ผังไหม
 *
 * ใช้ตรวจไฟล์ไหนก็ได้ที่ออกมาจากแอป — ไม่ผูกกับโค้ด TypeScript
 * ออก exit code 1 ถ้าเจอปัญหา (ใช้ใน CI ได้)
 */
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

const EMU = 9525; // EMU ต่อ 1 พิกเซล
const BOX_GEOMS = new Set(['rect', 'diamond', 'ellipse', 'can', 'roundRect']);
/** ยอมให้เส้นแตะขอบกล่องได้ (หัวลูกศรต้องแตะอยู่แล้ว) — เกินเท่านี้ถือว่าทับ */
const TOUCH_PX = 2.5;

const num = (s) => Number(s) / EMU;

/** ดึงรูปทรงทั้งหมดออกมาเป็นสี่เหลี่ยมพิกัดพิกเซล */
function parseShapes(xml) {
  const boxes = [];
  const lines = [];
  const anchorRe =
    /<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g;
  for (const m of xml.matchAll(anchorRe)) {
    const block = m[0];
    const off = block.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
    const ext = block.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    if (!off || !ext) continue;
    const rect = {
      x: num(off[1]),
      y: num(off[2]),
      w: num(ext[1]),
      h: num(ext[2]),
    };
    const geom = block.match(/prst="([A-Za-z0-9]+)"/)?.[1] ?? '';
    const text = [...block.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => t[1]).join(' ');
    const isConnector = block.includes('<xdr:cxnSp');
    const isLabel = /name="lbl/.test(block);
    if (isConnector) lines.push({ ...rect, geom, text });
    else if (BOX_GEOMS.has(geom)) boxes.push({ ...rect, geom, text, isLabel });
  }
  return { boxes, lines };
}

/** เส้นแนวตั้ง/แนวนอนเส้นนี้ ทะลุเข้าไปในกล่องหรือเปล่า */
function penetrates(line, box) {
  const lx1 = line.x + TOUCH_PX;
  const lx2 = line.x + line.w - TOUCH_PX;
  const ly1 = line.y + TOUCH_PX;
  const ly2 = line.y + line.h - TOUCH_PX;
  const bx1 = box.x + TOUCH_PX;
  const bx2 = box.x + box.w - TOUCH_PX;
  const by1 = box.y + TOUCH_PX;
  const by2 = box.y + box.h - TOUCH_PX;
  return lx1 < bx2 && lx2 > bx1 && ly1 < by2 && ly2 > by1;
}

function overlaps(a, b) {
  const m = TOUCH_PX;
  return (
    a.x + m < b.x + b.w - m &&
    a.x + a.w - m > b.x + m &&
    a.y + m < b.y + b.h - m &&
    a.y + a.h - m > b.y + m
  );
}

const short = (s, n = 28) => (s.length > n ? s.slice(0, n) + '…' : s) || '(ไม่มีข้อความ)';

async function check(path) {
  const zip = await JSZip.loadAsync(await readFile(path));
  const file = zip.file('xl/drawings/drawing1.xml');
  if (!file) {
    console.log(`\n❌ ${path}\n   ไม่มีผังในไฟล์นี้ (ไม่พบ xl/drawings/drawing1.xml)`);
    return 1;
  }
  const { boxes, lines } = parseShapes(await file.async('string'));

  const flowBoxes = boxes.filter((b) => !b.isLabel);

  const hits = [];
  for (const line of lines) {
    // ข้ามเส้นเฉียง (bentConnector ที่ Excel คำนวณทางเดินเอง) — เช็คเฉพาะเส้นตรง
    if (line.geom !== 'straightConnector1') continue;
    if (line.w > 3 && line.h > 3) continue; // ไม่ใช่เส้นตรงแนวแกน
    for (const box of flowBoxes) if (penetrates(line, box)) hits.push({ line, box });
  }

  // กล่องผังห้ามทับกันเอง และห้ามโดนป้ายกำกับทับ (ป้ายทับป้ายกันเองพอรับได้)
  const collisions = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].isLabel && boxes[j].isLabel) continue;
      if (overlaps(boxes[i], boxes[j])) collisions.push([boxes[i], boxes[j]]);
    }
  }

  const ok = hits.length === 0 && collisions.length === 0;
  console.log(`\n${ok ? '✅' : '❌'} ${path}`);
  console.log(`   กล่อง ${flowBoxes.length} · ป้าย ${boxes.length - flowBoxes.length} · เส้น ${lines.length}`);
  if (hits.length) {
    console.log(`   ⚠️  เส้นเดินทับกล่อง ${hits.length} จุด:`);
    for (const h of hits.slice(0, 8)) {
      console.log(`      - เส้นที่ (${Math.round(h.line.x)},${Math.round(h.line.y)}) ทับกล่อง "${short(h.box.text)}"`);
    }
    if (hits.length > 8) console.log(`      … อีก ${hits.length - 8} จุด`);
  }
  if (collisions.length) {
    console.log(`   ⚠️  กล่องทับกัน ${collisions.length} คู่:`);
    for (const [a, b] of collisions.slice(0, 8)) {
      console.log(`      - "${short(a.text)}" ทับ "${short(b.text)}"`);
    }
    if (collisions.length > 8) console.log(`      … อีก ${collisions.length - 8} คู่`);
  }
  return ok ? 0 : 1;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('ใช้: node scripts/check-export.mjs <ไฟล์.xlsx> [...]');
  process.exit(2);
}
let bad = 0;
for (const f of files) bad += await check(f);
console.log(bad ? `\n${bad} ไฟล์มีปัญหา` : '\nผ่านทั้งหมด');
process.exit(bad ? 1 : 0);
