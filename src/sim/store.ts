import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clock, WARPS } from "./clock";
import { frameBody } from "./ephemeris";
import { BODY_BY_ID } from "./bodies";
import { isBodyEnabled } from "./layers";

export type SimSettings = {
  playing: boolean;
  warpIndex: number;
  direction: 1 | -1;
  focusId: string;
  selectedId: string;
  showOrbits: boolean;
  showLabels: boolean;
  showMoons: boolean;
  showGrid: boolean;
  showSoi: boolean;
  showAsteroidBelt: boolean;
  showKuiperBelt: boolean;
  showComets: boolean;
  showLagrange: boolean;
  sizeScale: number;
  helpDismissed: boolean;
  listOpen: boolean;
  jumpOpen: boolean;
};

type SimActions = {
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setWarpIndex: (index: number) => void;
  bumpWarp: (delta: number) => void;
  setDirection: (direction: 1 | -1) => void;
  reverse: () => void;
  setFocus: (id: string, frame?: boolean) => void;
  setSelected: (id: string) => void;
  setShowOrbits: (v: boolean) => void;
  setShowLabels: (v: boolean) => void;
  setShowMoons: (v: boolean) => void;
  setShowGrid: (v: boolean) => void;
  setShowSoi: (v: boolean) => void;
  setShowAsteroidBelt: (v: boolean) => void;
  setShowKuiperBelt: (v: boolean) => void;
  setShowComets: (v: boolean) => void;
  setShowLagrange: (v: boolean) => void;
  setSizeScale: (v: number) => void;
  setHelpDismissed: (v: boolean) => void;
  setListOpen: (v: boolean) => void;
  setJumpOpen: (v: boolean) => void;
  jumpTo: (ms: number) => void;
  now: () => void;
};

export type FrameRequest = { id: string; nonce: number };
export const frameBus: { request: FrameRequest | null } = { request: null };

function syncClock(s: Pick<SimSettings, "playing" | "warpIndex" | "direction">) {
  clock.playing = s.playing;
  clock.warp = WARPS[s.warpIndex]! * s.direction;
}

const persistKeys = {
  showOrbits: true,
  showLabels: true,
  showMoons: true,
  showGrid: true,
  showSoi: true,
  showAsteroidBelt: true,
  showKuiperBelt: true,
  showComets: true,
  showLagrange: true,
  sizeScale: true,
  helpDismissed: true,
} as const;

function retargetIfHidden(
  set: (p: Partial<SimSettings>) => void,
  get: () => SimSettings,
  patch: Partial<SimSettings>,
) {
  const next = { ...get(), ...patch };
  const def = BODY_BY_ID[next.focusId];
  if (def && !isBodyEnabled(def, next)) {
    frameBody("sun");
    set({ ...patch, focusId: "sun", selectedId: "sun" });
    return;
  }
  set(patch);
}

export const useSimStore = create<SimSettings & SimActions>()(
  persist(
    (set, get) => ({
      playing: false,
      warpIndex: 6,
      direction: 1,
      focusId: "sun",
      selectedId: "sun",
      showOrbits: true,
      showLabels: true,
      showMoons: true,
      showGrid: false,
      showSoi: true,
      showAsteroidBelt: true,
      showKuiperBelt: true,
      showComets: true,
      showLagrange: true,
      sizeScale: 1,
      helpDismissed: false,
      listOpen: false,
      jumpOpen: false,

      setPlaying: (playing) => {
        set({ playing });
        syncClock({ ...get(), playing });
      },
      togglePlaying: () => {
        const playing = !get().playing;
        set({ playing });
        syncClock({ ...get(), playing });
      },
      setWarpIndex: (index) => {
        const warpIndex = Math.max(0, Math.min(WARPS.length - 1, index));
        set({ warpIndex });
        syncClock({ ...get(), warpIndex });
      },
      bumpWarp: (delta) => {
        const warpIndex = Math.max(0, Math.min(WARPS.length - 1, get().warpIndex + delta));
        set({ warpIndex });
        syncClock({ ...get(), warpIndex });
      },
      setDirection: (direction) => {
        set({ direction, playing: true });
        syncClock({ ...get(), direction, playing: true });
      },
      reverse: () => {
        const direction = get().direction === 1 ? -1 : 1;
        set({ direction, playing: true });
        syncClock({ ...get(), direction, playing: true });
      },
      setFocus: (id, frame = true) => {
        set({ focusId: id, selectedId: id, listOpen: false });
        if (frame) {
          frameBody(id);
          frameBus.request = { id, nonce: (frameBus.request?.nonce ?? 0) + 1 };
        }
      },
      setSelected: (id) => set({ selectedId: id }),
      setShowOrbits: (showOrbits) => set({ showOrbits }),
      setShowLabels: (showLabels) => set({ showLabels }),
      setShowMoons: (showMoons) => set({ showMoons }),
      setShowGrid: (showGrid) => set({ showGrid }),
      setShowSoi: (showSoi) => set({ showSoi }),
      setShowAsteroidBelt: (v) => retargetIfHidden(set, get, { showAsteroidBelt: v }),
      setShowKuiperBelt: (v) => retargetIfHidden(set, get, { showKuiperBelt: v }),
      setShowComets: (v) => retargetIfHidden(set, get, { showComets: v }),
      setShowLagrange: (v) => retargetIfHidden(set, get, { showLagrange: v }),
      setSizeScale: (sizeScale) => set({ sizeScale }),
      setHelpDismissed: (helpDismissed) => set({ helpDismissed }),
      setListOpen: (listOpen) => set({ listOpen }),
      setJumpOpen: (jumpOpen) => set({ jumpOpen }),
      jumpTo: (ms) => {
        clock.timeMs = ms;
        set({ playing: false, jumpOpen: false });
        syncClock({ ...get(), playing: false });
      },
      now: () => {
        clock.timeMs = Date.now();
        set({ playing: false, direction: 1 });
        syncClock({ ...get(), playing: false, direction: 1 });
      },
    }),
    {
      name: "orrery-v1",
      version: 2,
      partialize: (s) => ({
        showOrbits: s.showOrbits,
        showLabels: s.showLabels,
        showMoons: s.showMoons,
        showGrid: s.showGrid,
        showSoi: s.showSoi,
        showAsteroidBelt: s.showAsteroidBelt,
        showKuiperBelt: s.showKuiperBelt,
        showComets: s.showComets,
        showLagrange: s.showLagrange,
        sizeScale: s.sizeScale,
        helpDismissed: s.helpDismissed,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        syncClock(state);
      },
    },
  ),
);

syncClock(useSimStore.getState());

void persistKeys;
