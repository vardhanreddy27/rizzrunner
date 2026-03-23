'use client';

import {
  memo,
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Mychar from '../components/Mychar';

/** World scroll: +Z = ground flows toward camera; character runs forward (−Z) with Y rotation π */
const SCROLL_UNITS_PER_SEC = 9;
const LERP_PER_SEC = 14;
const LANE_MIN = -12;
const LANE_MAX = 12;
const LANE_STEP = 5;
const TILE_SPACING = 20;
const TILE_WRAP = 40;

const floorColors = ['#1a1a2e', '#2a2a3e', '#1a1a2e'];

const Floor = memo(function Floor({ isQuizTime }) {
  const a = useRef();
  const b = useRef();
  const c = useRef();
  const geo = useMemo(() => new THREE.PlaneGeometry(20, 20), []);

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

  const positions = useMemo(
    () => [
      [0, -0.5, 0],
      [0, -0.5, TILE_SPACING],
      [0, -0.5, -TILE_SPACING],
    ],
    []
  );

  return (
    <>
      {[a, b, c].map((ref, i) => (
        <mesh
          key={i}
          ref={ref}
          geometry={geo}
          position={positions[i]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <meshBasicMaterial color={floorColors[i]} />
        </mesh>
      ))}
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

export default function GamePage() {
  const [isQuizTime, setIsQuizTime] = useState(false);
  const [timeLeft, setTimeLeft] = useState(7);
  const targetXRef = useRef(0);
  const touchStartRef = useRef(null);

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

  const handleTouchStart = useCallback((e) => {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    touchStartRef.current = x;
  }, []);

  const handleTouchEnd = useCallback(
    (e) => {
      if (touchStartRef.current == null || isQuizTime) return;
      const x = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const diff = x - touchStartRef.current;
      const swipeThreshold = 20; // Minimum swipe distance - lowered for sensitivity

      if (Math.abs(diff) > swipeThreshold) {
        if (diff < 0) {
          // Swipe left → move left (−X)
          targetXRef.current = Math.max(
            targetXRef.current - LANE_STEP,
            LANE_MIN
          );
        } else {
          // Swipe right → move right (+X)
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
      className="w-full h-screen bg-gradient-to-b from-sky-300 to-sky-100 relative cursor-pointer select-none"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
    >
      <Canvas
        camera={{ position: [0, 3, 8], fov: 75 }}
        style={{ width: '100%', height: '100%' }}
        dpr={[1, 1.75]}
        gl={{
          powerPreference: 'high-performance',
          antialias: true,
          alpha: false,
          stencil: false,
          depth: true,
        }}
      >
        <hemisphereLight color="#87ceeb" groundColor="#334155" intensity={0.85} />
        <directionalLight position={[8, 10, 6]} intensity={1.1} />

        <Floor isQuizTime={isQuizTime} />
        <GameCharacter targetXRef={targetXRef} />
      </Canvas>

      {!isQuizTime && (
        <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-md rounded-full shadow-lg px-6 py-3 z-10 border-2 border-purple-500">
          <p className="text-gray-900 font-black text-lg">⏱️ {timeLeft}s</p>
        </div>
      )}

      {isQuizTime && <QuizOverlay onAnswer={handleQuizAnswer} />}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md text-white rounded-full px-6 py-3 z-10 font-bold text-sm">
        👈 Swipe left · Swipe right 👉
      </div>
    </div>
  );
}
