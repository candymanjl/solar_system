import { publicAsset } from "@/lib/base-path";

export type TexLayout = "equirect" | "disk";

export type NasaTexture = {
  url: string;
  layout: TexLayout;
};

/** Bundled NASA / JPL / USGS public-domain maps, UV-ready (equirectangular 2:1). */
export const NASA_TEXTURES: Record<string, NasaTexture> = {
  sun: { url: "/textures/sun.jpg?v=cyl1", layout: "equirect" },
  mercury: { url: "/textures/mercury.jpg?v=cyl1", layout: "equirect" },
  venus: { url: "/textures/venus.jpg?v=cyl1", layout: "equirect" },
  earth: { url: "/textures/earth.jpg", layout: "equirect" },
  moon: { url: "/textures/moon.jpg", layout: "equirect" },
  mars: { url: "/textures/mars.jpg?v=cyl1", layout: "equirect" },
  jupiter: { url: "/textures/jupiter.jpg?v=cyl1", layout: "equirect" },
  saturn: { url: "/textures/saturn.jpg?v=cyl1", layout: "equirect" },
  uranus: { url: "/textures/uranus.jpg?v=cyl1", layout: "equirect" },
  neptune: { url: "/textures/neptune.jpg?v=cyl1", layout: "equirect" },
  pluto: { url: "/textures/pluto.jpg?v=cyl1", layout: "equirect" },
  io: { url: "/textures/io.jpg", layout: "equirect" },
  europa: { url: "/textures/europa.jpg", layout: "equirect" },
  ganymede: { url: "/textures/ganymede.jpg?v=cyl2", layout: "equirect" },
  callisto: { url: "/textures/callisto.jpg", layout: "equirect" },
  titan: { url: "/textures/titan.jpg", layout: "equirect" },
  triton: { url: "/textures/triton.jpg", layout: "equirect" },
  charon: { url: "/textures/charon.jpg", layout: "equirect" },
  mimas: { url: "/textures/mimas.jpg", layout: "equirect" },
  enceladus: { url: "/textures/enceladus.jpg", layout: "equirect" },
  tethys: { url: "/textures/tethys.jpg", layout: "equirect" },
  dione: { url: "/textures/dione.jpg", layout: "equirect" },
  rhea: { url: "/textures/rhea.jpg", layout: "equirect" },
  iapetus: { url: "/textures/iapetus.jpg", layout: "equirect" },
};

export const NASA_CREDIT = "Maps: NASA / JPL / USGS";

export const EARTH_CLOUDS_URL = publicAsset("/textures/earth-clouds.jpg");

export function getNasaTexture(id: string, kind?: string): NasaTexture | null {
  const spec = NASA_TEXTURES[id] ?? (kind ? (NASA_TEXTURES[kind] ?? null) : null);
  if (!spec) return null;
  return { ...spec, url: publicAsset(spec.url) };
}
