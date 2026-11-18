/**
 * Export the diagram as PNG or SVG.
 *
 * The diagram is already an <svg> element we render ourselves, so there is no
 * html-to-image / DOM-snapshot trickery: we serialise that SVG to a string,
 * then either download it directly (SVG) or paint it onto a <canvas> (PNG).
 */
import { triggerDownload } from './persistence';

const FONT_STACK =
  "'IBM Plex Sans Thai','Inter','Noto Sans Thai','Helvetica Neue',Arial,sans-serif";

/**
 * ฟอนต์ของผังแบบฝังในไฟล์ (@font-face ที่ชี้ข้อมูลฟอนต์ในตัว)
 *
 * ทำไม: หน้าเว็บโหลด IBM Plex Sans Thai จาก Google Fonts แต่รูป SVG ที่วาดลง canvas (PNG)
 * โหลดอะไรจากข้างนอกไม่ได้ เลยไปใช้ฟอนต์ในเครื่องแทน (เครื่องนี้ไม่มีฟอนต์นี้) ตัวหนังสือกว้างไม่เท่า
 * ที่คำนวณกล่องไว้ → ล้นกล่อง จึงดึงไฟล์ฟอนต์ (เฉพาะชุดไทย + อังกฤษ) มาฝังในรูปเลย
 * ไฟล์ .svg ก็ได้ฟอนต์ติดไปด้วย เปิดเครื่องไหน/แปะ Canva ก็หน้าตาเหมือนบนจอ
 * ถ้าดึงไม่ได้ (ไม่มีเน็ต) ก็ export ต่อได้ตามเดิม แค่ฟอนต์อาจไม่ตรง
 */
let fontCss: Promise<string> | null = null;
function embeddedFonts(): Promise<string> {
  if (!fontCss) {
    fontCss = (async () => {
      const link = document.querySelector<HTMLLinkElement>('link[href*="fonts.googleapis.com/css"]');
      if (!link) return '';
      const css = await (await fetch(link.href)).text();
      // Google แบ่งไฟล์ตามชุดอักษร มีหมายเหตุนำหน้าแต่ละชุด เช่น /* thai */ — เอาแค่ไทยกับละตินพื้นฐาน
      const blocks = css.split(/(?=\/\* )/).filter((b) => /^\/\* (thai|latin) \*\//.test(b));
      const parts = await Promise.all(
        blocks.map(async (b) => {
          const m = b.match(/url\((https:[^)]+)\)/);
          if (!m) return '';
          const buf = await (await fetch(m[1])).arrayBuffer();
          return b.replace(m[1], `data:font/woff2;base64,${toBase64(buf)}`);
        }),
      );
      return parts.join('\n');
    })().catch(() => {
      fontCss = null; // ลองใหม่ครั้งหน้า
      return '';
    });
  }
  return fontCss;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Serialise a live <svg> into a standalone, self-contained SVG string. */
async function serialize(svg: SVGSVGElement): Promise<{ text: string; width: number; height: number }> {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  const vb = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
  const width = vb[2] || svg.clientWidth || 800;
  const height = vb[3] || svg.clientHeight || 600;

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  // solid white background so it looks right on slides / in Canva
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0');
  bg.setAttribute('y', '0');
  bg.setAttribute('width', String(width));
  bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#ffffff');
  clone.insertBefore(bg, clone.firstChild);

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `${await embeddedFonts()}\ntext{font-family:${FONT_STACK};}`;
  clone.insertBefore(style, clone.firstChild);

  return { text: new XMLSerializer().serializeToString(clone), width, height };
}

function svgToDataUrl(text: string): string {
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
}

export async function exportSvg(svg: SVGSVGElement | null, fileStem: string) {
  if (!svg) return alert('ยังไม่มีผังให้บันทึก');
  const { text } = await serialize(svg);
  triggerDownload(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), `${fileStem}.svg`);
}

export async function exportPng(svg: SVGSVGElement | null, fileStem: string, scale = 2) {
  if (!svg) return alert('ยังไม่มีผังให้บันทึก');
  const blob = await renderPng(svg, scale);
  if (blob) triggerDownload(blob, `${fileStem}.png`);
}

/** วาด SVG ลง canvas → PNG (แยกออกมาให้ทดสอบได้โดยไม่ต้องดาวน์โหลด) */
export async function renderPng(svg: SVGSVGElement, scale = 2): Promise<Blob | null> {
  const { text, width, height } = await serialize(svg);

  const img = new Image();
  img.decoding = 'sync';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('โหลดรูป SVG ไม่สำเร็จ'));
    img.src = svgToDataUrl(text);
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    alert('เบราว์เซอร์ไม่รองรับการสร้าง PNG');
    return null;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
