# Orrery

A live 3D map of the solar system. Planets and moons sit on real ephemerides, with NASA surface maps, the asteroid and Kuiper belts, comets, Lagrange points, size and distance scale, and time warp (steps run through 5,000,000× and beyond).

## View it

Once this is merged and GitHub Pages is set to deploy from GitHub Actions, open:

**https://candymanjl.github.io/solar_system/**

The app is built for that `/solar_system/` base path. Asset, texture, and router URLs all use it.

## Run locally

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5173/solar_system/

`npm run build` writes the static site to `dist/`. `npm run preview` serves that build at http://127.0.0.1:4173/solar_system/

Drag to look around, scroll to zoom, and use the bar at the bottom to play or change the time step. Space plays and pauses. `[` and `]` change warp. `1`–`9` focus the planets. `0` returns to the Sun.
