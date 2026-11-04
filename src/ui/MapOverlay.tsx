import { useEffect, useMemo, useRef, useState } from "react";
import { BODIES, BODY_BY_ID, kmToAu, type BodyDef } from "@/sim/bodies";
import { clock, tickClock } from "@/sim/clock";
import {
  applyMapCam,
  bodyIconPx,
  clampSizeScale,
  computeOrbits,
  getBodyStates,
  mapCam,
  projectWorld,
  simFrame,
  viewState,
  zoomBy,
  zoomTo,
} from "@/sim/ephemeris";
import { useSimStore } from "@/sim/store";
import { isBodyEnabled } from "@/sim/layers";
import { cn } from "@/lib/utils";
import { getNasaTexture, type TexLayout } from "@/sim/nasaTextures";

function px(n: number) {
  return `${Number(n).toFixed(2)}px`;
}

/** Readable icon when zoomed out; true angular size once you close in. Scale enlarges every body. */
function pipSize(def: BodyDef, zDist: number, focused: boolean, sizeScale: number) {
  const z = Math.max(zDist, 1e-8);
  const scale = clampSizeScale(sizeScale);
  let floor = bodyIconPx(def);
  if (focused) floor = Math.max(floor, def.kind === "moon" ? 56 : def.kind === "star" ? 56 : 72);
  const tan = Math.tan(((viewState.fov * Math.PI) / 180) / 2);
  const truePx = (kmToAu(def.radiusKm) / z) * (Math.max(viewState.h, 1) / Math.max(tan, 1e-4));
  const cap = def.kind === "moon" ? 150 : 280;
  return Math.min(cap, Math.max(floor, truePx) * scale);
}

function sizedPip(def: BodyDef, zDist: number, focusId: string, sizeScale: number, parentSize?: number) {
  let size = pipSize(def, zDist, focusId === def.id, sizeScale);
  if (def.kind === "moon" && focusId !== def.id && parentSize && parentSize > 0) {
    size = Math.min(size, parentSize * 0.42);
  }
  return size;
}

function makeStarfield(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#07080c";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1100; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() ** 2 * 1.8 + 0.35;
    const a = 0.4 + Math.random() * 0.6;
    ctx.fillStyle = `rgba(236,240,252,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c.toDataURL("image/png");
}

function globeStyle(url: string | null, def: BodyDef, layout: TexLayout) {
  return {
    backgroundColor: def.color,
    backgroundImage: url
      ? `url(${url})`
      : `radial-gradient(circle at 32% 28%, rgba(255,255,255,0.45), transparent 42%), radial-gradient(circle at 50% 50%, ${def.color}, #050505)`,
    backgroundSize: layout === "equirect" ? "200% 100%" : "cover",
    backgroundPosition: "center",
    boxShadow:
      def.kind === "star"
        ? "0 0 36px rgba(255,190,70,0.95), 0 0 80px rgba(255,160,40,0.55)"
        : "inset -5px -5px 10px rgba(0,0,0,0.35), 0 0 12px rgba(0,0,0,0.45)",
  } as const;
}

export function PlanetPip({
  def,
  className,
}: {
  def: BodyDef;
  className?: string;
}) {
  const allowMap = def.kind === "star" || def.kind === "planet" || def.kind === "dwarf";
  const nasa = allowMap ? getNasaTexture(def.id, def.texture) : null;
  const layout: TexLayout = nasa?.layout ?? "disk";
  return (
    <span
      className={cn("shrink-0 overflow-hidden rounded-full bg-center bg-no-repeat", className)}
      style={{
        backgroundColor: def.color,
        backgroundImage: nasa ? `url(${nasa.url})` : undefined,
        backgroundSize: layout === "equirect" ? "200% 100%" : "cover",
        backgroundPosition: "center",
      }}
    />
  );
}

function Globe({ def }: { def: BodyDef }) {
  const nasa = getNasaTexture(def.id, def.texture);
  const [url, setUrl] = useState<string | null>(nasa?.url ?? null);
  const layout: TexLayout = nasa?.layout ?? "disk";

  useEffect(() => {
    if (nasa) {
      setUrl(nasa.url);
      return;
    }
    let alive = true;
    const run = async () => {
      try {
        const next = await import("@/sim/textures").then((m) => m.getBodyTextureDataUrl(def.texture, def.id));
        if (alive) setUrl(next);
      } catch {
        /* keep color fallback */
      }
    };
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(run);
    else setTimeout(run, 30);
    return () => {
      alive = false;
    };
  }, [def.id, def.texture, nasa]);

  return (
    <span className="relative block h-full w-full overflow-hidden rounded-full bg-center bg-no-repeat" style={globeStyle(url, def, layout)}>
      <span
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            def.kind === "star"
              ? "radial-gradient(circle at 38% 32%, rgba(255,255,255,0.55), transparent 46%)"
              : layout === "equirect"
                ? "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.28), transparent 36%), radial-gradient(circle at 78% 82%, rgba(0,0,0,0.38), transparent 48%)"
                : "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.16), transparent 34%), radial-gradient(circle at 80% 84%, rgba(0,0,0,0.22), transparent 52%)",
        }}
      />
    </span>
  );
}

type DrawnBody = {
  def: BodyDef;
  x: number;
  y: number;
  size: number;
  zDist: number;
};

type DrawnOrbit = { id: string; color: string; d: string; moon: boolean };

function computeScene(w: number, h: number) {
  viewState.w = w;
  viewState.h = h;
  const states = getBodyStates(clock.timeMs);
  simFrame.states = states;
  const store = useSimStore.getState();
  applyMapCam(store.focusId, states.get(store.focusId) ?? states.get("sun"));
  if (store.showOrbits) {
    simFrame.orbits = computeOrbits(states, store.showMoons);
  }
  const bodies: DrawnBody[] = [];
  const sizeById = new Map<string, number>();
  for (const def of BODIES) {
    const st = states.get(def.id);
    if (!st) continue;
    if (def.kind === "moon") {
      const parentFocused = store.focusId === def.id || store.focusId === def.parentId;
      if (!store.showMoons || (!parentFocused && mapCam.r > 2.4)) continue;
    }
    const p = projectWorld(st.x, st.y, st.z);
    if (!p.visible) continue;
    const size = sizedPip(def, p.zDist, store.focusId, store.sizeScale, def.parentId ? sizeById.get(def.parentId) : undefined);
    sizeById.set(def.id, size);
    bodies.push({ def, x: p.x, y: p.y, size, zDist: p.zDist });
  }
  bodies.sort((a, b) => b.zDist - a.zDist);
  const orbits: DrawnOrbit[] = [];
  if (store.showOrbits) {
    for (const orbit of simFrame.orbits) {
      const def = BODY_BY_ID[orbit.id];
      if (!def) continue;
      if (def.kind === "moon") {
        const parentFocused = store.focusId === def.parentId || store.focusId === def.id;
        if (!store.showMoons || (!parentFocused && mapCam.r > 2.4)) continue;
      }
      const pts = orbit.points;
      let d = "";
      let started = false;
      for (let i = 0; i < pts.length; i += 3) {
        const p = projectWorld(pts[i]!, pts[i + 1]!, pts[i + 2]!);
        if (!p.visible) {
          started = false;
          continue;
        }
        d += `${started ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        started = true;
      }
      if (d) orbits.push({ id: orbit.id, color: orbit.color, d, moon: def.kind === "moon" });
    }
  }
  return { bodies, orbits };
}

export function MapOverlay({ use3d = false, canvasReady = false }: { use3d?: boolean; canvasReady?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const bodiesRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ x: number; y: number; pid: number; moved: boolean; sx: number; sy: number } | null>(null);
  const nodes = useRef<Map<string, HTMLButtonElement>>(new Map());
  const drawnRef = useRef<DrawnBody[]>([]);
  const orbitAge = useRef(0);
  const last = useRef(performance.now());
  const use3dRef = useRef(use3d);
  use3dRef.current = use3d;
  const showOrbits = useSimStore((s) => s.showOrbits);
  const showLabels = useSimStore((s) => s.showLabels);
  const showMoons = useSimStore((s) => s.showMoons);
  const seed = useMemo(
    () =>
      computeScene(
        1280,
        800,
      ),
    [],
  );
  const seedById = useMemo(() => new Map(seed.bodies.map((b) => [b.def.id, b])), [seed]);
  const [sky, setSky] = useState<string | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const paintSky = () => {
      const w = Math.max(320, el.clientWidth || window.innerWidth);
      const h = Math.max(240, el.clientHeight || window.innerHeight);
      viewState.w = w;
      viewState.h = h;
      setSky(makeStarfield(Math.min(w, 1600), Math.min(h, 1000)));
    };
    paintSky();
    const ro = new ResizeObserver(paintSky);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    simFrame.states = getBodyStates(clock.timeMs);
    simFrame.orbits = computeOrbits(simFrame.states, useSimStore.getState().showMoons);
    applyMapCam(useSimStore.getState().focusId, simFrame.states.get("sun"));
  }, []);

  useEffect(() => {
    let id = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last.current) / 1000, 0.1);
      last.current = now;
      tickClock(dt);
      simFrame.dt = dt;
      simFrame.states = getBodyStates(clock.timeMs);
      const store = useSimStore.getState();
      orbitAge.current += dt;
      if (store.showOrbits && (orbitAge.current > 0.3 || simFrame.orbits.length === 0)) {
        simFrame.orbits = computeOrbits(simFrame.states, store.showMoons);
        orbitAge.current = 0;
      }
      const follow = simFrame.states.get(store.focusId);
      applyMapCam(store.focusId, follow);

      const drawn: DrawnBody[] = [];
      const sizeById = new Map<string, number>();
      for (const def of BODIES) {
        const st = simFrame.states.get(def.id);
        if (!st) continue;
        if (!isBodyEnabled(def, store)) {
          const el = nodes.current.get(def.id);
          if (el) el.style.display = "none";
          continue;
        }
        if (def.kind === "lagrange" && def.id.startsWith("eml")) {
          const close = mapCam.r < 0.08 || store.focusId.startsWith("eml") || store.focusId === "earth" || store.focusId === "moon";
          if (!close) {
            const el = nodes.current.get(def.id);
            if (el) el.style.display = "none";
            continue;
          }
        }
        if (def.kind === "moon") {
          const parentFocused = store.focusId === def.id || store.focusId === def.parentId;
          if (!store.showMoons || (!parentFocused && mapCam.r > 2.4)) {
            const el = nodes.current.get(def.id);
            if (el) el.style.display = "none";
            continue;
          }
        }
        const p = projectWorld(st.x, st.y, st.z);
        if (!p.visible) {
          const el = nodes.current.get(def.id);
          if (el) el.style.display = "none";
          continue;
        }
        const size = sizedPip(def, p.zDist, store.focusId, store.sizeScale, def.parentId ? sizeById.get(def.parentId) : undefined);
        sizeById.set(def.id, size);
        drawn.push({ def, x: p.x, y: p.y, size, zDist: p.zDist });
      }
      drawn.sort((a, b) => b.zDist - a.zDist);
      drawnRef.current = drawn;
      for (const item of drawn) {
        const el = nodes.current.get(item.def.id);
        if (!el) continue;
        el.style.display = "flex";
        el.style.zIndex = String(Math.round(4000 - item.zDist));
        el.style.transform = `translate(${item.x}px, ${item.y}px) translate(-50%, -50%)`;
        const globe = el.querySelector("[data-globe]") as HTMLElement | null;
        if (globe) {
          globe.style.width = `${item.size}px`;
          globe.style.height = `${item.size}px`;
        }
        const ring = el.querySelector("[data-ring]") as HTMLElement | null;
        if (ring) {
          ring.style.width = `${item.size * 2.35}px`;
          ring.style.height = `${item.size * 0.42}px`;
        }
        const label = el.querySelector("[data-name]") as HTMLElement | null;
        if (label) {
          const showName =
            store.showLabels &&
            (item.def.kind !== "moon" || mapCam.r < 1.8 || store.focusId === item.def.id || store.focusId === item.def.parentId) &&
            (item.def.kind !== "lagrange" ||
              store.focusId === item.def.id ||
              (item.def.id.startsWith("eml") ? mapCam.r < 0.05 : mapCam.r < 4));
          label.style.display = showName ? "block" : "none";
          label.style.top = `${item.size * 0.5 + 6}px`;
        }
      }

      const svg = svgRef.current;
      if (svg) {
        if (!store.showOrbits || use3dRef.current) {
          if (svg.innerHTML) svg.innerHTML = "";
        } else {
          const paths: DrawnOrbit[] = [];
          for (const orbit of simFrame.orbits) {
            const def = BODY_BY_ID[orbit.id];
            if (!def) continue;
            if (def.kind === "moon") {
              const parentFocused = store.focusId === def.parentId || store.focusId === def.id;
              if (!store.showMoons || (!parentFocused && mapCam.r > 2.4)) continue;
            }
            if (!isBodyEnabled(def, store)) continue;
            const pts = orbit.points;
            let d = "";
            let started = false;
            for (let i = 0; i < pts.length; i += 3) {
              const p = projectWorld(pts[i]!, pts[i + 1]!, pts[i + 2]!);
              if (!p.visible) {
                started = false;
                continue;
              }
              const cmd = started ? "L" : "M";
              d += `${cmd}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
              started = true;
            }
            if (d) paths.push({ id: orbit.id, color: orbit.color, d, moon: def.kind === "moon" });
          }
          svg.innerHTML = paths
            .map(
              (p) =>
                `<path d="${p.d}" fill="none" stroke="${p.color}" stroke-opacity="${p.moon ? 0.45 : 0.85}" stroke-width="${p.moon ? 1.2 : 2.2}" stroke-linejoin="round" stroke-linecap="round" />`,
            )
            .join("");
        }
      }

      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { dist: number; r: number } | null = null;
    let gestureR = mapCam.r;

    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest("button") && !use3dRef.current) return;
      if ((e.target as HTMLElement).closest("[data-hud-chrome]")) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        dragging.current = null;
        const pts = [...pointers.values()];
        const a = pts[0]!;
        const b = pts[1]!;
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), r: mapCam.r };
      } else {
        dragging.current = { x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false, sx: e.clientX, sy: e.clientY };
        el.setPointerCapture(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (pointers.has(e.pointerId)) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      if (pinch && pointers.size >= 2) {
        const pts = [...pointers.values()];
        const a = pts[0]!;
        const b = pts[1]!;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.dist > 8 && dist > 8) {
          zoomTo(pinch.r * (pinch.dist / dist));
        }
        return;
      }
      const d = dragging.current;
      if (!d || d.pid !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.moved = true;
      if (!d.moved) return;
      d.x = e.clientX;
      d.y = e.clientY;
      mapCam.theta -= dx * 0.005;
      mapCam.phi = Math.min(Math.max(mapCam.phi - dy * 0.005, 0.08), Math.PI - 0.08);
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      const d = dragging.current;
      if (d?.pid === e.pointerId) {
        if (!d.moved && use3dRef.current) {
          const rect = el.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          let best: DrawnBody | null = null;
          for (const b of drawnRef.current) {
            const hitR = Math.max(b.size * 0.55, 16);
            if (Math.hypot(x - b.x, y - b.y) > hitR) continue;
            if (!best || b.zDist < best.zDist) best = b;
          }
          if (best) useSimStore.getState().setFocus(best.def.id);
        }
        dragging.current = null;
      }
    };
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, aside, [data-hud-chrome]")) return;
      e.preventDefault();
      zoomBy(Math.exp(e.deltaY * 0.0018));
    };
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureR = mapCam.r;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const scale = Number((e as unknown as { scale?: number }).scale) || 1;
      zoomTo(gestureR / scale);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    window.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart as EventListener, { passive: false });
    el.addEventListener("gesturechange", onGestureChange as EventListener, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      window.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart as EventListener);
      el.removeEventListener("gesturechange", onGestureChange as EventListener);
    };
  }, []);

  const setFocus = useSimStore((s) => s.setFocus);

  return (
    <div
      ref={root}
      className="absolute inset-0 overflow-hidden"
      style={{ touchAction: "none", cursor: "grab" }}
    >
      {sky && !use3d ? (
        <img
          src={sky}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      ) : use3d ? null : (
        <div className="pointer-events-none absolute inset-0 bg-bg" />
      )}
      <svg
        ref={svgRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
        suppressHydrationWarning
      />
      <div ref={bodiesRef} className="absolute inset-0">
        {BODIES.map((def) => {
          const seedBody = seedById.get(def.id);
          return (
          <button
            key={def.id}
            type="button"
            ref={(node) => {
              if (node) nodes.current.set(def.id, node);
              else nodes.current.delete(def.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              setFocus(def.id);
            }}
            className={cn("absolute top-0 left-0 flex flex-col items-center", use3d && "pointer-events-none")}
            style={{
              display: seedBody ? "flex" : "none",
              willChange: "transform",
              transform: seedBody ? `translate(${seedBody.x.toFixed(2)}px, ${seedBody.y.toFixed(2)}px) translate(-50%, -50%)` : undefined,
              zIndex: seedBody ? Math.round(4000 - seedBody.zDist) : 0,
            }}
            aria-label={def.name}
            suppressHydrationWarning
          >
            <span className="relative inline-flex items-center justify-center">
              {def.rings && !use3d ? (
                <span
                  data-ring
                  className="pointer-events-none absolute left-1/2 top-1/2 rounded-[50%] border-amber-200/50"
                  style={{
                    width: px((seedBody?.size ?? 20) * 2.35),
                    height: px((seedBody?.size ?? 20) * 0.42),
                    borderWidth: "4px",
                    transform: "translate(-50%, -50%) rotate(-28deg)",
                    boxShadow: "0 0 8px rgba(210,190,140,0.35)",
                  }}
                />
              ) : null}
              <span
                data-globe
                className={cn(
                  "block",
                  def.kind === "lagrange" ? "rotate-45 rounded-sm bg-ice" : "rounded-full",
                )}
                style={{
                  width: px(seedBody?.size ?? 16),
                  height: px(seedBody?.size ?? 16),
                  backgroundColor: def.color,
                  opacity: canvasReady ? 0 : 1,
                }}
              >
                {!use3d && def.kind !== "lagrange" ? <Globe def={def} /> : null}
              </span>
            </span>
            <span
              data-name
              className={cn(
                "pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-bg/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
                def.kind === "moon" ? "text-muted" : "text-fg/90",
              )}
              style={{ top: px((seedBody?.size ?? 16) * 0.5 + 6) }}
            >
              {def.name}
            </span>
          </button>
          );
        })}
      </div>
      {!showOrbits || !showLabels || !showMoons ? null : null}
    </div>
  );
}
