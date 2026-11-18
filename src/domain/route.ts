/**
 * วางผังแบบ "ราง" (track layout) — ส่วนที่ไม่ขึ้นกับขนาดจริงของกล่อง
 *
 * ทำไมต้องมีไฟล์นี้: เดิมกล่องทุกกล่องถูกตรึงไว้กลางเลน เส้นที่กระโดดข้ามขั้นจึงต้อง
 * หักออกไปช่องข้างเลนแล้ววกกลับ ทำให้ไขว้กันและป้ายลอยห่างจากเส้น ส่วนผังตัวอย่าง
 * ของทีม (ตัวอย่าง Flow/*.xlsx) แก้ด้วยการ "ขยับกล่องไปอยู่รางของมันเอง" แล้วให้เส้น
 * วิ่งตรงลงมา — ไฟล์นี้ทำแบบเดียวกันโดยอัตโนมัติ
 *
 * วิธีคิด: ทำงานบน "ตาราง" นามธรรม
 *   - แถว = ลำดับขั้น (ตายตัว เพราะตรงกับแถวในตาราง บฟ.)
 *   - คอลัมน์ = (เลน, ราง) — ราง 0 คือกลางเลน, -1 ซ้าย, +1 ขวา ...
 *   - ช่องว่างระหว่างราง (ครึ่งราง) คือ "ทางเดิน" ให้เส้นที่อ้อมจริง ๆ
 * แล้วลองย้ายกล่องทีละกล่องไปรางต่าง ๆ ให้คะแนน (เส้นไขว้ / เส้นทับ / จำนวนหัก)
 * และเก็บแบบที่คะแนนดีที่สุด เพราะผังเป็นแบบนามธรรม ขนาดตัวอักษรหรือความกว้าง
 * กล่องจึงไม่กระทบผล — หน้าเว็บกับ Excel ใช้แผนเดียวกันได้
 *
 * ฟังก์ชันบริสุทธิ์ (ไม่มี React) และเก็บผลไว้ตาม "โครง" ของผัง (เลน + เส้นทาง)
 * พิมพ์ข้อความในกล่องจึงไม่ต้องคำนวณใหม่
 */
import type { Process } from './types';

/** รูปแบบของเส้นหนึ่งเส้น */
export type RouteKind =
  | 'straight' // รางเดียวกัน ลงตรง
  | 'early' // หักแนวนอนใต้กล่องต้นทาง แล้วลงในรางของปลายทาง
  | 'late' // ลงในรางของต้นทาง แล้วหักแนวนอนเหนือกล่องปลายทาง
  | 'corridor' // ทางอ้อม: ออกไปทางเดินข้างราง ลง แล้วเข้าปลายทาง
  | 'loop'; // ย้อนขึ้น: ออกด้านข้างกล่อง ขึ้นไป เข้าด้านข้างกล่องปลายทาง

export interface PlannedEdge {
  from: number;
  to: number;
  kind: RouteKind;
  /** corridor / loop — ตำแหน่งทางเดิน (X นามธรรมที่ลงท้าย .5) */
  corridorX?: number;
  /** loop — ออกและเข้าทางด้านไหนของกล่อง (-1 ซ้าย, 1 ขวา) */
  side?: -1 | 1;
}

export interface FlowPlan {
  /** ลำดับของเลน org ที่แต่ละขั้นอยู่ (นับเฉพาะเลน org) */
  lane: number[];
  /** รางของแต่ละขั้นภายในเลน */
  track: number[];
  edges: PlannedEdge[];
}

/** ระยะห่างของเลนในแกน X นามธรรม — มากพอที่รางกับทางเดินของแต่ละเลนจะไม่ปนกัน */
export const LANE_SPAN = 100;

/** แยก X นามธรรม (เช่น 201.5) กลับเป็นเลน + ตำแหน่งในเลน */
export function splitX(x: number): { lane: number; pos: number } {
  const lane = Math.round(x / LANE_SPAN);
  return { lane, pos: x - lane * LANE_SPAN };
}

// ---- ตำแหน่งแนวตั้งนามธรรมภายในแถว r (เรียงจากบนลงล่างแบบเดียวกับภาพจริง) ----
const Y_IN = -0.2; // เส้นรวมเหนือกล่อง (fan-in)
const Y_TOP = 0; // ขอบบนกล่อง
const Y_MID = 0.25; // กึ่งกลางกล่อง (ใช้กับเส้นย้อนกลับที่เข้าทางด้านข้าง)
const Y_BOT = 0.5; // ขอบล่างกล่อง (รวมป้ายหน่วยงาน)
const Y_OUT = 0.65; // เส้นแยกใต้กล่อง (fan-out)
const BOX_HALF = 0.3; // ครึ่งความกว้างกล่อง — ต้องน้อยกว่า 0.5 ทางเดินจึงไม่ชนกล่อง

// ---- น้ำหนักคะแนน: ยิ่งน้อยยิ่งดี ----
const COST_CROSS = 100; // เส้นตัดกัน — สิ่งที่ผู้ใช้บ่นมากที่สุด
const COST_OVERLAP = 500; // เส้นวิ่งทับกันจนแยกไม่ออก แย่กว่าตัดกัน
const COST_BEND: Record<RouteKind, number> = {
  straight: 0,
  early: 4,
  late: 4.2, // เสมอกันให้เลือก early (กิ่งแยกใต้ต้นทางเหมือนผังตัวอย่าง)
  corridor: 24, // ทางเลือกสุดท้าย — ผังตัวอย่างขยับกล่องหลบมากกว่าอ้อมเส้น
  loop: 6,
};
const COST_HLEN_LANE = 3; // เส้นแนวนอนข้ามเลน = ตาต้องไล่ไกล (ต่อหนึ่งเลน)
const COST_HLEN_TRACK = 1; // เส้นแนวนอนข้ามราง (ต่อหนึ่งราง)
const COST_OFFSET = 3; // ชอบให้กล่องอยู่กลางเลน
const COST_SPREAD = 6; // ชอบให้เลนแคบ (ใช้รางน้อย)

interface Seg {
  e: number; // index ของเส้น
  h: boolean; // แนวนอน?
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface RawEdge {
  from: number;
  to: number;
}

const EPS = 1e-6;

function toSegs(pts: [number, number][], e: number): Seg[] {
  const out: Seg[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k];
    const [bx, by] = pts[k + 1];
    if (Math.abs(ax - bx) < EPS && Math.abs(ay - by) < EPS) continue;
    const h = Math.abs(ay - by) < EPS;
    out.push({
      e,
      h,
      x1: Math.min(ax, bx),
      x2: Math.max(ax, bx),
      y1: Math.min(ay, by),
      y2: Math.max(ay, by),
    });
  }
  return out;
}

interface Candidate {
  kind: RouteKind;
  pts: [number, number][];
  corridorX?: number;
  side?: -1 | 1;
}

/** โครงของผัง — เปลี่ยนเฉพาะเมื่อเลนหรือเส้นทางเปลี่ยน (ไม่รวมข้อความ) */
function topologyKey(laneOf: number[], edges: RawEdge[]): string {
  return laneOf.join(',') + '|' + edges.map((e) => `${e.from}>${e.to}`).join(',');
}

const cache = new Map<string, FlowPlan>();
const CACHE_MAX = 40;

/** รายการเส้น (ไม่ซ้ำ) จากเส้นทางออกของแต่ละขั้น */
export function flowEdges(proc: Process): RawEdge[] {
  const indexById = new Map(proc.steps.map((s, i) => [s.id, i]));
  const seen = new Set<string>();
  const out: RawEdge[] = [];
  proc.steps.forEach((s, i) => {
    for (const b of s.branches ?? []) {
      const j = b.toStepId ? indexById.get(b.toStepId) : undefined;
      if (j === undefined || j === i) continue;
      const k = `${i}>${j}`;
      if (seen.has(k)) continue; // สองกิ่งไปปลายทางเดียวกัน = วาดเส้นเดียว (ป้ายรวมกัน)
      seen.add(k);
      out.push({ from: i, to: j });
    }
  });
  return out;
}

/** เลน org ของแต่ละขั้น (ขั้นที่ไม่ได้อยู่เลน org ไปอยู่เลน org แรก) */
export function orgLaneIndex(proc: Process): number[] {
  const org = proc.lanes.filter((l) => l.kind === 'org');
  const idx = new Map(org.map((l, k) => [l.id, k]));
  return proc.steps.map((s) => idx.get(s.laneId) ?? 0);
}

export function planFlow(proc: Process): FlowPlan {
  const laneOf = orgLaneIndex(proc);
  const edges = flowEdges(proc);
  const key = topologyKey(laneOf, edges);
  const hit = cache.get(key);
  if (hit) return hit;
  const plan = solve(laneOf, edges);
  cache.set(key, plan);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return plan;
}

function solve(laneOf: number[], edges: RawEdge[]): FlowPlan {
  const N = laneOf.length;
  const outDeg = new Array(N).fill(0);
  for (const e of edges) outDeg[e.from]++;
  // กิ่งเยอะ (4 ทางขึ้นไป) ต้องการรางมากขึ้น
  const R = Math.max(...outDeg, 0) >= 4 ? 3 : 2;
  const choices = [0, -1, 1, -2, 2, -3, 3].filter((t) => Math.abs(t) <= R);

  // เส้นสั้นวางก่อน (มักเป็นเส้นหลักที่ควรตรง) เส้นย้อนกลับวางท้ายสุด
  const order = edges
    .map((_, k) => k)
    .sort((a, b) => {
      const ea = edges[a];
      const eb = edges[b];
      const la = ea.to < ea.from ? 1 : 0;
      const lb = eb.to < eb.from ? 1 : 0;
      if (la !== lb) return la - lb;
      return Math.abs(ea.to - ea.from) - Math.abs(eb.to - eb.from) || a - b;
    });

  /**
   * ให้คะแนนการวางกล่องแบบหนึ่ง — `limit` คือคะแนนของแบบที่ดีที่สุดตอนนี้:
   * คะแนนมีแต่บวกเพิ่ม ถ้าเกินแล้วก็เลิกคิดต่อได้เลย (ส่วนใหญ่ที่ลองจะแย่กว่า จึงเร็วขึ้นมาก)
   */
  const evaluate = (tr: number[], limit = Infinity): { cost: number; edges: PlannedEdge[] } => {
    const X = tr.map((t, i) => laneOf[i] * LANE_SPAN + t);
    const edgeL = Math.min(...X) - 0.5; // ทางเดินริมซ้ายสุดของผัง
    const edgeR = Math.max(...X) + 0.5; // ทางเดินริมขวาสุดของผัง
    let cost = 0;
    // กล่องห่างจากกลางเลน + เลนกว้าง
    const lo = new Map<number, number>();
    const hi = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      cost += Math.abs(tr[i]) * COST_OFFSET;
      lo.set(laneOf[i], Math.min(lo.get(laneOf[i]) ?? 0, tr[i]));
      hi.set(laneOf[i], Math.max(hi.get(laneOf[i]) ?? 0, tr[i]));
    }
    for (const [l, a] of lo) cost += ((hi.get(l) ?? 0) - a) * COST_SPREAD;
    if (cost >= limit) return { cost: Infinity, edges: [] };

    const blocked = (x: number, i: number, j: number) => {
      for (let k = Math.min(i, j) + 1; k < Math.max(i, j); k++) if (Math.abs(X[k] - x) < EPS) return true;
      return false;
    };

    const routed: Seg[] = [];
    const downUsed = new Array(N).fill(false); // ต้นทางนี้มีเส้นลงตรงใต้กล่องแล้วหรือยัง
    const result: PlannedEdge[] = new Array(edges.length);

    /** คะแนนเส้นตัด/เส้นทับกับเส้นที่วางไปแล้ว — เกิน `cap` เมื่อไหร่ก็หยุดนับ (ยังไงก็ไม่ถูกเลือก) */
    const segCost = (segs: Seg[], k: number, cap: number) => {
      const e = edges[k];
      let c = 0;
      for (const s of segs) {
        if (c >= cap) return c;
        for (const r of routed) {
          const f = edges[r.e];
          // เส้นจากต้นทางเดียวกัน (กิ่งแยก) หรือเข้าปลายทางเดียวกัน (รวมกัน) แตะกันได้
          if (f.from === e.from || f.to === e.to) continue;
          if (s.h !== r.h) {
            const H = s.h ? s : r;
            const V = s.h ? r : s;
            if (
              V.x1 >= H.x1 - EPS &&
              V.x1 <= H.x2 + EPS &&
              H.y1 >= V.y1 - EPS &&
              H.y1 <= V.y2 + EPS
            )
              c += COST_CROSS;
          } else if (s.h) {
            if (Math.abs(s.y1 - r.y1) < EPS && Math.min(s.x2, r.x2) - Math.max(s.x1, r.x1) > EPS)
              c += COST_OVERLAP;
          } else if (
            Math.abs(s.x1 - r.x1) < EPS &&
            // นับเฉพาะแนวตั้งบนราง — บนทางเดิน (x ลงท้าย .5) ตอนวาดจริงจะแยกช่องให้แต่ละเส้นเอง
            Math.abs(s.x1 - Math.round(s.x1)) < EPS &&
            Math.min(s.y2, r.y2) - Math.max(s.y1, r.y1) > EPS
          ) {
            c += COST_OVERLAP;
          }
        }
      }
      return c;
    };

    for (const k of order) {
      const { from: i, to: j } = edges[k];
      const xs = X[i];
      const xt = X[j];
      const cands: Candidate[] = [];
      if (j > i) {
        if (Math.abs(xs - xt) < EPS) {
          if (!blocked(xs, i, j)) cands.push({ kind: 'straight', pts: [[xs, i + Y_BOT], [xt, j + Y_TOP]] });
        } else {
          if (!blocked(xt, i, j))
            cands.push({
              kind: 'early',
              pts: [[xs, i + Y_BOT], [xs, i + Y_OUT], [xt, i + Y_OUT], [xt, j + Y_TOP]],
            });
          if (!blocked(xs, i, j))
            cands.push({
              kind: 'late',
              pts: [[xs, i + Y_BOT], [xs, j + Y_IN], [xt, j + Y_IN], [xt, j + Y_TOP]],
            });
        }
        // ทางอ้อมใช้ได้เสมอ (ทางเดินไม่มีกล่อง) — เป็นทางสำรอง
        // ลองทั้งทางเดินข้างกล่องต้นทาง/ปลายทาง และริมนอกสุดของผัง (หลบเส้นทั้งหมดที่อยู่ระหว่างทาง)
        const seenC = new Set<number>();
        for (const c of [xs - 0.5, xs + 0.5, xt - 0.5, xt + 0.5, edgeL, edgeR]) {
          if (seenC.has(c)) continue;
          seenC.add(c);
          cands.push({
            kind: 'corridor',
            corridorX: c,
            pts: [
              [xs, i + Y_BOT],
              [xs, i + Y_OUT],
              [c, i + Y_OUT],
              [c, j + Y_IN],
              [xt, j + Y_IN],
              [xt, j + Y_TOP],
            ],
          });
        }
      } else {
        // ย้อนกลับ: ออกด้านข้าง ขึ้นในทางเดินนอกสุดของสองกล่อง แล้วเข้าด้านข้างปลายทาง
        for (const side of [1, -1] as const) {
          const c = side > 0 ? Math.max(xs, xt) + 0.5 : Math.min(xs, xt) - 0.5;
          cands.push({
            kind: 'loop',
            side,
            corridorX: c,
            pts: [
              [xs + side * BOX_HALF, i + Y_MID],
              [c, i + Y_MID],
              [c, j + Y_MID],
              [xt + side * BOX_HALF, j + Y_MID],
            ],
          });
        }
      }

      // คะแนนพื้นฐาน (หัก + ความยาวแนวนอน) คิดได้เร็ว — เรียงจากถูกไปแพง แล้วค่อยนับเส้นตัด
      // เฉพาะตัวที่ยังมีโอกาสชนะ (ทางอ้อมส่วนใหญ่จึงไม่ต้องนับเลย)
      const scored = cands.map((cand) => {
        const segs = toSegs(cand.pts, k);
        let base = COST_BEND[cand.kind];
        for (const s of segs) {
          if (!s.h) continue;
          const a = splitX(s.x1);
          const b = splitX(s.x2);
          base += Math.abs(b.lane - a.lane) * COST_HLEN_LANE + Math.abs(b.pos - a.pos) * COST_HLEN_TRACK;
        }
        // กิ่งจากกล่องเดียวกันลงตรงใต้กล่องได้เส้นเดียว ไม่งั้นทับกันจนป้ายชนกัน
        if ((cand.kind === 'straight' || cand.kind === 'late') && downUsed[i]) base += COST_OVERLAP;
        return { cand, segs, base };
      });
      scored.sort((a, b) => a.base - b.base);
      let best: { c: number; cand: Candidate; segs: Seg[] } | null = null;
      for (const { cand, segs, base } of scored) {
        if (best && base >= best.c - EPS) break; // ที่เหลือแพงกว่าแน่นอน
        const c: number = base + segCost(segs, k, best ? best.c - base : Infinity);
        if (!best || c < best.c - EPS) best = { c, cand, segs };
      }
      // มีทางสำรองเสมอ จึงไม่มีทางเป็น null
      const b = best!;
      cost += b.c;
      if (cost >= limit) return { cost: Infinity, edges: [] };
      routed.push(...b.segs);
      if (b.cand.kind === 'straight' || b.cand.kind === 'late') downUsed[i] = true;
      result[k] = {
        from: i,
        to: j,
        kind: b.cand.kind,
        corridorX: b.cand.corridorX,
        side: b.cand.side,
      };
    }
    return { cost, edges: result };
  };

  // ค้นหาแบบไล่ทีละกล่อง: ลองย้ายกล่องไปรางอื่น ถ้าคะแนนดีขึ้นก็เก็บไว้
  // แล้ววนซ้ำจนไม่มีอะไรดีขึ้น (ลำดับการลองตายตัว ผังจึงออกมาเหมือนเดิมทุกครั้ง)
  let tr = new Array(N).fill(0);
  let best = evaluate(tr);
  for (let sweep = 0; sweep < 8; sweep++) {
    let improved = false;
    for (let i = 0; i < N; i++) {
      for (const t of choices) {
        if (t === tr[i]) continue;
        const next = tr.slice();
        next[i] = t;
        const r = evaluate(next, best.cost);
        if (r.cost < best.cost - EPS) {
          best = r;
          tr = next;
          improved = true;
        }
      }
    }
    // ย้ายเป็นกลุ่ม: ขั้นที่ต่อกันในเลนเดียวกัน (เช่นทั้งกิ่ง "ซ่อมไม่ได้") ขยับพร้อมกัน
    // เพราะบางครั้งย้ายทีละกล่องแล้วแย่ลงก่อน แต่ย้ายทั้งชุดแล้วดีขึ้น
    for (let i = 0; i < N; i++) {
      for (let len = 2; len <= 6 && i + len <= N; len++) {
        const seg = Array.from({ length: len }, (_, k) => i + k);
        if (seg.some((k) => laneOf[k] !== laneOf[i])) break;
        for (const d of [-1, 1]) {
          const next = tr.slice();
          let ok = true;
          for (const k of seg) {
            next[k] = tr[k] + d;
            if (Math.abs(next[k]) > R) ok = false;
          }
          if (!ok) continue;
          const r = evaluate(next, best.cost);
          if (r.cost < best.cost - EPS) {
            best = r;
            tr = next;
            improved = true;
          }
        }
      }
    }
    if (!improved) break;
  }

  return { lane: laneOf, track: tr, edges: best.edges };
}
