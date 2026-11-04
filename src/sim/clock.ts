export const WARPS = [
  1, 5, 10, 50, 100, 1_000, 10_000, 100_000, 1_000_000, 5_000_000, 10_000_000, 100_000_000, 1_000_000_000,
] as const;

export type WarpValue = (typeof WARPS)[number];

export const clock = {
  timeMs: Date.now(),
  playing: false,
  warp: 1,
};

export function tickClock(dtSec: number) {
  if (!clock.playing) return;
  const dt = Math.min(dtSec, 0.1);
  clock.timeMs += dt * clock.warp * 1000;
}

export function formatUtc(ms: number) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");
  const year = d.getUTCFullYear();
  const era = year < 0 ? `${pad(-year, 4)} BCE` : String(year).padStart(4, "0");
  return `${era} ${months[d.getUTCMonth()]} ${pad(d.getUTCDate())}  ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
}

export function formatIsoDate(ms: number) {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function formatWarp(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  return `${sign}${abs.toLocaleString("en-US")}×`;
}

export function formatAu(au: number) {
  const abs = Math.abs(au);
  if (abs < 0.0005) {
    const km = abs * 149597870.7;
    if (km < 10) return `${km.toFixed(2)} km`;
    if (km < 1000) return `${km.toFixed(0)} km`;
    return `${(km / 1000).toFixed(1)} ×10³ km`;
  }
  if (abs < 0.1) return `${abs.toFixed(4)} AU`;
  if (abs < 10) return `${abs.toFixed(3)} AU`;
  return `${abs.toFixed(2)} AU`;
}

export function formatPeriod(days: number) {
  const abs = Math.abs(days);
  if (abs === 0) return "—";
  if (abs < 1) return `${(abs * 24).toFixed(2)} h`;
  if (abs < 40) return `${abs.toFixed(2)} d`;
  if (abs < 400) return `${(abs / 365.256).toFixed(2)} yr`;
  return `${(abs / 365.256).toFixed(1)} yr`;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function parseUtcDate(value: string, keepTimeMs: number) {
  const m = /^(\-?\d+)-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const prev = new Date(keepTimeMs);
  const next = new Date(Date.UTC(year, month, day, prev.getUTCHours(), prev.getUTCMinutes(), prev.getUTCSeconds()));
  if (Number.isNaN(next.getTime())) return null;
  return next.getTime();
}

export { MONTHS };
