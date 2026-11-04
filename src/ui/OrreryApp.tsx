import { useEffect, useState, type ComponentType } from "react";
import { Hud, useHotkeys } from "./Hud";

/** Kick the WebGL chunk immediately (client only) so it doesn't wait for the first paint. */
const canvasPromise = typeof window === "undefined" ? null : import("@/scene/SolarCanvas");

export function OrreryApp() {
  const [Canvas, setCanvas] = useState<ComponentType | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  useHotkeys();

  useEffect(() => {
    if (!canvasPromise) return;
    let alive = true;
    canvasPromise
      .then((m) => {
        if (alive) setCanvas(() => m.default);
      })
      .catch(() => {
        if (alive) setWebglFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-bg text-fg">
      <h1 className="sr-only">Orrery — live solar system map</h1>
      {Canvas ? (
        <div className="absolute inset-0">
          <Canvas />
        </div>
      ) : null}
      <Hud use3d={!webglFailed} canvasReady={Boolean(Canvas)} />
    </main>
  );
}
