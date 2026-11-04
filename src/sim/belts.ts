/** Sparse Kepler belts. Positions are ecliptic → scene (Y up). */

export type BeltKind = "asteroid" | "kuiper";

export type BeltGrain = {
  a: number;
  e: number;
  i: number;
  lan: number;
  arg: number;
  m0: number;
  n: number;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number) {
  const u = Math.max(1e-6, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function solveKepler(M: number, e: number) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-8) break;
  }
  return E;
}

function makeBelt(
  seed: number,
  count: number,
  a0: number,
  a1: number,
  iRmsDeg: number,
  eMean: number,
  gaps: number[] = [],
): BeltGrain[] {
  const rng = mulberry32(seed);
  const out: BeltGrain[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 8) {
    guard++;
    const a = a0 + rng() * (a1 - a0);
    if (gaps.some((g) => Math.abs(a - g) < 0.045)) continue;
    const e = Math.min(0.28, Math.abs(eMean + gauss(rng) * eMean * 0.7));
    const i = (Math.abs(gauss(rng)) * iRmsDeg * Math.PI) / 180;
    const lan = rng() * Math.PI * 2;
    const arg = rng() * Math.PI * 2;
    const m0 = rng() * Math.PI * 2;
    const n = (2 * Math.PI) / (365.256 * Math.pow(a, 1.5));
    out.push({ a, e, i, lan, arg, m0, n });
  }
  return out;
}

export const ASTEROID_GRAINS = makeBelt(0xc2a1, 2200, 2.12, 3.28, 8.5, 0.09, [2.5, 2.82, 2.96]);
export const KUIPER_GRAINS = makeBelt(0x4b17, 1400, 34.5, 48.5, 14, 0.08);

const JD_UNIX_EPOCH = 2440587.5;

function unixToJd(ms: number) {
  return ms / 86400000 + JD_UNIX_EPOCH;
}

export function grainScenePos(g: BeltGrain, timeMs: number, out: Float32Array, offset: number) {
  const jd = unixToJd(timeMs);
  let M = g.m0 + g.n * (jd - 2451545.0);
  M = ((M % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const E = solveKepler(M, g.e);
  const r = g.a * (1 - g.e * Math.cos(E));
  const nu = Math.atan2(Math.sqrt(1 - g.e * g.e) * Math.sin(E), Math.cos(E) - g.e);
  const u = g.arg + nu;
  const ci = Math.cos(g.i);
  const si = Math.sin(g.i);
  const cl = Math.cos(g.lan);
  const sl = Math.sin(g.lan);
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const x = r * (cl * cu - sl * su * ci);
  const y = r * (sl * cu + cl * su * ci);
  const z = r * (su * si);
  out[offset] = x;
  out[offset + 1] = z;
  out[offset + 2] = -y;
}
