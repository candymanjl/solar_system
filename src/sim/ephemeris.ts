import {
  Body,
  HelioState,
  JupiterMoons,
  LagrangePoint,
  MassProduct,
  RotateState,
  RotateVector,
  RotationAxis,
  Rotation_EQJ_ECL,
  type StateVector,
  type Vector,
} from "astronomy-engine";
import { BODIES, framingDistanceAu, kmToAu, type BodyDef } from "./bodies";

export type Vec3 = { x: number; y: number; z: number };

export type BodyState = {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  nx: number;
  ny: number;
  nz: number;
  spin: number;
};

const EQJ_ECL = Rotation_EQJ_ECL();
const MU_SUN = MassProduct(Body.Sun);
const ECLIPTIC_NORTH: Vec3 = { x: 0, y: 1, z: 0 };

const SOI_IDS = ["mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"] as const;

const PLANET_BODY: Record<string, Body> = {
  sun: Body.Sun,
  mercury: Body.Mercury,
  venus: Body.Venus,
  earth: Body.Earth,
  moon: Body.Moon,
  mars: Body.Mars,
  jupiter: Body.Jupiter,
  saturn: Body.Saturn,
  uranus: Body.Uranus,
  neptune: Body.Neptune,
  pluto: Body.Pluto,
};

function eclipticState(sv: StateVector) {
  return RotateState(EQJ_ECL, sv);
}

function eclipticVec(v: Vector) {
  return RotateVector(EQJ_ECL, v);
}

function toScene(x: number, y: number, z: number): Vec3 {
  return { x, y: z, z: -y };
}

function sceneState(sv: StateVector): Omit<BodyState, "id" | "nx" | "ny" | "nz" | "spin"> {
  const e = eclipticState(sv);
  const p = toScene(e.x, e.y, e.z);
  const v = toScene(e.vx, e.vy, e.vz);
  return { x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z };
}

function axisOf(body: Body, date: Date) {
  try {
    const axis = RotationAxis(body, date);
    const n = eclipticVec(axis.north);
    const s = toScene(n.x, n.y, n.z);
    const mag = Math.hypot(s.x, s.y, s.z) || 1;
    return { nx: s.x / mag, ny: s.y / mag, nz: s.z / mag, spin: (axis.spin * Math.PI) / 180 };
  } catch {
    return { nx: 0, ny: 1, nz: 0, spin: 0 };
  }
}

const JD_UNIX_EPOCH = 2440587.5;

function unixToJd(ms: number) {
  return ms / 86400000 + JD_UNIX_EPOCH;
}

function solveKepler(M: number, e: number) {
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

function keplerFrameNorth(parent: BodyState, parentId: string): Vec3 {
  if (parentId === "sun") return ECLIPTIC_NORTH;
  return { x: parent.nx, y: parent.ny, z: parent.nz };
}

function keplerRelative(def: Extract<BodyDef["ephemeris"], { type: "kepler" }>, date: Date, north: Vec3): Vec3 {
  const jd = unixToJd(date.getTime());
  const days = jd - def.epochJd;
  const n = ((2 * Math.PI) / Math.abs(def.periodDays)) * (def.periodDays < 0 ? -1 : 1);
  let M = (def.meanAnomalyDeg * Math.PI) / 180 + n * days;
  M = ((M % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const e = def.e;
  const E = solveKepler(M, e);
  const nu = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
  const r = kmToAu(def.aKm) * (1 - e * Math.cos(E));
  const arg = (def.argPeriDeg * Math.PI) / 180;
  const i = (def.iDeg * Math.PI) / 180;
  const lan = (def.lanDeg * Math.PI) / 180;
  const u = arg + nu;
  const xOrb = r * (Math.cos(lan) * Math.cos(u) - Math.sin(lan) * Math.sin(u) * Math.cos(i));
  const yOrb = r * (Math.sin(lan) * Math.cos(u) + Math.cos(lan) * Math.sin(u) * Math.cos(i));
  const zOrb = r * (Math.sin(u) * Math.sin(i));

  const nMag = Math.hypot(north.x, north.y, north.z) || 1;
  const nx = north.x / nMag;
  const ny = north.y / nMag;
  const nz = north.z / nMag;
  let tx = 0;
  let ty = 1;
  let tz = 0;
  if (Math.abs(ny) > 0.92) {
    tx = 1;
    ty = 0;
    tz = 0;
  }
  let xx = ty * nz - tz * ny;
  let xy = tz * nx - tx * nz;
  let xz = tx * ny - ty * nx;
  const xMag = Math.hypot(xx, xy, xz) || 1;
  xx /= xMag;
  xy /= xMag;
  xz /= xMag;
  const yx = ny * xz - nz * xy;
  const yy = nz * xx - nx * xz;
  const yz = nx * xy - ny * xx;

  return {
    x: xx * xOrb + yx * yOrb + nx * zOrb,
    y: xy * xOrb + yy * yOrb + ny * zOrb,
    z: xz * xOrb + yz * yOrb + nz * zOrb,
  };
}

type Cache = { key: number; map: Map<string, BodyState> };
const cache: Cache = { key: NaN, map: new Map() };

export function getBodyStates(timeMs: number): Map<string, BodyState> {
  const key = Math.round(timeMs);
  if (cache.key === key) return cache.map;
  const date = new Date(timeMs);
  const map = new Map<string, BodyState>();

  const sunAxis = axisOf(Body.Sun, date);
  map.set("sun", { id: "sun", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ...sunAxis });

  const planetIds = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "moon"] as const;
  for (const id of planetIds) {
    const body = PLANET_BODY[id];
    const raw = HelioState(body, date);
    const s = sceneState(raw);
    const ax = axisOf(body, date);
    map.set(id, { id, ...s, ...ax });
  }

  const jup = map.get("jupiter")!;
  const jm = JupiterMoons(date);
  const moons = { io: jm.io, europa: jm.europa, ganymede: jm.ganymede, callisto: jm.callisto } as const;
  (Object.keys(moons) as Array<keyof typeof moons>).forEach((name) => {
    const s = sceneState(moons[name]);
    map.set(name, {
      id: name,
      x: jup.x + s.x,
      y: jup.y + s.y,
      z: jup.z + s.z,
      vx: jup.vx + s.vx,
      vy: jup.vy + s.vy,
      vz: jup.vz + s.vz,
      nx: jup.nx,
      ny: jup.ny,
      nz: jup.nz,
      spin: 0,
    });
  });

  for (const def of BODIES) {
    if (def.ephemeris.type !== "kepler") continue;
    const parent = map.get(def.ephemeris.parentId);
    if (!parent) continue;
    const rel = keplerRelative(def.ephemeris, date, keplerFrameNorth(parent, def.ephemeris.parentId));
    map.set(def.id, {
      id: def.id,
      x: parent.x + rel.x,
      y: parent.y + rel.y,
      z: parent.z + rel.z,
      vx: parent.vx,
      vy: parent.vy,
      vz: parent.vz,
      nx: parent.nx,
      ny: parent.ny,
      nz: parent.nz,
      spin: ((timeMs / 3600000) * (2 * Math.PI)) / Math.abs(def.rotationHours || 24),
    });
  }

  for (const def of BODIES) {
    if (def.ephemeris.type !== "lagrange") continue;
    try {
      if (def.ephemeris.pair === "sel") {
        const raw = LagrangePoint(def.ephemeris.point, date, Body.Sun, Body.EMB);
        const s = sceneState(raw);
        map.set(def.id, { id: def.id, ...s, nx: 0, ny: 1, nz: 0, spin: 0 });
      } else {
        const earth = map.get("earth");
        if (!earth) continue;
        const raw = LagrangePoint(def.ephemeris.point, date, Body.Earth, Body.Moon);
        const s = sceneState(raw);
        map.set(def.id, {
          id: def.id,
          x: earth.x + s.x,
          y: earth.y + s.y,
          z: earth.z + s.z,
          vx: earth.vx,
          vy: earth.vy,
          vz: earth.vz,
          nx: earth.nx,
          ny: earth.ny,
          nz: earth.nz,
          spin: 0,
        });
      }
    } catch {
      /* engine may reject a pair at some dates */
    }
  }

  cache.key = key;
  cache.map = map;
  return map;
}

const ICON_PX: Record<string, number> = {
  sun: 48,
  jupiter: 46,
  saturn: 42,
  uranus: 32,
  neptune: 32,
  earth: 30,
  venus: 28,
  mars: 24,
  mercury: 20,
  pluto: 18,
  moon: 14,
  io: 13,
  europa: 13,
  ganymede: 15,
  callisto: 14,
  titan: 15,
  triton: 13,
  charon: 12,
};

export function bodyIconPx(def: BodyDef) {
  if (ICON_PX[def.id] != null) return ICON_PX[def.id]!;
  if (def.kind === "moon") return 11;
  if (def.kind === "star") return 48;
  if (def.kind === "lagrange") return 12;
  if (def.kind === "comet") return 12;
  if (def.kind === "asteroid") return 14;
  if (def.kind === "dwarf") return 16;
  return 22;
}

/** Inclusive range for the body-size slider and any persisted sizeScale. */
export const SIZE_SCALE_MIN = 1;
export const SIZE_SCALE_MAX = 4;

/** Snap a size multiplier onto the slider's 1×–4× steps. */
export function clampSizeScale(value: number): number {
  if (!Number.isFinite(value)) return SIZE_SCALE_MIN;
  return Math.min(SIZE_SCALE_MAX, Math.max(SIZE_SCALE_MIN, Math.round(value)));
}

/** World-space radius used for 3D globes. `sizeScale` enlarges every body, not just the Sun. */
export function visualRadiusAu(def: BodyDef, sizeScale: number, camDist = Infinity) {
  const trueR = kmToAu(def.radiusKm);
  const scale = clampSizeScale(sizeScale);
  const tan = Math.tan(((viewState.fov * Math.PI) / 180) / 2);
  const h = Math.max(viewState.h, 1);
  const iconR =
    Number.isFinite(camDist) && camDist > 0 ? (bodyIconPx(def) * camDist * tan) / h : trueR * 24;
  let vis = Math.max(trueR, iconR) * scale;
  if (camDist > 0 && Number.isFinite(camDist)) {
    vis = Math.min(vis, Math.max(trueR, camDist * 0.36));
  }
  return vis;
}

export function soiRadiusAu(id: string, states: Map<string, BodyState>): number | null {
  if (!(SOI_IDS as readonly string[]).includes(id)) return null;
  const def = BODIES.find((b) => b.id === id);
  const st = states.get(id);
  if (!def || !st || !def.parentId) return null;
  const parent = states.get(def.parentId);
  if (!parent) return null;
  const a = Math.hypot(st.x - parent.x, st.y - parent.y, st.z - parent.z);
  if (a < 1e-10) return null;
  const body = PLANET_BODY[id];
  const parentBody = PLANET_BODY[def.parentId] ?? Body.Sun;
  if (!body) return null;
  try {
    const muB = MassProduct(body);
    const muP = MassProduct(parentBody);
    if (muB <= 0 || muP <= 0) return null;
    return a * Math.pow(muB / muP, 0.4);
  } catch {
    return null;
  }
}

export type OrbitSample = { points: Float32Array; color: string; id: string };

function osculatingPoints(r: Vec3, v: Vec3, mu: number, samples = 160): Float32Array | null {
  const rx = r.x;
  const ry = r.y;
  const rz = r.z;
  const vx = v.x;
  const vy = v.y;
  const vz = v.z;
  const hx = ry * vz - rz * vy;
  const hy = rz * vx - rx * vz;
  const hz = rx * vy - ry * vx;
  const h2 = hx * hx + hy * hy + hz * hz;
  if (h2 < 1e-20) return null;
  const rmag = Math.hypot(rx, ry, rz);
  const v2 = vx * vx + vy * vy + vz * vz;
  if (rmag < 1e-12) return null;
  const ex = (vy * hz - vz * hy) / mu - rx / rmag;
  const ey = (vz * hx - vx * hz) / mu - ry / rmag;
  const ez = (vx * hy - vy * hx) / mu - rz / rmag;
  const e = Math.hypot(ex, ey, ez);
  const energy = v2 / 2 - mu / rmag;
  if (energy >= 0) return null;
  const a = -mu / (2 * energy);
  if (a <= 0 || e >= 0.98) return null;

  const hm = Math.sqrt(h2);
  const wx = hx / hm;
  const wy = hy / hm;
  const wz = hz / hm;
  let px: number, py: number, pz: number;
  if (e > 1e-6) {
    px = ex / e;
    py = ey / e;
    pz = ez / e;
  } else {
    px = rx / rmag;
    py = ry / rmag;
    pz = rz / rmag;
  }
  let qx = wy * pz - wz * py;
  let qy = wz * px - wx * pz;
  let qz = wx * py - wy * px;
  const qmag = Math.hypot(qx, qy, qz) || 1;
  qx /= qmag;
  qy /= qmag;
  qz /= qmag;
  const eccFactor = a * (1 - e * e);
  const out = new Float32Array((samples + 1) * 3);
  for (let i = 0; i <= samples; i++) {
    const theta = (i / samples) * Math.PI * 2;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    const rad = eccFactor / (1 + e * ct);
    const o = i * 3;
    out[o] = rad * (ct * px + st * qx);
    out[o + 1] = rad * (ct * py + st * qy);
    out[o + 2] = rad * (ct * pz + st * qz);
  }
  return out;
}

function keplerOrbitPoints(def: Extract<BodyDef["ephemeris"], { type: "kepler" }>, parent: BodyState, samples = 96) {
  const a = kmToAu(def.aKm);
  const e = def.e;
  const i = (def.iDeg * Math.PI) / 180;
  const lan = (def.lanDeg * Math.PI) / 180;
  const arg = (def.argPeriDeg * Math.PI) / 180;
  const north = keplerFrameNorth(parent, def.parentId);
  const nMag = Math.hypot(north.x, north.y, north.z) || 1;
  const nx = north.x / nMag;
  const ny = north.y / nMag;
  const nz = north.z / nMag;
  let tx = 0;
  let ty = 1;
  let tz = 0;
  if (Math.abs(ny) > 0.92) {
    tx = 1;
    ty = 0;
    tz = 0;
  }
  let xx = ty * nz - tz * ny;
  let xy = tz * nx - tx * nz;
  let xz = tx * ny - ty * nx;
  const xMag = Math.hypot(xx, xy, xz) || 1;
  xx /= xMag;
  xy /= xMag;
  xz /= xMag;
  const yx = ny * xz - nz * xy;
  const yy = nz * xx - nx * xz;
  const yz = nx * xy - ny * xx;
  const out = new Float32Array((samples + 1) * 3);
  for (let s = 0; s <= samples; s++) {
    const nu = (s / samples) * Math.PI * 2;
    const r = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
    const u = arg + nu;
    const xOrb = r * (Math.cos(lan) * Math.cos(u) - Math.sin(lan) * Math.sin(u) * Math.cos(i));
    const yOrb = r * (Math.sin(lan) * Math.cos(u) + Math.cos(lan) * Math.sin(u) * Math.cos(i));
    const zOrb = r * (Math.sin(u) * Math.sin(i));
    const o = s * 3;
    out[o] = parent.x + xx * xOrb + yx * yOrb + nx * zOrb;
    out[o + 1] = parent.y + xy * xOrb + yy * yOrb + ny * zOrb;
    out[o + 2] = parent.z + xz * xOrb + yz * yOrb + nz * zOrb;
  }
  return out;
}

export function computeOrbits(states: Map<string, BodyState>, showMoons: boolean): OrbitSample[] {
  const orbits: OrbitSample[] = [];
  for (const def of BODIES) {
    if (def.kind === "star" || def.kind === "lagrange") continue;
    if (def.kind === "moon" && !showMoons) continue;
    const st = states.get(def.id);
    if (!st) continue;
    if (def.ephemeris.type === "planet" && def.id !== "moon") {
      const pts = osculatingPoints({ x: st.x, y: st.y, z: st.z }, { x: st.vx, y: st.vy, z: st.vz }, MU_SUN);
      if (pts) orbits.push({ id: def.id, color: def.orbitColor, points: pts });
      continue;
    }
    if (def.id === "moon") {
      const earth = states.get("earth");
      if (!earth) continue;
      const relR = { x: st.x - earth.x, y: st.y - earth.y, z: st.z - earth.z };
      const relV = { x: st.vx - earth.vx, y: st.vy - earth.vy, z: st.vz - earth.vz };
      const mu = MassProduct(Body.Earth);
      const pts = osculatingPoints(relR, relV, mu);
      if (pts) {
        for (let i = 0; i < pts.length; i += 3) {
          pts[i]! += earth.x;
          pts[i + 1]! += earth.y;
          pts[i + 2]! += earth.z;
        }
        orbits.push({ id: def.id, color: def.orbitColor, points: pts });
      }
      continue;
    }
    if (def.ephemeris.type === "jupiterMoon") {
      const jup = states.get("jupiter");
      if (!jup) continue;
      const relR = { x: st.x - jup.x, y: st.y - jup.y, z: st.z - jup.z };
      const relV = { x: st.vx - jup.vx, y: st.vy - jup.vy, z: st.vz - jup.vz };
      const mu = MassProduct(Body.Jupiter);
      const pts = osculatingPoints(relR, relV, mu, 96);
      if (pts) {
        for (let i = 0; i < pts.length; i += 3) {
          pts[i]! += jup.x;
          pts[i + 1]! += jup.y;
          pts[i + 2]! += jup.z;
        }
        orbits.push({ id: def.id, color: def.orbitColor, points: pts });
      }
      continue;
    }
    if (def.ephemeris.type === "kepler") {
      const parent = states.get(def.ephemeris.parentId);
      if (!parent) continue;
      const samples = def.ephemeris.e > 0.5 ? 256 : 128;
      orbits.push({ id: def.id, color: def.orbitColor, points: keplerOrbitPoints(def.ephemeris, parent, samples) });
    }
  }
  return orbits;
}

export const simFrame: {
  states: Map<string, BodyState>;
  orbits: OrbitSample[];
  dt: number;
} = {
  states: new Map(),
  orbits: [],
  dt: 0,
};

/** Shared map camera — drives both the DOM orrery and the WebGL view. */
export const viewState = {
  ex: 0,
  ey: 16,
  ez: 36,
  tx: 0,
  ty: 0,
  tz: 0,
  fov: 48,
  w: 1280,
  h: 800,
};

export const CAM_R_MIN = 8e-5;
export const CAM_R_MAX = 420;

export const mapCam = {
  targetId: "sun",
  r: 34,
  theta: 0.38,
  phi: 1.14,
};

export function zoomTo(r: number) {
  if (!Number.isFinite(r)) return;
  mapCam.r = Math.min(CAM_R_MAX, Math.max(CAM_R_MIN, r));
}

export function zoomBy(factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) return;
  zoomTo(mapCam.r * factor);
}

export const ZOOM_IN = 0.68;
export const ZOOM_OUT = 1 / 0.68;

export function frameBody(id: string) {
  mapCam.targetId = id;
  mapCam.r = id === "sun" ? 34 : Math.max(framingDistanceAu(id) * 1.15, 0.00015);
  mapCam.r = Math.min(Math.max(mapCam.r, CAM_R_MIN), CAM_R_MAX);
}

export function applyMapCam(focusId: string, follow?: { x: number; y: number; z: number }) {
  if (mapCam.targetId !== focusId) frameBody(focusId);
  if (follow) {
    viewState.tx = follow.x;
    viewState.ty = follow.y;
    viewState.tz = follow.z;
  }
  const { r, theta, phi } = mapCam;
  const sp = Math.sin(phi);
  viewState.ex = viewState.tx + r * sp * Math.sin(theta);
  viewState.ey = viewState.ty + r * Math.cos(phi);
  viewState.ez = viewState.tz + r * sp * Math.cos(theta);
}

export function projectWorld(x: number, y: number, z: number) {
  const zx = viewState.ex - viewState.tx;
  const zy = viewState.ey - viewState.ty;
  const zz = viewState.ez - viewState.tz;
  const zl = Math.hypot(zx, zy, zz) || 1;
  const zX = zx / zl;
  const zY = zy / zl;
  const zZ = zz / zl;
  let xX = zZ;
  let xY = 0;
  let xZ = -zX;
  const xl = Math.hypot(xX, xY, xZ) || 1;
  xX /= xl;
  xY /= xl;
  xZ /= xl;
  const yX = zY * xZ - zZ * xY;
  const yY = zZ * xX - zX * xZ;
  const yZ = zX * xY - zY * xX;
  const dx = x - viewState.ex;
  const dy = y - viewState.ey;
  const dz = z - viewState.ez;
  const camX = dx * xX + dy * xY + dz * xZ;
  const camY = dx * yX + dy * yY + dz * yZ;
  const camZ = dx * zX + dy * zY + dz * zZ;
  const zDist = -camZ;
  if (zDist <= 1e-9) return { x: 0, y: 0, visible: false, zDist: 0 };
  const aspect = viewState.w / Math.max(viewState.h, 1);
  const tan = Math.tan(((viewState.fov * Math.PI) / 180) / 2);
  const ndcX = camX / (aspect * tan * zDist);
  const ndcY = camY / (tan * zDist);
  return {
    x: (ndcX * 0.5 + 0.5) * viewState.w,
    y: (-ndcY * 0.5 + 0.5) * viewState.h,
    visible: ndcX > -1.25 && ndcX < 1.25 && ndcY > -1.25 && ndcY < 1.25,
    zDist,
  };
}
