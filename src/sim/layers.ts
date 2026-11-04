import type { BodyDef } from "./bodies";

export type LayerFlags = {
  showSoi: boolean;
  showAsteroidBelt: boolean;
  showKuiperBelt: boolean;
  showComets: boolean;
  showLagrange: boolean;
};

export function isBodyEnabled(def: BodyDef, flags: LayerFlags): boolean {
  switch (def.layer) {
    case "asteroid":
      return flags.showAsteroidBelt;
    case "kuiper":
      return flags.showKuiperBelt;
    case "comet":
      return flags.showComets;
    case "lagrange":
      return flags.showLagrange;
    default:
      return true;
  }
}
