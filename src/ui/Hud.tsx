import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  FastForward,
  Focus,
  Layers,
  Minus,
  Pause,
  Play,
  Plus,
  Rewind,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { BODIES, BODY_BY_ID, childrenOf, kmToAu, type BodyDef } from "@/sim/bodies";
import {
  clock,
  formatAu,
  formatIsoDate,
  formatPeriod,
  formatUtc,
  formatWarp,
  parseUtcDate,
  WARPS,
} from "@/sim/clock";
import {
  clampSizeScale,
  mapCam,
  simFrame,
  SIZE_SCALE_MAX,
  SIZE_SCALE_MIN,
  ZOOM_IN,
  ZOOM_OUT,
  zoomBy,
} from "@/sim/ephemeris";
import { useSimStore } from "@/sim/store";
import { isBodyEnabled } from "@/sim/layers";
import { cn } from "@/lib/utils";
import { MapOverlay, PlanetPip } from "./MapOverlay";
import { NASA_CREDIT } from "@/sim/nasaTextures";

function useRaf(onTick: () => void) {
  const cb = useRef(onTick);
  cb.current = onTick;
  useEffect(() => {
    let id = 0;
    const loop = () => {
      cb.current();
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

function HudButton({
  children,
  onClick,
  active,
  disabled,
  label,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-md text-fg transition-[background-color,transform,opacity] duration-150 ease-out",
        "hover:bg-fg/10 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        active ? "bg-accent text-accent-fg hover:bg-accent" : "bg-transparent",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ClockReadout() {
  const ref = useRef<HTMLDivElement>(null);
  useRaf(() => {
    if (ref.current) ref.current.textContent = formatUtc(clock.timeMs);
  });
  return (
    <div
      ref={ref}
      suppressHydrationWarning
      className="font-mono text-sm tabular-nums tracking-wide text-fg md:text-base"
      aria-live="off"
    >
      —
    </div>
  );
}

function WarpReadout() {
  const warpIndex = useSimStore((s) => s.warpIndex);
  const direction = useSimStore((s) => s.direction);
  const playing = useSimStore((s) => s.playing);
  const value = WARPS[warpIndex]! * direction;
  return (
    <div className="font-mono text-xs tabular-nums text-ice">
      {playing ? formatWarp(value) : "paused"}
    </div>
  );
}

function TimeBar() {
  const playing = useSimStore((s) => s.playing);
  const warpIndex = useSimStore((s) => s.warpIndex);
  const direction = useSimStore((s) => s.direction);
  const jumpOpen = useSimStore((s) => s.jumpOpen);
  const togglePlaying = useSimStore((s) => s.togglePlaying);
  const bumpWarp = useSimStore((s) => s.bumpWarp);
  const setDirection = useSimStore((s) => s.setDirection);
  const now = useSimStore((s) => s.now);
  const setJumpOpen = useSimStore((s) => s.setJumpOpen);

  return (
    <div className="pointer-events-auto flex w-full max-w-3xl flex-col items-center gap-2">
      <div className="flex items-center gap-1 rounded-xl bg-surface/90 p-1.5 shadow-panel backdrop-blur-sm">
        <HudButton label="Rewind" active={playing && direction < 0} onClick={() => setDirection(-1)}>
          <Rewind className="size-4" strokeWidth={1.75} />
        </HudButton>
        <HudButton label="Slower" onClick={() => bumpWarp(-1)} disabled={warpIndex === 0}>
          <ChevronsLeft className="size-4" strokeWidth={1.75} />
        </HudButton>
        <HudButton
          label={playing ? "Pause" : "Play"}
          active={playing}
          onClick={togglePlaying}
          className="size-12 rounded-lg"
        >
          {playing ? (
            <Pause className="size-5" strokeWidth={1.75} />
          ) : (
            <Play className="ml-0.5 size-5" strokeWidth={1.75} />
          )}
        </HudButton>
        <HudButton label="Faster" onClick={() => bumpWarp(1)} disabled={warpIndex === WARPS.length - 1}>
          <ChevronsRight className="size-4" strokeWidth={1.75} />
        </HudButton>
        <HudButton label="Forward" active={playing && direction > 0} onClick={() => setDirection(1)}>
          <FastForward className="size-4" strokeWidth={1.75} />
        </HudButton>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-lg bg-surface/85 px-3 py-2 shadow-panel">
        <ClockReadout />
        <span className="hidden h-3 w-px bg-line sm:block" />
        <WarpReadout />
        <span className="hidden h-3 w-px bg-line sm:block" />
        <button
          type="button"
          onClick={now}
          className="h-8 rounded-sm px-2 font-mono text-[11px] uppercase tracking-wider text-muted transition-colors duration-150 hover:text-fg"
        >
          Now
        </button>
        <button
          type="button"
          onClick={() => setJumpOpen(!jumpOpen)}
          className="h-8 rounded-sm px-2 font-mono text-[11px] uppercase tracking-wider text-muted transition-colors duration-150 hover:text-fg"
        >
          Jump
        </button>
      </div>
      {jumpOpen ? <JumpSheet /> : null}
    </div>
  );
}

function JumpSheet() {
  const jumpTo = useSimStore((s) => s.jumpTo);
  const setJumpOpen = useSimStore((s) => s.setJumpOpen);
  const [date, setDate] = useState(() => formatIsoDate(clock.timeMs));
  const presets = [
    { label: "J2000", ms: Date.UTC(2000, 0, 1, 12) },
    { label: "Apollo 11", ms: Date.UTC(1969, 6, 20, 20, 17) },
    { label: "Voyager 2", ms: Date.UTC(1989, 7, 25, 12) },
    { label: "New Horizons", ms: Date.UTC(2015, 6, 14, 11, 49) },
  ];

  return (
    <div className="w-full max-w-md rounded-xl bg-surface p-3 shadow-panel">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">Jump to date (UTC)</p>
        <button
          type="button"
          aria-label="Close jump"
          onClick={() => setJumpOpen(false)}
          className="inline-flex size-8 items-center justify-center rounded-sm text-muted hover:text-fg"
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 flex-1 rounded-md border-0 bg-surface-2 px-3 font-mono text-sm text-fg outline-none ring-1 ring-line focus:ring-ice"
        />
        <button
          type="button"
          className="h-11 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
          onClick={() => {
            const ms = parseUtcDate(date, clock.timeMs);
            if (ms != null) {
              jumpTo(ms);
              setJumpOpen(false);
            }
          }}
        >
          Go
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              jumpTo(p.ms);
              setDate(formatIsoDate(p.ms));
              setJumpOpen(false);
            }}
            className="h-8 rounded-sm bg-surface-2 px-2.5 font-mono text-[11px] text-muted hover:text-fg"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BodyRow({ def, depth }: { def: BodyDef; depth: number }) {
  const focusId = useSimStore((s) => s.focusId);
  const setFocus = useSimStore((s) => s.setFocus);
  const showMoons = useSimStore((s) => s.showMoons);
  const active = focusId === def.id;
  const kids = childrenOf(def.id).filter((b) => b.kind === "moon");
  return (
    <div>
      <button
        type="button"
        onClick={() => setFocus(def.id)}
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors duration-150",
          active ? "bg-fg/10 text-fg" : "text-muted hover:bg-fg/10 hover:text-fg",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        <PlanetPip def={def} className="size-4" />
        <span className="truncate">{def.name}</span>
        {def.kind === "dwarf" ? (
          <span className="ml-auto font-mono text-[10px] uppercase text-subtle">dwarf</span>
        ) : def.kind === "comet" ? (
          <span className="ml-auto font-mono text-[10px] uppercase text-subtle">comet</span>
        ) : def.kind === "asteroid" ? (
          <span className="ml-auto font-mono text-[10px] uppercase text-subtle">belt</span>
        ) : def.kind === "lagrange" ? (
          <span className="ml-auto font-mono text-[10px] uppercase text-subtle">L{def.ephemeris.type === "lagrange" ? def.ephemeris.point : ""}</span>
        ) : null}
      </button>
      {showMoons && kids.length > 0
        ? kids.map((k) => <BodyRow key={k.id} def={k} depth={depth + 1} />)
        : null}
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: BodyDef[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">{title}</p>
      {items.map((b) => (
        <BodyRow key={b.id} def={b} depth={0} />
      ))}
    </div>
  );
}

function BodyList() {
  const listOpen = useSimStore((s) => s.listOpen);
  const setListOpen = useSimStore((s) => s.setListOpen);
  const showAsteroidBelt = useSimStore((s) => s.showAsteroidBelt);
  const showKuiperBelt = useSimStore((s) => s.showKuiperBelt);
  const showComets = useSimStore((s) => s.showComets);
  const showLagrange = useSimStore((s) => s.showLagrange);
  const flags = { showSoi: true, showAsteroidBelt, showKuiperBelt, showComets, showLagrange };
  const core = BODIES.filter(
    (b) =>
      (b.kind === "star" || b.kind === "planet" || (b.kind === "dwarf" && b.layer !== "asteroid" && b.layer !== "kuiper")) &&
      isBodyEnabled(b, flags),
  );
  const asteroids = BODIES.filter((b) => b.layer === "asteroid" && showAsteroidBelt);
  const kuiper = BODIES.filter((b) => b.layer === "kuiper" && showKuiperBelt);
  const comets = BODIES.filter((b) => b.layer === "comet" && showComets);
  const sel = BODIES.filter((b) => b.layer === "lagrange" && b.id.startsWith("sel") && showLagrange);
  const eml = BODIES.filter((b) => b.layer === "lagrange" && b.id.startsWith("eml") && showLagrange);

  return (
    <>
      <button
        type="button"
        className="pointer-events-auto inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-surface/90 px-3 text-sm text-fg shadow-panel md:hidden"
        onClick={() => setListOpen(!listOpen)}
      >
        Worlds
        <ChevronDown className={cn("size-4 transition-transform", listOpen && "rotate-180")} />
      </button>
      <aside
        className={cn(
          "pointer-events-auto flex max-h-[min(70vh,28rem)] w-[min(18rem,calc(100vw-2rem))] flex-col rounded-xl bg-surface/90 shadow-panel backdrop-blur-sm",
          "fixed top-16 left-3 z-20 md:static md:top-auto md:left-auto md:z-auto md:max-h-[calc(100vh-12rem)] md:w-56",
          listOpen ? "flex" : "hidden md:flex",
        )}
      >
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">System</p>
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-sm text-muted md:hidden"
            onClick={() => setListOpen(false)}
            aria-label="Close list"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {core.map((b) => (
            <BodyRow key={b.id} def={b} depth={0} />
          ))}
          <ListSection title="Asteroid belt" items={asteroids} />
          <ListSection title="Kuiper belt" items={kuiper} />
          <ListSection title="Comets" items={comets} />
          <ListSection title="Sun–Earth" items={sel} />
          <ListSection title="Earth–Moon" items={eml} />
        </div>
      </aside>
    </>
  );
}

function InfoPanel({ compact = false }: { compact?: boolean }) {
  const selectedId = useSimStore((s) => s.selectedId);
  const setFocus = useSimStore((s) => s.setFocus);
  const def = BODY_BY_ID[selectedId];
  const distRef = useRef<HTMLSpanElement>(null);

  useRaf(() => {
    const st = simFrame.states.get(selectedId);
    if (distRef.current && st) {
      const au = Math.hypot(st.x, st.y, st.z);
      distRef.current.textContent = selectedId === "sun" ? "—" : formatAu(au);
    }
  });

  if (!def) return null;
  const moons = childrenOf(def.id).filter((b) => b.kind === "moon");

  if (compact) {
    return (
      <section className="pointer-events-auto flex w-[min(22rem,calc(100vw-2rem))] items-center gap-3 rounded-xl bg-surface/90 px-3 py-2 shadow-panel backdrop-blur-sm">
        <PlanetPip def={def} className="size-8 shadow-panel" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight text-fg">{def.name}</p>
          <p className="font-mono text-[11px] tabular-nums text-muted">
            <span ref={distRef}>—</span>
            {def.periodDays > 0 ? ` · ${formatPeriod(def.periodDays)}` : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label="Frame body"
          onClick={() => setFocus(def.id, true)}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-fg/10 hover:text-fg"
        >
          <Focus className="size-4" strokeWidth={1.75} />
        </button>
      </section>
    );
  }

  return (
    <section className="pointer-events-auto w-[min(18rem,calc(100vw-2rem))] rounded-xl bg-surface/90 p-4 shadow-panel backdrop-blur-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <PlanetPip def={def} className="mt-0.5 size-12 shadow-panel" />
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">
              {def.kind === "lagrange" ? "Lagrange" : def.kind}
            </p>
            <h2 className="mt-1 text-lg font-medium tracking-tight text-fg">{def.name}</h2>
          </div>
        </div>
        <button
          type="button"
          aria-label="Frame body"
          onClick={() => setFocus(def.id, true)}
          className="inline-flex size-10 items-center justify-center rounded-md text-muted hover:bg-fg/10 hover:text-fg"
        >
          <Focus className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      <p className="mt-2 text-pretty text-xs leading-relaxed text-muted">{def.blurb}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 font-mono text-[11px] tabular-nums">
        <div>
          <dt className="text-subtle">Heliocentric</dt>
          <dd ref={distRef} className="text-fg">
            —
          </dd>
        </div>
        <div>
          <dt className="text-subtle">{def.kind === "lagrange" ? "Marker" : "Radius"}</dt>
          <dd className="text-fg">{def.kind === "lagrange" ? "map point" : formatAu(kmToAu(def.radiusKm))}</dd>
        </div>
        <div>
          <dt className="text-subtle">Orbit</dt>
          <dd className="text-fg">{formatPeriod(def.periodDays)}</dd>
        </div>
        <div>
          <dt className="text-subtle">Day</dt>
          <dd className="text-fg">
            {def.rotationHours === 0
              ? "—"
              : `${Math.abs(def.rotationHours).toFixed(def.rotationHours < 30 ? 2 : 1)} h${def.rotationHours < 0 ? " ret." : ""}`}
          </dd>
        </div>
      </dl>
      {moons.length > 0 ? (
        <p className="mt-3 font-mono text-[10px] uppercase tracking-wider text-subtle">
          {moons.length} moon{moons.length === 1 ? "" : "s"} in view
        </p>
      ) : null}
    </section>
  );
}

function Toggles() {
  const showOrbits = useSimStore((s) => s.showOrbits);
  const showLabels = useSimStore((s) => s.showLabels);
  const showMoons = useSimStore((s) => s.showMoons);
  const showGrid = useSimStore((s) => s.showGrid);
  const showSoi = useSimStore((s) => s.showSoi);
  const showAsteroidBelt = useSimStore((s) => s.showAsteroidBelt);
  const showKuiperBelt = useSimStore((s) => s.showKuiperBelt);
  const showComets = useSimStore((s) => s.showComets);
  const showLagrange = useSimStore((s) => s.showLagrange);
  const sizeScale = useSimStore((s) => s.sizeScale);
  const setShowOrbits = useSimStore((s) => s.setShowOrbits);
  const setShowLabels = useSimStore((s) => s.setShowLabels);
  const setShowMoons = useSimStore((s) => s.setShowMoons);
  const setShowGrid = useSimStore((s) => s.setShowGrid);
  const setShowSoi = useSimStore((s) => s.setShowSoi);
  const setShowAsteroidBelt = useSimStore((s) => s.setShowAsteroidBelt);
  const setShowKuiperBelt = useSimStore((s) => s.setShowKuiperBelt);
  const setShowComets = useSimStore((s) => s.setShowComets);
  const setShowLagrange = useSimStore((s) => s.setShowLagrange);
  const setSizeScale = useSimStore((s) => s.setSizeScale);
  const [open, setOpen] = useState(false);

  const chip = (on: boolean, label: string, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "h-8 rounded-sm px-2.5 font-mono text-[11px] uppercase tracking-wider transition-colors duration-150",
        on ? "bg-fg/10 text-fg" : "text-muted hover:text-fg",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="pointer-events-auto relative flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-surface/90 px-3 text-sm text-fg shadow-panel md:hidden"
        aria-expanded={open}
      >
        <SlidersHorizontal className="size-4" strokeWidth={1.75} />
        View
      </button>
      <div
        className={cn(
          "flex-col gap-1 rounded-xl bg-surface/90 p-2 shadow-panel backdrop-blur-sm",
          "absolute top-12 right-0 z-20 md:static md:top-auto md:right-auto",
          open ? "flex" : "hidden md:flex",
        )}
      >
        <div className="flex flex-wrap justify-end gap-0.5">
          {chip(showOrbits, "Orbits", () => setShowOrbits(!showOrbits))}
          {chip(showLabels, "Labels", () => setShowLabels(!showLabels))}
          {chip(showMoons, "Moons", () => setShowMoons(!showMoons))}
          {chip(showGrid, "AU grid", () => setShowGrid(!showGrid))}
        </div>
        <div className="mt-1 flex items-center gap-2 px-2 pt-1">
          <Layers className="size-3 text-subtle" strokeWidth={1.75} />
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-subtle">Layers</p>
        </div>
        <div className="flex flex-wrap justify-end gap-0.5">
          {chip(showSoi, "SOI", () => setShowSoi(!showSoi))}
          {chip(showAsteroidBelt, "Asteroids", () => setShowAsteroidBelt(!showAsteroidBelt))}
          {chip(showKuiperBelt, "Kuiper", () => setShowKuiperBelt(!showKuiperBelt))}
          {chip(showComets, "Comets", () => setShowComets(!showComets))}
          {chip(showLagrange, "Lagrange", () => setShowLagrange(!showLagrange))}
        </div>
        <label className="mt-1 flex items-center gap-2 px-2 py-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-subtle">Scale</span>
          <input
            type="range"
            min={SIZE_SCALE_MIN}
            max={SIZE_SCALE_MAX}
            step={1}
            value={clampSizeScale(sizeScale)}
            onChange={(e) => setSizeScale(Number(e.target.value))}
            className="h-8 w-28 accent-accent"
            aria-label="Body size scale"
            suppressHydrationWarning
          />
          <span className="w-8 font-mono text-[11px] tabular-nums text-muted">{clampSizeScale(sizeScale)}×</span>
        </label>
      </div>
    </div>
  );
}

function ZoomReadout() {
  const ref = useRef<HTMLDivElement>(null);
  useRaf(() => {
    if (ref.current) ref.current.textContent = formatAu(mapCam.r);
  });
  return (
    <div
      ref={ref}
      suppressHydrationWarning
      className="min-w-[3.5rem] px-1 text-center font-mono text-[10px] tabular-nums tracking-wide text-muted"
      aria-live="off"
    >
      —
    </div>
  );
}

function ZoomHoldButton({
  label,
  factor,
  children,
}: {
  label: string;
  factor: number;
  children: React.ReactNode;
}) {
  const hold = useRef<number | null>(null);
  const stop = () => {
    if (hold.current != null) {
      window.clearInterval(hold.current);
      hold.current = null;
    }
  };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex size-11 items-center justify-center rounded-md text-fg transition-[background-color,transform] duration-150 hover:bg-fg/10 active:scale-[0.98]"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
        zoomBy(factor);
        hold.current = window.setInterval(() => zoomBy(factor), 120);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    >
      {children}
    </button>
  );
}

function ZoomControls() {
  const focusId = useSimStore((s) => s.focusId);
  const setFocus = useSimStore((s) => s.setFocus);
  return (
    <div
      data-hud-chrome
      className="pointer-events-auto flex flex-col items-center rounded-xl bg-surface/90 p-1 shadow-panel backdrop-blur-sm"
    >
      <ZoomHoldButton label="Zoom in" factor={ZOOM_IN}>
        <Plus className="size-4" strokeWidth={1.75} />
      </ZoomHoldButton>
      <ZoomReadout />
      <ZoomHoldButton label="Zoom out" factor={ZOOM_OUT}>
        <Minus className="size-4" strokeWidth={1.75} />
      </ZoomHoldButton>
      <button
        type="button"
        aria-label="Frame focused body"
        title="Frame focused body"
        className="hidden size-11 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-fg/10 hover:text-fg md:inline-flex"
        onClick={() => setFocus(focusId, true)}
      >
        <Focus className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

function HelpHint() {
  const dismissed = useSimStore((s) => s.helpDismissed);
  const setHelpDismissed = useSimStore((s) => s.setHelpDismissed);
  if (dismissed) return null;
  return (
    <div className="pointer-events-auto hidden max-w-xs rounded-xl bg-surface/90 p-3 shadow-panel md:block">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-relaxed text-muted">
          Drag to orbit the globe · pinch or scroll to zoom · click a world to focus. Planets keep their real tilt — pan around to see every side. Play warps time.
        </p>
        <button
          type="button"
          aria-label="Dismiss help"
          onClick={() => setHelpDismissed(true)}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-muted hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-subtle">
        Space play · [ ] warp · + − zoom · N now · 0–9 focus
      </p>
    </div>
  );
}

export function Hud({ use3d = false, canvasReady = false }: { use3d?: boolean; canvasReady?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 text-fg">
      <div className="pointer-events-auto absolute inset-0 z-0">
        <MapOverlay use3d={use3d} canvasReady={canvasReady} />
      </div>
      <div className="relative z-10 flex items-start justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]">
        <div className="relative flex min-w-0 flex-col gap-3">
          <div className="pointer-events-auto">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-subtle">Orrery</p>
            <p className="hidden text-sm text-muted md:block">Live solar system map</p>
            <p className="mt-1 hidden font-mono text-[10px] uppercase tracking-wider text-subtle md:block">
              {NASA_CREDIT}
            </p>
          </div>
          <BodyList />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-3">
          <Toggles />
          <div className="hidden md:block">
            <InfoPanel />
          </div>
        </div>
      </div>
      <div className="absolute right-0 bottom-0 left-0 z-10 flex flex-col items-center gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="md:hidden">
          <InfoPanel compact />
        </div>
        <HelpHint />
        <TimeBar />
      </div>
      <div className="pointer-events-none absolute right-3 bottom-[max(12.5rem,calc(env(safe-area-inset-bottom)+11.5rem))] z-20 md:bottom-28">
        <ZoomControls />
      </div>
    </div>
  );
}

export function useHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const s = useSimStore.getState();
      if (e.code === "Space") {
        e.preventDefault();
        s.togglePlaying();
      } else if (e.key === "." || e.key === "]" || e.code === "Period") {
        s.bumpWarp(1);
      } else if (e.key === "," || e.key === "[" || e.code === "Comma") {
        s.bumpWarp(-1);
      } else if (e.key === "\\" || e.key === "/") {
        s.reverse();
      } else if (e.key === "n" || e.key === "N") {
        s.now();
      } else if (e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd") {
        e.preventDefault();
        zoomBy(ZOOM_IN);
      } else if (e.key === "-" || e.key === "_" || e.code === "Minus" || e.code === "NumpadSubtract") {
        e.preventDefault();
        zoomBy(ZOOM_OUT);
      } else if (e.key === "f" || e.key === "F") {
        s.setFocus(s.focusId, true);
      } else if (e.key === "o" || e.key === "O") {
        s.setShowOrbits(!s.showOrbits);
      } else if (e.key === "l" || e.key === "L") {
        s.setShowLabels(!s.showLabels);
      } else if (e.key === "m" || e.key === "M") {
        s.setShowMoons(!s.showMoons);
      } else if (e.key === "g" || e.key === "G") {
        s.setShowGrid(!s.showGrid);
      } else if (e.key === "Escape" || e.key === "0") {
        s.setFocus("sun");
      } else if (e.key === "1") s.setFocus("mercury");
      else if (e.key === "2") s.setFocus("venus");
      else if (e.key === "3") s.setFocus("earth");
      else if (e.key === "4") s.setFocus("mars");
      else if (e.key === "5") s.setFocus("jupiter");
      else if (e.key === "6") s.setFocus("saturn");
      else if (e.key === "7") s.setFocus("uranus");
      else if (e.key === "8") s.setFocus("neptune");
      else if (e.key === "9") s.setFocus("pluto");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
