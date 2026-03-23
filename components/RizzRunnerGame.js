'use client';

import {
  memo,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  Suspense,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import Mychar from './Mychar';

/** World scroll: +Z = ground flows toward camera; character runs forward (−Z) with Y rotation π */
const SCROLL_UNITS_PER_SEC = 9;
const LERP_PER_SEC = 14;
const LANE_MIN = -12;
const LANE_MAX = 12;
const LANE_STEP = 5;
const TILE_SPACING = 20;
const TILE_WRAP = 40;

const ASPHALT_TINT = ['#4a5568', '#3f4a5c', '#4a5568'];

const DASH_Y = (() => {
  const out = [];
  for (let y = -8.5; y <= 8.5; y += 2.65) out.push(y);
  return out;
})();

const ROAD_GEO = new THREE.PlaneGeometry(20, 20);
const EDGE_GEO = new THREE.PlaneGeometry(0.22, 20);
const DASH_GEO = new THREE.PlaneGeometry(0.55, 1.35);

const LINE_MAT = new THREE.MeshStandardMaterial({
  color: '#f8fafc',
  roughness: 0.35,
  metalness: 0.05,
  emissive: '#e8eef8',
  emissiveIntensity: 0.4,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const DASH_MAT = new THREE.MeshStandardMaterial({
  color: '#fbbf24',
  roughness: 0.45,
  metalness: 0.1,
  emissive: '#fcd34d',
  emissiveIntensity: 0.6,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

const CURB_MAT = new THREE.MeshStandardMaterial({
  color: '#1e293b',
  roughness: 0.95,
  metalness: 0.02,
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

function RoadTile({ tileRef, baseZ, tintIndex }) {
  return (
    <group ref={tileRef} position={[0, -0.5, baseZ]}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={ROAD_GEO}>
          <meshStandardMaterial
            color={ASPHALT_TINT[tintIndex % 3]}
            roughness={0.88}
            metalness={0.12}
          />
        </mesh>
        <mesh geometry={EDGE_GEO} position={[-9.55, 0, 0.004]} material={CURB_MAT} />
        <mesh geometry={EDGE_GEO} position={[9.55, 0, 0.004]} material={CURB_MAT} />
        <mesh geometry={EDGE_GEO} position={[-9.82, 0, 0.008]} material={LINE_MAT} />
        <mesh geometry={EDGE_GEO} position={[9.82, 0, 0.008]} material={LINE_MAT} />
        {DASH_Y.map((y, i) => (
          <mesh
            key={i}
            geometry={DASH_GEO}
            position={[0, y, 0.012]}
            material={DASH_MAT}
          />
        ))}
      </group>
    </group>
  );
}

const Floor = memo(function Floor({ isQuizTime }) {
  const a = useRef();
  const b = useRef();
  const c = useRef();

  useFrame((_, delta) => {
    if (isQuizTime) return;
    const refs = [a, b, c];
    if (!refs.every((r) => r.current)) return;
    const move = SCROLL_UNITS_PER_SEC * delta;
    for (const r of refs) {
      r.current.position.z += move;
      if (r.current.position.z > TILE_WRAP) {
        r.current.position.z = -TILE_WRAP;
      }
    }
  });

  const bases = useMemo(
    () => [0, TILE_SPACING, -TILE_SPACING],
    []
  );

  return (
    <>
      <RoadTile tileRef={a} baseZ={bases[0]} tintIndex={0} />
      <RoadTile tileRef={b} baseZ={bases[1]} tintIndex={1} />
      <RoadTile tileRef={c} baseZ={bases[2]} tintIndex={2} />
    </>
  );
});

const GameCharacter = memo(function GameCharacter({ targetXRef }) {
  const groupRef = useRef();

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const t = targetXRef.current;
    const k = 1 - Math.exp(-LERP_PER_SEC * delta);
    g.position.x += (t - g.position.x) * k;
  });

  return (
    <group
      ref={groupRef}
      rotation={[0, Math.PI, 0]}
      scale={[0.008, 0.008, 0.008]}
    >
      <Mychar />
    </group>
  );
});

/** Simple placeholder while GLB streams (large file on mobile networks) */
function CharacterFallback() {
  return (
    <group position={[0, 0.4, 0]}>
      <mesh>
        <capsuleGeometry args={[0.35, 0.9, 6, 12]} />
        <meshStandardMaterial color="#f97316" roughness={0.6} metalness={0.1} />
      </mesh>
    </group>
  );
}

const QuizOverlay = memo(function QuizOverlay({ onAnswer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
          Quiz checkpoint
        </p>
        <h2 className="mt-3 text-center text-2xl font-bold text-white sm:text-3xl">
          What is the capital of Rizz?
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Tap an answer to continue your run.
        </p>
        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { label: 'Paris', ring: 'ring-rose-500/30 hover:bg-rose-500/10' },
            { label: 'Charm', ring: 'ring-emerald-500/30 hover:bg-emerald-500/10' },
            { label: 'Vibe', ring: 'ring-sky-500/30 hover:bg-sky-500/10' },
            { label: 'Swag', ring: 'ring-amber-500/30 hover:bg-amber-500/10' },
          ].map(({ label, ring }) => (
            <button
              key={label}
              type="button"
              onClick={onAnswer}
              className={`rounded-xl border border-white/10 bg-slate-800/80 px-4 py-4 text-left text-base font-semibold text-white ring-1 ${ring}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

function AssetLoadingHud() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div className="absolute inset-x-0 bottom-28 flex justify-center px-6">
        <div className="w-full max-w-xs rounded-full bg-black/40 px-3 py-2 text-center text-xs font-semibold text-white backdrop-blur-sm">
          Loading character… {Math.round(progress)}%
        </div>
      </div>
    </Html>
  );
}

export default function RizzRunnerGame() {
  const [isQuizTime, setIsQuizTime] = useState(false);
  const [timeLeft, setTimeLeft] = useState(7);
  const targetXRef = useRef(0);
  const touchStartRef = useRef(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (isQuizTime) return;
    setTimeLeft(7);
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          setIsQuizTime(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isQuizTime]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const blockScroll = (e) => e.preventDefault();
    el.addEventListener('touchmove', blockScroll, { passive: false });
    return () => el.removeEventListener('touchmove', blockScroll);
  }, []);

  const handleTouchStart = useCallback((e) => {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    touchStartRef.current = x;
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      if (touchStartRef.current == null || isQuizTime) return;
      const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const diff = x - touchStartRef.current;
      const swipeThreshold = 20;

      if (Math.abs(diff) > swipeThreshold) {
        if (diff < 0) {
          targetXRef.current = Math.max(
            targetXRef.current - LANE_STEP,
            LANE_MIN
          );
        } else {
          targetXRef.current = Math.min(
            targetXRef.current + LANE_STEP,
            LANE_MAX
          );
        }
      }

      touchStartRef.current = null;
    },
    [isQuizTime]
  );

  const handleQuizAnswer = useCallback(() => {
    setIsQuizTime(false);
  }, []);

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-0 flex min-h-[100dvh] w-full touch-none flex-col bg-gradient-to-b from-sky-300 to-sky-100 cursor-pointer select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
    >
      <Canvas
        className="block min-h-0 flex-1"
        camera={{ position: [0, 3, 8], fov: 75 }}
        style={{ width: '100%', height: '100%' }}
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
        <color attach="background" args={['#94b8dc']} />
        <hemisphereLight color="#cfe8ff" groundColor="#475569" intensity={1.05} />
        <ambientLight intensity={0.42} />
        <directionalLight position={[10, 14, 8]} intensity={1.35} />
        <directionalLight position={[-6, 6, 4]} intensity={0.35} color="#e0e7ff" />

        <Floor isQuizTime={isQuizTime} />
        <Suspense fallback={<CharacterFallback />}>
          <GameCharacter targetXRef={targetXRef} />
        </Suspense>
        <AssetLoadingHud />
      </Canvas>

      {!isQuizTime && (
        <div className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-start p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="rounded-full border-2 border-purple-500 bg-white/90 px-5 py-2.5 shadow-lg backdrop-blur-md">
            <p className="text-lg font-black text-gray-900">⏱️ {timeLeft}s</p>
          </div>
        </div>
      )}

      {isQuizTime && <QuizOverlay onAnswer={handleQuizAnswer} />}

      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-10 flex justify-center p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="rounded-full bg-black/70 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-md">
          👈 Swipe left · Swipe right 👉
        </div>
      </div>
    </div>
  );
}
