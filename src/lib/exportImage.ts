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

/** Serialise a live <svg> into a standalone, self-contained SVG string. */
function serialize(svg: SVGSVGElement): { text: string; width: number; height: number } {
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
  style.textContent = `text{font-family:${FONT_STACK};}`;
  clone.insertBefore(style, clone.firstChild);

  return { text: new XMLSerializer().serializeToString(clone), width, height };
}

function svgToDataUrl(text: string): string {
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
}

export function exportSvg(svg: SVGSVGElement | null, fileStem: string) {
  if (!svg) return alert('ยังไม่มีผังให้บันทึก');
  const { text } = serialize(svg);
  triggerDownload(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), `${fileStem}.svg`);
}

export async function exportPng(svg: SVGSVGElement | null, fileStem: string, scale = 2) {
  if (!svg) return alert('ยังไม่มีผังให้บันทึก');
  const { text, width, height } = serialize(svg);

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
  if (!ctx) return alert('เบราว์เซอร์ไม่รองรับการสร้าง PNG');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    if (blob) triggerDownload(blob, `${fileStem}.png`);
  }, 'image/png');
}
