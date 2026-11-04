import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars, useTexture } from "@react-three/drei";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { BODIES, BODY_BY_ID, radiusAu, type BodyDef } from "@/sim/bodies";
import { clock, tickClock } from "@/sim/clock";
import { applyMapCam, computeOrbits, getBodyStates, mapCam, simFrame, soiRadiusAu, viewState, visualRadiusAu, zoomBy as zoomCamera } from "@/sim/ephemeris";
import { isBodyEnabled } from "@/sim/layers";
import { ASTEROID_GRAINS, grainScenePos, KUIPER_GRAINS } from "@/sim/belts";
import { useSimStore } from "@/sim/store";
import { getBodyTexture, getCircleSprite, getSaturnRingTexture } from "@/sim/textures";
import { EARTH_CLOUDS_URL, getNasaTexture } from "@/sim/nasaTextures";

const UP = new THREE.Vector3(0, 1, 0);
const _north = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _qB = new THREE.Quaternion();
const _tmp = new THREE.Vector3();
const _col = new THREE.Color();

const PRIORITY_MAPS = ["sun", "jupiter", "saturn", "earth", "mars", "venus", "mercury", "uranus", "neptune", "pluto"];
if (typeof window !== "undefined") {
  for (const id of PRIORITY_MAPS) {
    const spec = getNasaTexture(id);
    if (!spec) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = spec.url;
  }
}

function SimLoop() {
  useFrame((_, delta) => {
    // Time + ephemeris are owned by MapOverlay so the orrery
    // still runs if WebGL never composites. Only fill if empty.
    if (simFrame.states.size === 0) {
      tickClock(delta);
      simFrame.states = getBodyStates(clock.timeMs);
      simFrame.orbits = computeOrbits(simFrame.states, useSimStore.getState().showMoons);
    }
  }, -10);
  return null;
}

function CameraRig() {
  const { camera } = useThree();

  useFrame(() => {
    const { focusId } = useSimStore.getState();
    const st = simFrame.states.get(focusId);
    applyMapCam(focusId, st);
    camera.position.set(viewState.ex, viewState.ey, viewState.ez);
    camera.lookAt(viewState.tx, viewState.ty, viewState.tz);

    const dist = mapCam.r;
    camera.near = Math.max(dist / 900, 1e-8);
    const { showKuiperBelt, showComets } = useSimStore.getState();
    const minFar = showKuiperBelt || showComets ? 220 : 80;
    camera.far = Math.max(dist * 140, minFar);
    camera.updateProjectionMatrix();
  }, -5);
  return null;
}

function atmosphereMaterial(color: string) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
        gl_FragColor = vec4(uColor, f * 0.72);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function configureMap(tex: THREE.Texture, anisotropy = 8) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.max(1, anisotropy);
  tex.needsUpdate = true;
}

function NasaGlobeMaterial({ def, url }: { def: BodyDef; url: string }) {
  const { gl } = useThree();
  const tex = useTexture(url);
  useLayoutEffect(() => {
    configureMap(tex, gl.capabilities.getMaxAnisotropy());
  }, [tex, gl]);
  if (def.kind === "star") {
    return <meshBasicMaterial map={tex} color="#ffffff" toneMapped={false} />;
  }
  return <meshLambertMaterial map={tex} color="#ffffff" emissive="#0a0a0a" />;
}

function FallbackGlobeMaterial({ def }: { def: BodyDef }) {
  const tex = useMemo(() => getBodyTexture(def.texture, def.id), [def.id, def.texture]);
  if (def.kind === "star") {
    return <meshBasicMaterial map={tex} color="#ffffff" toneMapped={false} />;
  }
  return <meshLambertMaterial map={tex} color="#ffffff" emissive="#0a0a0a" />;
}

function EarthClouds({ radius }: { radius: number }) {
  const { gl } = useThree();
  const clouds = useTexture(EARTH_CLOUDS_URL);
  useLayoutEffect(() => {
    configureMap(clouds, gl.capabilities.getMaxAnisotropy());
  }, [clouds, gl]);
  return (
    <mesh>
      <sphereGeometry args={[radius * 1.008, 48, 48]} />
      <meshBasicMaterial
        map={clouds}
        transparent
        opacity={0.55}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

function EarthCloudsGated({ radius }: { radius: number }) {
  const [on, setOn] = useState(false);
  useFrame(() => {
    const s = useSimStore.getState();
    const need = s.focusId === "earth" || s.selectedId === "earth" || mapCam.r < 0.08;
    if (need !== on) setOn(need);
  });
  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <EarthClouds radius={radius} />
    </Suspense>
  );
}

function Deferred({ after = 3, children }: { after?: number; children: ReactNode }) {
  const [on, setOn] = useState(false);
  const frames = useRef(0);
  useFrame(() => {
    if (on) return;
    frames.current += 1;
    if (frames.current >= after) setOn(true);
  });
  return on ? <>{children}</> : null;
}

function BodyNode({ def }: { def: BodyDef }) {
  const group = useRef<THREE.Group>(null);
  const hit = useRef<THREE.Mesh>(null);
  const nasa = getNasaTexture(def.id, def.texture);
  const atmo = useMemo(
    () => (def.atmosphere ? atmosphereMaterial(def.atmosphere) : null),
    [def.atmosphere],
  );
  const ringMap = useMemo(() => (def.rings ? getSaturnRingTexture() : null), [def.rings]);
  const trueR = radiusAu(def);
  const polar = 1 - def.flatten;

  useEffect(() => () => atmo?.dispose(), [atmo]);

  useFrame(({ camera }) => {
    const st = simFrame.states.get(def.id);
    const g = group.current;
    if (!st || !g) return;
    const { sizeScale, showMoons, focusId } = useSimStore.getState();
    if (!isBodyEnabled(def, useSimStore.getState())) {
      g.visible = false;
      return;
    }
    if (def.kind === "moon" && !showMoons && focusId !== def.id) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(st.x, st.y, st.z);
    _north.set(st.nx, st.ny, st.nz).normalize();
    _qA.setFromUnitVectors(UP, _north);
    _qB.setFromAxisAngle(_north, st.spin);
    g.quaternion.copy(_qB).multiply(_qA);

    const dist = camera.position.distanceTo(g.position);
    let vis = visualRadiusAu(def, sizeScale, dist);
    if (def.kind === "moon" && def.parentId) {
      const parent = BODY_BY_ID[def.parentId];
      const parentSt = parent ? simFrame.states.get(parent.id) : undefined;
      if (parent && parentSt) {
        const parentDist = camera.position.distanceTo(_tmp.set(parentSt.x, parentSt.y, parentSt.z));
        const parentVis = visualRadiusAu(parent, sizeScale, parentDist);
        const sep = Math.hypot(st.x - parentSt.x, st.y - parentSt.y, st.z - parentSt.z);
        if (focusId !== def.id && sep < parentVis * 1.08) {
          g.visible = false;
          return;
        }
        if (focusId !== def.id) vis = Math.min(vis, parentVis * 0.42);
      }
    }
    vis = Math.min(vis, Math.max(trueR, dist * 0.36));
    const scale = vis / trueR;
    g.scale.set(scale, scale * polar, scale);

    if (hit.current) {
      const hitR = Math.max(vis * 1.3, dist * 0.012);
      const hs = hitR / vis;
      hit.current.scale.setScalar(hs);
    }
  });

  const segs = def.kind === "moon" ? 48 : def.kind === "star" ? 64 : 96;

  if (def.kind === "lagrange") {
    return (
      <group ref={group}>
        <mesh name={def.id} renderOrder={4}>
          <octahedronGeometry args={[trueR * 4, 0]} />
          <meshBasicMaterial
            color={def.color}
            wireframe
            transparent
            opacity={0.95}
            toneMapped={false}
            depthTest={false}
          />
        </mesh>
        <mesh
          ref={hit}
          visible={false}
          onClick={(e) => {
            e.stopPropagation();
            useSimStore.getState().setFocus(def.id);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            document.body.style.cursor = "default";
          }}
        >
          <sphereGeometry args={[trueR, 8, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={group}>
      <mesh name={def.id}>
        <sphereGeometry args={[trueR, segs, segs]} />
        {nasa ? <NasaGlobeMaterial def={def} url={nasa.url} /> : <FallbackGlobeMaterial def={def} />}
      </mesh>
      {def.id === "earth" ? <EarthCloudsGated radius={trueR} /> : null}
      {atmo ? (
        <mesh>
          <sphereGeometry args={[trueR * (def.kind === "planet" ? 1.12 : 1.08), 48, 32]} />
          <primitive attach="material" object={atmo} />
        </mesh>
      ) : null}
      {def.rings && ringMap ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <ringGeometry args={[trueR * def.rings.inner, trueR * def.rings.outer, 192, 8]} />
          <meshBasicMaterial
            map={ringMap}
            transparent
            side={THREE.DoubleSide}
            depthWrite
            alphaTest={0.04}
            toneMapped={false}
          />
        </mesh>
      ) : null}
      {def.kind === "star" ? (
        <mesh>
          <sphereGeometry args={[trueR * 1.35, 24, 24]} />
          <meshBasicMaterial color="#ffb347" transparent opacity={0.18} depthWrite={false} toneMapped={false} />
        </mesh>
      ) : null}
      <mesh
        ref={hit}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          useSimStore.getState().setFocus(def.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          document.body.style.cursor = "default";
        }}
      >
        <sphereGeometry args={[trueR, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function SunLight() {
  return (
    <>
      <pointLight position={[0, 0, 0]} intensity={2.8} distance={0} decay={0} color="#fff6e0" />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#c5d0e0", "#2a2018", 0.35]} />
    </>
  );
}

function OrbitLines() {
  const group = useRef<THREE.Group>(null);
  const lines = useRef<Map<string, THREE.Line>>(new Map());

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    for (const def of BODIES) {
      if (def.kind === "star") continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(257 * 3), 3));
      const mat = new THREE.LineBasicMaterial({
        color: def.orbitColor,
        transparent: true,
        opacity: def.kind === "moon" ? 0.4 : 0.85,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      g.add(line);
      lines.current.set(def.id, line);
    }
    return () => {
      for (const line of lines.current.values()) {
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        g.remove(line);
      }
      lines.current.clear();
    };
  }, []);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const { showOrbits, showMoons, focusId } = useSimStore.getState();
    g.visible = showOrbits;
    if (!showOrbits) return;
    const flags = useSimStore.getState();
    const byId = new Map(simFrame.orbits.map((o) => [o.id, o]));
    for (const [id, line] of lines.current) {
      const def = BODY_BY_ID[id];
      const sample = byId.get(id);
      const hideMoon = def?.kind === "moon" && !showMoons && focusId !== id && focusId !== def.parentId;
      const hideLayer = def ? !isBodyEnabled(def, flags) : true;
      line.visible = Boolean(sample) && !hideMoon && !hideLayer;
      if (!sample || !line.visible) continue;
      const attr = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      const src = sample.points;
      const dst = attr.array as Float32Array;
      const n = Math.min(src.length, dst.length);
      dst.set(src.subarray(0, n));
      attr.needsUpdate = true;
      line.geometry.setDrawRange(0, n / 3);
    }
  });

  return <group ref={group} />;
}

function AuGrid() {
  const group = useRef<THREE.Group>(null);

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const radii = [1, 5, 10, 20, 30, 40];
    const mat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
    });
    const created: THREE.Line[] = [];
    for (const r of radii) {
      const pts = new Float32Array(97 * 3);
      for (let i = 0; i <= 96; i++) {
        const t = (i / 96) * Math.PI * 2;
        pts[i * 3] = Math.cos(t) * r;
        pts[i * 3 + 1] = 0;
        pts[i * 3 + 2] = Math.sin(t) * r;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
      const ln = new THREE.Line(geo, mat);
      ln.frustumCulled = false;
      g.add(ln);
      created.push(ln);
    }
    return () => {
      for (const ln of created) {
        ln.geometry.dispose();
        g.remove(ln);
      }
      mat.dispose();
    };
  }, []);

  useFrame(() => {
    if (group.current) group.current.visible = useSimStore.getState().showGrid;
  });

  return <group ref={group} />;
}

function Markers() {
  const n = BODIES.length;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n), 1));
    return g;
  }, [n]);
  const mat = useMemo(() => {
    const sprite = getCircleSprite();
    return new THREE.ShaderMaterial({
      uniforms: { uMap: { value: sprite } },
      vertexShader: `
        attribute float aSize;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize;
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          if (t.a < 0.12) discard;
          gl_FragColor = vec4(vColor, t.a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  useFrame(({ camera, size }) => {
    const { showMoons, focusId, selectedId, sizeScale } = useSimStore.getState();
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const col = geo.getAttribute("color") as THREE.BufferAttribute;
    const sz = geo.getAttribute("aSize") as THREE.BufferAttribute;
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const px = size.height / (2 * Math.tan(fov / 2));
    let i = 0;
    for (const def of BODIES) {
      const st = simFrame.states.get(def.id);
      const hide =
        !isBodyEnabled(def, useSimStore.getState()) ||
        (def.kind === "moon" && !showMoons && focusId !== def.id && selectedId !== def.id) ||
        (def.kind === "lagrange" &&
          def.id.startsWith("eml") &&
          mapCam.r > 0.08 &&
          focusId !== def.id &&
          !focusId.startsWith("eml") &&
          focusId !== "earth" &&
          focusId !== "moon");
      if (!st || hide) {
        pos.setXYZ(i, 0, 0, 0);
        sz.setX(i, 0);
        i++;
        continue;
      }
      pos.setXYZ(i, st.x, st.y, st.z);
      _col.set(def.color);
      col.setXYZ(i, _col.r, _col.g, _col.b);
      _tmp.set(st.x, st.y, st.z);
      const dist = camera.position.distanceTo(_tmp);
      const vis = visualRadiusAu(def, sizeScale, dist);
      const pix = (vis / Math.max(dist, 1e-8)) * px;
      const focused = def.id === focusId || def.id === selectedId;
      if (pix > (focused ? 16 : 10)) {
        sz.setX(i, 0);
      } else {
        const base = def.kind === "star" ? 16 : def.kind === "moon" ? 5 : 8;
        sz.setX(i, focused ? base + 5 : base);
      }
      i++;
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    sz.needsUpdate = true;
  });

  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

function BeltCloud({ kind }: { kind: "asteroid" | "kuiper" }) {
  const grains = kind === "asteroid" ? ASTEROID_GRAINS : KUIPER_GRAINS;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(grains.length * 3);
    const t = clock.timeMs;
    for (let i = 0; i < grains.length; i++) grainScenePos(grains[i]!, t, arr, i * 3);
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [grains]);
  const mat = useMemo(
    () =>
      new THREE.PointsMaterial({
        color: kind === "asteroid" ? "#c4b59a" : "#9aadc2",
        size: kind === "asteroid" ? 1.6 : 1.35,
        sizeAttenuation: false,
        transparent: true,
        opacity: kind === "asteroid" ? 0.55 : 0.45,
        depthWrite: false,
      }),
    [kind],
  );

  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );

  const tick = useRef(0);
  useFrame(() => {
    const on = kind === "asteroid" ? useSimStore.getState().showAsteroidBelt : useSimStore.getState().showKuiperBelt;
    const pts = geo.getAttribute("position") as THREE.BufferAttribute;
    if (!on) {
      if (pts.array[0] !== 0) {
        (pts.array as Float32Array).fill(0);
        pts.needsUpdate = true;
      }
      return;
    }
    tick.current += 1;
    const warp = Math.abs(clock.warp);
    const interval = kind === "kuiper" ? (warp > 10_000 ? 1 : 5) : warp > 10_000 ? 1 : 3;
    if (tick.current % interval !== 0) return;
    const arr = pts.array as Float32Array;
    const t = clock.timeMs;
    for (let i = 0; i < grains.length; i++) grainScenePos(grains[i]!, t, arr, i * 3);
    pts.needsUpdate = true;
  });

  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

function SoiShells() {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<Map<string, THREE.Mesh>>(new Map());

  useEffect(() => {
    const g = group.current;
    if (!g) return;
    const ids = ["mercury", "venus", "earth", "moon", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto"];
    const geo = new THREE.SphereGeometry(1, 32, 20);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9aadc2,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const wire = new THREE.MeshBasicMaterial({
      color: 0x9aadc2,
      transparent: true,
      opacity: 0.32,
      wireframe: true,
      depthWrite: false,
    });
    for (const id of ids) {
      const m = new THREE.Mesh(geo, wire);
      const fill = new THREE.Mesh(geo, mat);
      m.add(fill);
      m.frustumCulled = false;
      g.add(m);
      meshes.current.set(id, m);
    }
    return () => {
      for (const m of meshes.current.values()) g.remove(m);
      meshes.current.clear();
      geo.dispose();
      mat.dispose();
      wire.dispose();
    };
  }, []);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const { showSoi, showMoons, focusId } = useSimStore.getState();
    g.visible = showSoi;
    if (!showSoi) return;
    for (const [id, mesh] of meshes.current) {
      const st = simFrame.states.get(id);
      const r = st ? soiRadiusAu(id, simFrame.states) : null;
      const hideMoon = id === "moon" && !showMoons && focusId !== "moon" && focusId !== "earth";
      if (!st || r == null || r <= 0 || hideMoon) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(st.x, st.y, st.z);
      mesh.scale.setScalar(r);
    }
  });

  return <group ref={group} />;
}

function Probe() {
  useEffect(() => {
    const w = window as Window & {
      __orrery?: {
        getTime: () => number;
        getFocus: () => string;
        getPlaying: () => boolean;
        getWarp: () => number;
        getCamR: () => number;
        getCamTheta: () => number;
        orbitBy: (dTheta: number, dPhi?: number) => number;
        zoomBy: (factor: number) => number;
        getBody: (id: string) => { x: number; y: number; z: number } | null;
      };
    };
    w.__orrery = {
      getTime: () => clock.timeMs,
      getFocus: () => useSimStore.getState().focusId,
      getPlaying: () => useSimStore.getState().playing,
      getWarp: () => clock.warp,
      getCamR: () => mapCam.r,
      getCamTheta: () => mapCam.theta,
      orbitBy: (dTheta: number, dPhi = 0) => {
        mapCam.theta += dTheta;
        mapCam.phi = Math.min(Math.max(mapCam.phi + dPhi, 0.08), Math.PI - 0.08);
        return mapCam.theta;
      },
      zoomBy: (factor: number) => {
        zoomCamera(factor);
        return mapCam.r;
      },
      getBody: (id: string) => {
        const s = simFrame.states.get(id);
        return s ? { x: s.x, y: s.y, z: s.z } : null;
      },
    };
    return () => {
      delete w.__orrery;
    };
  }, []);
  return null;
}

function moonShouldDraw(def: BodyDef, s: ReturnType<typeof useSimStore.getState>) {
  if (s.focusId === def.id || s.focusId === def.parentId) return true;
  if (!s.showMoons || !def.parentId) return false;
  const parent = simFrame.states.get(def.parentId);
  if (!parent) return false;
  const d = Math.hypot(viewState.ex - parent.x, viewState.ey - parent.y, viewState.ez - parent.z);
  return d < 0.28;
}

function GatedBody({ def }: { def: BodyDef }) {
  const eager = def.kind !== "moon";
  const [on, setOn] = useState(eager);
  useFrame(() => {
    if (eager) return;
    const s = useSimStore.getState();
    const need = isBodyEnabled(def, s) && moonShouldDraw(def, s);
    if (need !== on) setOn(need);
  });
  if (!on) return null;
  return (
    <Suspense fallback={null}>
      <BodyNode def={def} />
    </Suspense>
  );
}

function Scene() {
  return (
    <>
      <color attach="background" args={["#07080c"]} />
      <SimLoop />
      <CameraRig />
      <SunLight />
      <Deferred after={8}>
        <Stars radius={400} depth={60} count={2800} factor={5.5} saturation={0} fade speed={0} />
      </Deferred>
      <AuGrid />
      <Deferred after={4}>
        <SoiShells />
      </Deferred>
      <Deferred after={5}>
        <BeltCloud kind="asteroid" />
      </Deferred>
      <Deferred after={8}>
        <BeltCloud kind="kuiper" />
      </Deferred>
      <OrbitLines />
      {BODIES.map((def) => (
        <GatedBody key={def.id} def={def} />
      ))}
      <Markers />
      <Probe />
    </>
  );
}

export default function SolarCanvas() {
  return (
    <Canvas
      flat
      camera={{ position: [0, 16, 36], fov: 48, near: 0.0001, far: 4000 }}
      dpr={[1, 1.75]}
      gl={{
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: "default",
        failIfMajorPerformanceCaveat: false,
      }}
      style={{ touchAction: "none", width: "100%", height: "100%", background: "#07080c" }}
      onCreated={({ gl }) => {
        gl.setClearColor("#07080c", 1);
      }}
      onPointerMissed={() => {
        document.body.style.cursor = "default";
      }}
    >
      <Scene />
    </Canvas>
  );
}
