/**
 * Router base path derived from Vite's `base` (`/solar_system/` on GitHub Pages).
 * TanStack Router wants no trailing slash.
 */
export const BASE_PATH = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "/";

/**
 * Resolve a file from `public/` so it keeps working when the site is hosted
 * under `base` (`/solar_system/` on GitHub Pages, and the same path locally).
 */
export function publicAsset(path: string): string {
  const base = import.meta.env.BASE_URL || `${BASE_PATH}/`;
  const queryAt = path.indexOf("?");
  const pathname = queryAt === -1 ? path : path.slice(0, queryAt);
  const query = queryAt === -1 ? "" : path.slice(queryAt);
  const clean = pathname.replace(/^\/+/, "");
  return `${base}${clean}${query}`;
}
