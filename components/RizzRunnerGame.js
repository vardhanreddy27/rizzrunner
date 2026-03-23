'use client';

import {
  memo,
  useState,
  useEffect,
  useRef,
  useCallback,
  Suspense,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import Mychar from './Mychar';

useGLTF.preload('/FastRun.glb');

const SCROLL_UNITS_PER_SEC = 8.5;
const LERP_PER_SEC = 10;
const LANE_MIN = -5;
const LANE_MAX = 5;
const LANE_STEP = 2.5;

const TILE_LEN = 20;
const WRAP_MAX_Z = TILE_LEN;
const WRAP_RESET_Z = -3 * TILE_LEN;
const TILE_BASES = [-3 * TILE_LEN, -2 * TILE_LEN, -TILE_LEN, 0];

const CAM_POS = [0, 3.45, 11.2];
const CAM_FOV = 62;

const FINISH_DISTANCE = 260;

const ASPHALT = ['#2f3542', '#343b4a', '#2f3542', '#323948'];

const DASH_Y = (() => {
  const out = [];
  for (let y = -8.5; y <= 8.5; y += 2.65) out.push(y);
  return out;
})();

const ROAD_GEO = new THREE.PlaneGeometry(20, TILE_LEN + 0.16);
const EDGE_GEO = new THREE.PlaneGeometry(0.24, TILE_LEN + 0.16);
const DASH_GEO = new THREE.PlaneGeometry(0.52, 1.32);
const CAP_GEO = new THREE.CapsuleGeometry(0.32, 0.75, 5, 10);

const LINE_MAT = new THREE.MeshStandardMaterial({
  color: '#f1f5f9',
  roughness: 0.32,
  metalness: 0.08,
  emissive: '#e2e8f0',
  emissiveIntensity: 0.25,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const DASH_MAT = new THREE.MeshStandardMaterial({
  color: '#facc15',
  roughness: 0.4,
  metalness: 0.12,
  emissive: '#fde047',
  emissiveIntensity: 0.45,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const CURB_MAT = new THREE.MeshStandardMaterial({
  color: '#0f172a',
  roughness: 0.92,
  metalness: 0.15,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

const RAIL_MAT = new THREE.MeshStandardMaterial({
  color: '#64748b',
  roughness: 0.45,
  metalness: 0.55,
  emissive: '#94a3b8',
  emissiveIntensity: 0.08,
});

const OBSTACLE_MAT = new THREE.MeshStandardMaterial({
  color: '#b45309',
  roughness: 0.75,
  metalness: 0.15,
  emissive: '#f59e0b',
  emissiveIntensity: 0.12,
});

function RoadTile({ tileRef, z, tintIndex }) {
  return (
    <group ref={tileRef} position={[0, -0.5, z]}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={ROAD_GEO} receiveShadow>
          <meshStandardMaterial
            color={ASPHALT[tintIndex % 4]}
            roughness={0.9}
            metalness={0.18}
          />
        </mesh>
        <mesh geometry={EDGE_GEO} position={[-9.52, 0, 0.006]} material={CURB_MAT} />
        <mesh geometry={EDGE_GEO} position={[9.52, 0, 0.006]} material={CURB_MAT} />
        <mesh geometry={EDGE_GEO} position={[-9.82, 0, 0.01]} material={LINE_MAT} />
        <mesh geometry={EDGE_GEO} position={[9.82, 0, 0.01]} material={LINE_MAT} />
        {DASH_Y.map((y, i) => (
          <mesh
            key={i}
            geometry={DASH_GEO}
            position={[0, y, 0.014]}
            material={DASH_MAT}
          />
        ))}
      </group>
    </group>
  );
}

const Floor = memo(function Floor({ scrollRef, pausedRef }) {
  const a = useRef();
  const b = useRef();
  const c = useRef();
  const d = useRef();

  useFrame((_, delta) => {
    if (!a.current || !b.current || !c.current || !d.current) return;

    if (!pausedRef.current) {
      scrollRef.current += SCROLL_UNITS_PER_SEC * delta;
      const dz = SCROLL_UNITS_PER_SEC * delta;
      const tiles = [a.current, b.current, c.current, d.current];
      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        tile.position.z += dz;
        if (tile.position.z > WRAP_MAX_Z) {
          tile.position.z = WRAP_RESET_Z;
        }
      }
    }
  }, -1);

  return (
    <>
      <mesh position={[0, -0.52, -10]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[22, 140]} />
        <meshStandardMaterial color="#1f2735" roughness={0.96} metalness={0.04} />
      </mesh>
      <RoadTile tileRef={a} z={TILE_BASES[0]} tintIndex={0} />
      <RoadTile tileRef={b} z={TILE_BASES[1]} tintIndex={1} />
      <RoadTile tileRef={c} z={TILE_BASES[2]} tintIndex={2} />
      <RoadTile tileRef={d} z={TILE_BASES[3]} tintIndex={3} />
      <mesh position={[-10.1, 0.18, -8]} castShadow>
        <boxGeometry args={[0.35, 0.36, 120]} />
        <primitive object={RAIL_MAT} attach="material" />
      </mesh>
      <mesh position={[10.1, 0.18, -8]} castShadow>
        <boxGeometry args={[0.35, 0.36, 120]} />
        <primitive object={RAIL_MAT} attach="material" />
      </mesh>
    </>
  );
});

const GameCharacter = memo(function GameCharacter({ targetXRef, playerXRef }) {
  const groupRef = useRef();

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const t = targetXRef.current;
    const k = 1 - Math.exp(-LERP_PER_SEC * delta);
    g.position.x += (t - g.position.x) * k;
    playerXRef.current = g.position.x;
  });

  return (
    <group ref={groupRef} rotation={[0, Math.PI, 0]} scale={[0.008, 0.008, 0.008]}>
      <Mychar />
    </group>
  );
});

function CharacterFallback() {
  return (
    <group position={[0, 0.4, 0]}>
      <mesh geometry={CAP_GEO}>
        <meshStandardMaterial color="#f97316" roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  );
}

const OBSTACLES = [
  { x: -2.5, z0: -24, w: 1.3, h: 1.05, d: 1.1 },
  { x: 2.5, z0: -42, w: 1.2, h: 1.2, d: 1.0 },
  { x: 0, z0: -58, w: 1.5, h: 0.85, d: 1.4 },
  { x: -3.5, z0: -76, w: 1.0, h: 1.15, d: 0.95 },
  { x: 3, z0: -92, w: 1.25, h: 1.0, d: 1.15 },
];

function Obstacles({ scrollRef, playerXRef, blockedRef, pausedRef }) {
  const obsRefs = useRef([]);

  useFrame(() => {
    const phase = THREE.MathUtils.euclideanModulo(scrollRef.current, TILE_LEN * 4);

    let blocked = false;

    OBSTACLES.forEach((o, i) => {
      const m = obsRefs.current[i];
      if (!m) return;

      let z = o.z0 + phase;
      const dz = z;
      const dx = Math.abs(playerXRef.current - o.x);

      // Block slightly before overlap, and keep obstacle in front to avoid mesh mixing.
      if (dz > -2.2 && dz < 0.7 && dx < o.w * 0.5 + 0.7) {
        blocked = true;
        z = -1.65;
      }

      m.position.set(o.x, o.h / 2, z);
    });

    blockedRef.current = blocked;
    pausedRef.current = blockedRef.current;
  });

  return (
    <group>
      {OBSTACLES.map((o, i) => (
        <mesh key={`obs-${i}`} ref={(el) => (obsRefs.current[i] = el)} castShadow>
          <boxGeometry args={[o.w, o.h, o.d]} />
          <primitive object={OBSTACLE_MAT} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

function FinishSchool({ scrollRef, pausedRef, finished, setFinished }) {
  const groupRef = useRef();

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;

    const z = -FINISH_DISTANCE + scrollRef.current;
    g.position.z = z;

    if (!finished && z >= -2.4) {
      setFinished(true);
      pausedRef.current = true;
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, -FINISH_DISTANCE]}>
      <mesh position={[0, 1.75, 0]} castShadow>
        <boxGeometry args={[9.5, 3.5, 3.2]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.78} metalness={0.08} />
      </mesh>
      <mesh position={[0, 4.15, 0]} castShadow>
        <boxGeometry args={[10.4, 1.25, 3.5]} />
        <meshStandardMaterial color="#dc2626" roughness={0.7} metalness={0.08} />
      </mesh>
      <mesh position={[0, 1.05, 1.7]} castShadow>
        <boxGeometry args={[1.2, 2.1, 0.25]} />
        <meshStandardMaterial color="#7c2d12" roughness={0.8} metalness={0.05} />
      </mesh>
      <mesh position={[0, 4.95, 1.78]}>
        <planeGeometry args={[5.6, 0.9]} />
        <meshStandardMaterial color="#1e3a8a" emissive="#1d4ed8" emissiveIntensity={0.25} />
      </mesh>
      <group position={[-2.8, 1.85, 1.72]}>
        <mesh>
          <boxGeometry args={[0.95, 0.95, 0.2]} />
          <meshStandardMaterial color="#93c5fd" roughness={0.35} metalness={0.25} />
        </mesh>
      </group>
      <group position={[-1.4, 1.85, 1.72]}>
        <mesh>
          <boxGeometry args={[0.95, 0.95, 0.2]} />
          <meshStandardMaterial color="#93c5fd" roughness={0.35} metalness={0.25} />
        </mesh>
      </group>
      <group position={[1.4, 1.85, 1.72]}>
        <mesh>
          <boxGeometry args={[0.95, 0.95, 0.2]} />
          <meshStandardMaterial color="#93c5fd" roughness={0.35} metalness={0.25} />
        </mesh>
      </group>
      <group position={[2.8, 1.85, 1.72]}>
        <mesh>
          <boxGeometry args={[0.95, 0.95, 0.2]} />
          <meshStandardMaterial color="#93c5fd" roughness={0.35} metalness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

export default function RizzRunnerGame() {
  const [finished, setFinished] = useState(false);

  const targetXRef = useRef(0);
  const playerXRef = useRef(0);
  const blockedRef = useRef(false);
  const pausedRef = useRef(false);
  const scrollRef = useRef(0);
  const touchStartRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const blockScroll = (e) => e.preventDefault();
    el.addEventListener('touchmove', blockScroll, { passive: false });
    return () => el.removeEventListener('touchmove', blockScroll);
  }, []);

  useEffect(() => {
    pausedRef.current = finished;
  }, [finished]);

  const handleTouchStart = useCallback((e) => {
    if (finished) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    touchStartRef.current = x;
  }, [finished]);

  const handleTouchEnd = useCallback((e) => {
    if (touchStartRef.current == null || finished) return;

    const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const diff = x - touchStartRef.current;
    const swipeThreshold = 18;

    if (Math.abs(diff) > swipeThreshold) {
      if (diff < 0) {
        targetXRef.current = Math.max(targetXRef.current - LANE_STEP, LANE_MIN);
      } else {
        targetXRef.current = Math.min(targetXRef.current + LANE_STEP, LANE_MAX);
      }
    }

    touchStartRef.current = null;
  }, [finished]);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-0 flex min-h-dvh w-full touch-none flex-col bg-linear-to-b from-sky-300 to-sky-100 cursor-pointer select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
    >
      <Canvas
        className="block min-h-0 flex-1"
        camera={{
          position: CAM_POS,
          fov: CAM_FOV,
          near: 0.1,
          far: 200,
        }}
        style={{ width: '100%', height: '100%' }}
        onCreated={({ scene, camera }) => {
          camera.lookAt(0, -0.15, -18);
          scene.fog = new THREE.Fog('#7ba3c9', 18, 110);
        }}
        dpr={[1, 2]}
        gl={{
          powerPreference: 'default',
          antialias: true,
          alpha: false,
          stencil: false,
          depth: true,
          failIfMajorPerformanceCaveat: false,
        }}
      >
        <color attach="background" args={['#7ba3c9']} />
        <hemisphereLight color="#dbeafe" groundColor="#334155" intensity={1.1} />
        <ambientLight intensity={0.52} />
        <directionalLight
          position={[12, 16, 10]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight position={[-8, 8, 6]} intensity={0.4} color="#c7d2fe" />

        <Floor scrollRef={scrollRef} pausedRef={pausedRef} />
        <Obstacles
          scrollRef={scrollRef}
          playerXRef={playerXRef}
          blockedRef={blockedRef}
          pausedRef={pausedRef}
        />

        <FinishSchool
          scrollRef={scrollRef}
          pausedRef={pausedRef}
          finished={finished}
          setFinished={setFinished}
        />

        <Suspense fallback={<CharacterFallback />}>
          <GameCharacter targetXRef={targetXRef} playerXRef={playerXRef} />
        </Suspense>
      </Canvas>

      {finished && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="rounded-full border border-emerald-300/70 bg-emerald-950/80 px-5 py-2.5 text-sm font-bold text-emerald-100 shadow-lg backdrop-blur-md">
            Finish reached: School gate
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex justify-center p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="rounded-full bg-black/70 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-md">
          Swipe to change lane and avoid obstacles
        </div>
      </div>
    </div>
  );
}
