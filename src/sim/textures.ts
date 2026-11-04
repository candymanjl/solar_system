import * as THREE from "three";
import type { TextureKind } from "./bodies";
import { EARTH_CLOUDS_URL, getNasaTexture, type NasaTexture } from "./nasaTextures";

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, oct = 3) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * noise(x * f, y * f);
    a *= 0.5;
    f *= 2;
  }
  return v;
}

function mix(a: number[], b: number[], t: number) {
  const u = Math.min(1, Math.max(0, t));
  return [a[0]! + (b[0]! - a[0]!) * u, a[1]! + (b[1]! - a[1]!) * u, a[2]! + (b[2]! - a[2]!) * u];
}

function put(data: Uint8ClampedArray, i: number, rgb: number[], a = 255) {
  data[i] = rgb[0]!;
  data[i + 1] = rgb[1]!;
  data[i + 2] = rgb[2]!;
  data[i + 3] = a;
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  return { c, ctx, w, h };
}

function texFrom(c: HTMLCanvasElement, wrap = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

function drawSun(w: number, h: number) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const g = fbm(u * 8, v * 8, 4);
      const spot = fbm(u * 3 + 9, v * 3, 3);
      const gran = 0.72 + 0.28 * g;
      let rgb = mix([255, 168, 40], [255, 220, 140], gran);
      if (spot < 0.32) {
        const k = (0.32 - spot) / 0.32;
        rgb = mix(rgb, [90, 40, 10], k * 0.85);
      }
      put(d, (y * w + x) * 4, rgb);
    }
  }
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

function craterPass(d: Uint8ClampedArray, w: number, h: number, count: number, seed: number) {
  for (let n = 0; n < count; n++) {
    const cx = hash(n + seed, 1.7) * w;
    const cy = hash(n + seed, 8.1) * h;
    const r = 2 + hash(n + seed, 3.3) * Math.min(w, h) * 0.06;
    const x0 = Math.max(0, Math.floor(cx - r * 2));
    const x1 = Math.min(w - 1, Math.floor(cx + r * 2));
    const y0 = Math.max(0, Math.floor(cy - r * 2));
    const y1 = Math.min(h - 1, Math.floor(cy + r * 2));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = (y - cy) * 2;
        const dist = Math.hypot(dx, dy);
        if (dist > r * 1.4) continue;
        const i = (y * w + x) * 4;
        const rim = Math.abs(dist - r);
        if (rim < r * 0.12) {
          d[i] = Math.min(255, d[i]! + 28);
          d[i + 1] = Math.min(255, d[i + 1]! + 26);
          d[i + 2] = Math.min(255, d[i + 2]! + 22);
        } else if (dist < r) {
          const k = 0.55 + 0.45 * (dist / r);
          d[i] = d[i]! * k;
          d[i + 1] = d[i + 1]! * k;
          d[i + 2] = d[i + 2]! * k;
        }
      }
    }
  }
}

function drawRocky(w: number, h: number, base: number[], hi: number[], lo: number[], craters: number, seed: number) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / w * 6 + seed, y / h * 6, 5);
      let rgb = mix(lo, mix(base, hi, n), n);
      put(d, (y * w + x) * 4, rgb);
    }
  }
  craterPass(d, w, h, craters, seed);
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

function drawMercury(w: number, h: number) {
  return drawRocky(w, h, [150, 148, 142], [200, 196, 188], [70, 68, 64], 80, 2.1);
}

function drawMoon(w: number, h: number) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const maria = [
    { lon: -20, lat: 20, rx: 38, ry: 22 },
    { lon: 40, lat: 10, rx: 22, ry: 16 },
    { lon: -80, lat: 30, rx: 18, ry: 12 },
    { lon: 90, lat: -10, rx: 16, ry: 10 },
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * 360 - 180;
      const lat = 90 - (y / h) * 180;
      const n = fbm(x / w * 7, y / h * 7, 5);
      let rgb = mix([90, 90, 88], [210, 206, 196], 0.35 + n * 0.65);
      for (const m of maria) {
        const dx = (lon - m.lon) / m.rx;
        const dy = (lat - m.lat) / m.ry;
        if (dx * dx + dy * dy < 1) {
          rgb = mix(rgb, [62, 62, 66], 0.72);
        }
      }
      put(d, (y * w + x) * 4, rgb);
    }
  }
  craterPass(d, w, h, 70, 4.4);
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

function drawVenus(w: number, h: number) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / h;
      const swirl = fbm(u * 3 + v * 0.6, v * 5, 5);
      const rgb = mix([210, 170, 90], [255, 230, 170], swirl);
      put(d, (y * w + x) * 4, rgb);
    }
  }
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

function landAt(lon: number, lat: number) {
  const blobs = [
    [20, 8, 28, 38],
    [12, 50, 22, 12],
    [80, 48, 58, 22],
    [100, 28, 40, 18],
    [78, 18, 10, 16],
    [46, 24, 12, 10],
    [135, -24, 18, 12],
    [175, -42, 8, 6],
    [-100, 48, 40, 22],
    [-90, 30, 22, 14],
    [-112, 40, 18, 16],
    [-42, 72, 16, 10],
    [-62, -12, 16, 32],
    [25, -20, 8, 10],
  ];
  for (const [cx, cy, rx, ry] of blobs) {
    const dx = (lon - cx!) / rx!;
    const dy = (lat - cy!) / ry!;
    if (dx * dx + dy * dy < 1) return true;
  }
  if (lat < -72) return true;
  if (lat > 72 && (lon < -20 || lon > 40)) return true;
  return false;
}

function drawEarth(w: number, h: number) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const oceanDeep = [10, 42, 92];
  const ocean = [22, 78, 140];
  const grass = [46, 110, 52];
  const desert = [194, 168, 96];
  const ice = [236, 242, 248];
  const mountain = [92, 92, 78];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * 360 - 180;
      const lat = 90 - (y / h) * 180;
      const n = fbm(x / w * 8, y / h * 8, 5);
      const iceCap = Math.abs(lat) > 72 + n * 8;
      let rgb: number[];
      if (iceCap) {
        rgb = mix(ice, [200, 214, 230], n);
      } else if (landAt(lon, lat)) {
        const dry = fbm(x / w * 4 + 3, y / h * 4, 3);
        rgb = mix(grass, desert, dry * (Math.abs(lat) < 32 ? 0.85 : 0.25));
        if (n > 0.72) rgb = mix(rgb, mountain, 0.55);
        if (Math.abs(lat) > 60) rgb = mix(rgb, ice, 0.45);
      } else {
        rgb = mix(oceanDeep, ocean, n);
      }
      put(d, (y * w + x) * 4, rgb);
    }
  }
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

export function drawEarthClouds(w = 256, h = 128) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / w * 7, y / h * 9, 5);
      const a = n > 0.55 ? Math.min(255, (n - 0.55) * 520) : 0;
      put(d, (y * w + x) * 4, [255, 255, 255], a);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = texFrom(c);
  t.premultiplyAlpha = true;
  return t;
}

function drawMars(w: number, h: number) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lat = 90 - (y / h) * 180;
      const n = fbm(x / w * 6, y / h * 6, 5);
      let rgb = mix([120, 42, 18], [196, 96, 42], n);
      if (n < 0.38) rgb = mix(rgb, [72, 40, 28], 0.6);
      if (Math.abs(lat) > 68 + n * 10) rgb = mix(rgb, [235, 238, 242], 0.9);
      put(d, (y * w + x) * 4, rgb);
    }
  }
  craterPass(d, w, h, 40, 7.2);
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

function drawBands(
  w: number,
  h: number,
  palette: number[][],
  freq: number,
  spot?: { lat: number; lon: number; rx: number; ry: number; color: number[] },
) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lat = ((y / h) - 0.5) * Math.PI;
      const n = fbm(x / w * 10, y / h * 18, 4);
      const band = (Math.sin(lat * freq + n * 1.4) + 1) / 2;
      const idx = Math.min(palette.length - 1, Math.floor(band * (palette.length - 0.01)));
      const next = Math.min(palette.length - 1, idx + 1);
      let rgb = mix(palette[idx]!, palette[next]!, band * (palette.length - 1) - idx);
      rgb = mix(rgb, palette[idx]!, n * 0.25);
      if (spot) {
        const lon = (x / w) * 360 - 180;
        const la = 90 - (y / h) * 180;
        const dx = (lon - spot.lon) / spot.rx;
        const dy = (la - spot.lat) / spot.ry;
        if (dx * dx + dy * dy < 1) {
          rgb = mix(rgb, spot.color, 0.85 * (1 - Math.hypot(dx, dy)));
        }
      }
      put(d, (y * w + x) * 4, rgb);
    }
  }
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

function drawJupiter(w: number, h: number) {
  return drawBands(
    w,
    h,
    [
      [186, 140, 90],
      [230, 210, 170],
      [168, 110, 70],
      [240, 224, 190],
      [150, 96, 58],
      [214, 178, 120],
    ],
    10,
    { lat: -22, lon: 40, rx: 18, ry: 10, color: [176, 70, 40] },
  );
}

function drawSaturn(w: number, h: number) {
  return drawBands(w, h, [
    [214, 196, 150],
    [232, 216, 170],
    [186, 164, 118],
    [240, 226, 186],
    [198, 176, 130],
  ], 12);
}

function drawUranus(w: number, h: number) {
  return drawBands(w, h, [
    [150, 210, 214],
    [176, 224, 226],
    [132, 196, 204],
    [188, 230, 232],
  ], 6);
}

function drawNeptune(w: number, h: number) {
  return drawBands(
    w,
    h,
    [
      [28, 70, 186],
      [46, 96, 214],
      [22, 58, 160],
      [70, 120, 230],
    ],
    7,
    { lat: -32, lon: -20, rx: 14, ry: 10, color: [18, 36, 90] },
  );
}

function drawPluto(w: number, h: number) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * 360 - 180;
      const lat = 90 - (y / h) * 180;
      const n = fbm(x / w * 5, y / h * 5, 4);
      let rgb = mix([160, 120, 90], [210, 176, 140], n);
      const dx = (lon - 20) / 40;
      const dy = (lat + 5) / 28;
      if (dx * dx + dy * dy < 1) rgb = mix(rgb, [236, 214, 196], 0.85);
      if (lat > 55) rgb = mix(rgb, [230, 236, 240], 0.5);
      put(d, (y * w + x) * 4, rgb);
    }
  }
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

function drawIo(w: number, h: number) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / w * 8, y / h * 8, 5);
      let rgb = mix([214, 190, 40], [180, 80, 20], n);
      if (n > 0.7) rgb = mix(rgb, [80, 80, 70], 0.4);
      put(d, (y * w + x) * 4, rgb);
    }
  }
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

function drawEuropa(w: number, h: number) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / w * 14, y / h * 18, 4);
      let rgb = mix([232, 226, 210], [186, 150, 96], n > 0.62 ? 0.55 : 0.08);
      put(d, (y * w + x) * 4, rgb);
    }
  }
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

function drawGanymede(w: number, h: number) {
  return drawRocky(w, h, [140, 124, 104], [188, 172, 148], [70, 64, 56], 36, 11);
}

function drawCallisto(w: number, h: number) {
  return drawRocky(w, h, [90, 82, 74], [140, 130, 118], [40, 36, 32], 90, 13);
}

function drawTitan(w: number, h: number) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / w * 4, y / h * 4, 4);
      const rgb = mix([180, 110, 40], [230, 170, 80], n);
      put(d, (y * w + x) * 4, rgb);
    }
  }
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

function drawTriton(w: number, h: number) {
  const { c, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / w * 6, y / h * 6, 4);
      const rgb = mix([196, 168, 160], [232, 210, 200], n);
      put(d, (y * w + x) * 4, rgb);
    }
  }
  ctx.putImageData(img, 0, 0);
  return texFrom(c);
}

function drawIcy(w: number, h: number) {
  return drawRocky(w, h, [210, 214, 218], [240, 242, 244], [150, 154, 160], 24, 17);
}

function drawPhobos(w: number, h: number) {
  return drawRocky(w, h, [120, 104, 90], [160, 140, 120], [60, 52, 46], 18, 19);
}

function makeProcedural(kind: TextureKind): THREE.CanvasTexture {
  const planet = 256;
  const moon = 128;
  switch (kind) {
    case "sun":
      return drawSun(planet, planet / 2);
    case "mercury":
      return drawMercury(planet, planet / 2);
    case "venus":
      return drawVenus(planet, planet / 2);
    case "earth":
      return drawEarth(planet, planet / 2);
    case "moon":
      return drawMoon(planet, planet / 2);
    case "mars":
      return drawMars(planet, planet / 2);
    case "jupiter":
      return drawJupiter(planet, planet / 2);
    case "saturn":
      return drawSaturn(planet, planet / 2);
    case "uranus":
      return drawUranus(moon * 2, moon);
    case "neptune":
      return drawNeptune(moon * 2, moon);
    case "pluto":
      return drawPluto(moon, moon / 2);
    case "io":
      return drawIo(moon, moon / 2);
    case "europa":
      return drawEuropa(moon, moon / 2);
    case "ganymede":
      return drawGanymede(moon, moon / 2);
    case "callisto":
      return drawCallisto(moon, moon / 2);
    case "titan":
      return drawTitan(moon, moon / 2);
    case "triton":
      return drawTriton(moon, moon / 2);
    case "phobos":
      return drawPhobos(moon, moon / 2);
    case "rocky":
      return drawRocky(moon, moon / 2, [140, 130, 118], [180, 168, 150], [70, 64, 58], 30, 21);
    default:
      return drawIcy(moon, moon / 2);
  }
}

let nasaLoader: THREE.TextureLoader | null = null;

function loadNasaMap(spec: NasaTexture): THREE.Texture {
  if (!nasaLoader) nasaLoader = new THREE.TextureLoader();
  const t = nasaLoader.load(spec.url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  return t;
}

const cache = new Map<string, THREE.Texture>();

export function getBodyTexture(kind: TextureKind, id?: string): THREE.Texture {
  const key = id ?? kind;
  const hit = cache.get(key);
  if (hit) return hit;
  const nasa = getNasaTexture(id ?? kind, kind);
  const t = nasa ? loadNasaMap(nasa) : makeProcedural(kind);
  cache.set(key, t);
  return t;
}

export function getEarthCloudTexture(): THREE.Texture {
  const hit = cache.get("earth-clouds");
  if (hit) return hit;
  const t = loadNasaMap({ url: EARTH_CLOUDS_URL, layout: "equirect" });
  cache.set("earth-clouds", t);
  return t;
}

let ringTex: THREE.CanvasTexture | null = null;

/** Saturn radii for the ring plane. Keep in sync with `bodies.ts`. */
const RING_INNER = 1.11;
const RING_OUTER = 2.35;

function saturnRingProfile(rs: number): { rgb: number[]; a: number } {
  const tan = [232, 214, 176];
  const ice = [246, 236, 214];
  const dust = [168, 148, 118];
  if (rs < RING_INNER || rs > RING_OUTER) return { rgb: tan, a: 0 };
  const n = hash(rs * 80, 3.2);
  const n2 = hash(rs * 220, 8.1);
  let a = 0;
  let rgb = tan;
  if (rs < 1.24) {
    a = 18 + n * 14;
    rgb = dust;
  } else if (rs < 1.53) {
    a = 55 + n * 28;
    rgb = mix(dust, tan, 0.45);
    if (rs > 1.29 && rs < 1.32) a *= 0.25;
    if (rs > 1.45 && rs < 1.47) a *= 0.35;
  } else if (rs < 1.95) {
    a = 175 + n * 50;
    rgb = mix(tan, ice, 0.35 + n2 * 0.2);
  } else if (rs < 2.02) {
    a = 10 + n * 10;
    rgb = dust;
  } else if (rs < 2.27) {
    a = 115 + n * 35;
    rgb = mix(tan, ice, 0.2);
    if (rs > 2.21 && rs < 2.23) a *= 0.12;
  } else {
    a = rs > 2.31 && rs < 2.33 ? 70 + n * 20 : 8;
    rgb = ice;
  }
  return { rgb, a: Math.max(0, Math.min(255, a)) };
}

export function getSaturnRingTexture() {
  if (ringTex) return ringTex;
  const size = 512;
  const { c, ctx, w, h } = makeCanvas(size, size);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const cx = w / 2;
  const cy = h / 2;
  const maxR = w / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / maxR;
      const dy = (y + 0.5 - cy) / maxR;
      const rs = Math.hypot(dx, dy) * RING_OUTER;
      const { rgb, a } = saturnRingProfile(rs);
      put(d, (y * w + x) * 4, rgb, a);
    }
  }
  ctx.putImageData(img, 0, 0);
  ringTex = texFrom(c, false);
  ringTex.anisotropy = 8;
  ringTex.minFilter = THREE.LinearMipmapLinearFilter;
  ringTex.generateMipmaps = true;
  return ringTex;
}

let circleTex: THREE.CanvasTexture | null = null;

export function getCircleSprite() {
  if (circleTex) return circleTex;
  const { c, ctx } = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.85)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  circleTex = texFrom(c, false);
  return circleTex;
}

const urlCache = new Map<string, string>();

export function getBodyTextureDataUrl(kind: TextureKind, id?: string): string {
  const key = id ?? kind;
  const nasa = getNasaTexture(id ?? kind, kind);
  if (nasa) return nasa.url;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const tex = makeProcedural(kind);
  const canvas = tex.image as HTMLCanvasElement;
  const url = canvas.toDataURL("image/jpeg", 0.72);
  urlCache.set(key, url);
  return url;
}
