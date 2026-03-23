'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, PerspectiveCamera } from '@react-three/drei';
import { CanvasTexture, MathUtils, RepeatWrapping, SRGBColorSpace } from 'three';
import Mychar from '../components/Mychar';

// Teacher-friendly quiz bank: edit/add questions here.
const questionBank = [
  {
    question: 'What is 2 + 2?',
    options: ['3', '4', '5', '6'],
    correctAnswer: '4',
  },
  {
    question: 'Which shape has 4 equal sides?',
    options: ['Triangle', 'Square', 'Circle', 'Oval'],
    correctAnswer: 'Square',
  },
  {
    question: '5 x 3 = ?',
    options: ['8', '10', '15', '20'],
    correctAnswer: '15',
  },
];

const LANE_X = [-2, 0, 2];
const RUNNER_Z = 2;
const BASE_GAME_SPEED = 5;

function createRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 2048;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#2d2f36';
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.fillStyle = '#393b43';
  for (let y = 0; y < c.height; y += 80) {
    ctx.fillRect(0, y, c.width, 2);
  }

  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(1, 20);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function createDashTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 1024;
  const ctx = c.getContext('2d');

  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#facc15';
  for (let y = 0; y < c.height; y += 86) {
    ctx.fillRect(24, y, 16, 46);
  }

  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(1, 20);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function RunnerScene({
  currentLane,
  gameSpeed,
  energy,
  setEnergy,
  distance,
  setDistance,
  obstacles,
  setObstacles,
  coins,
  setCoins,
  setScore,
  setIsQuizOpen,
  setIsBlocked,
}) {
  const playerRef = useRef(null);
  const playerXRef = useRef(LANE_X[currentLane]);
  const blockedRef = useRef(false);

  const roadTexture = useMemo(() => createRoadTexture(), []);
  const dashTexture = useMemo(() => createDashTexture(), []);

  const laneRef = useRef(currentLane);
  const gameSpeedRef = useRef(gameSpeed);
  const energyRef = useRef(energy);
  const distanceRef = useRef(distance);

  const obstacleSpawnTimerRef = useRef(0);
  const coinSpawnTimerRef = useRef(0);

  useEffect(() => {
    laneRef.current = currentLane;
  }, [currentLane]);

  useEffect(() => {
    gameSpeedRef.current = gameSpeed;
  }, [gameSpeed]);

  useEffect(() => {
    energyRef.current = energy;
  }, [energy]);

  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);

  useFrame((_, delta) => {
    const targetX = LANE_X[laneRef.current];
    playerXRef.current = MathUtils.lerp(playerXRef.current, targetX, 0.18);
    if (playerRef.current) {
      playerRef.current.position.x = playerXRef.current;
    }

    // Always recalc collision against existing obstacles so lane switch can un-block even when speed is 0.
    let blockedNow = false;
    for (let i = 0; i < obstacles.length; i += 1) {
      const ox = LANE_X[obstacles[i].lane];
      const oz = obstacles[i].position;
      const distToObstacle = Math.hypot(playerXRef.current - ox, RUNNER_Z - oz);
      if (distToObstacle < 0.8) {
        blockedNow = true;
        break;
      }
    }

    if (blockedNow !== blockedRef.current) {
      blockedRef.current = blockedNow;
      setIsBlocked(blockedNow);
    }

    const speed = gameSpeedRef.current;
    if (speed <= 0) {
      return;
    }

    roadTexture.offset.y += speed * delta * 0.45;
    dashTexture.offset.y += speed * delta;

    const nextEnergy = Math.max(0, energyRef.current - delta * 1);
    energyRef.current = nextEnergy;
    setEnergy(nextEnergy);

    const nextDistance = distanceRef.current + speed * delta;
    distanceRef.current = nextDistance;
    setDistance(nextDistance);

    if (nextEnergy <= 0) {
      setEnergy(0);
      setIsQuizOpen(true);
      return;
    }

    obstacleSpawnTimerRef.current += delta;
    if (obstacleSpawnTimerRef.current >= 0.8) {
      obstacleSpawnTimerRef.current = 0;
      const lane = Math.floor(Math.random() * 3);
      setObstacles((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          lane,
          position: -20,
        },
      ]);
    }

    coinSpawnTimerRef.current += delta;
    if (coinSpawnTimerRef.current >= 0.65) {
      coinSpawnTimerRef.current = 0;
      // Prefer lanes without near-spawn obstacles so coins appear on a clean path.
      const safeLanes = [0, 1, 2].filter((lane) =>
        !obstacles.some((o) => o.lane === lane && o.position >= -24 && o.position <= -14)
      );
      const lanePool = safeLanes.length > 0 ? safeLanes : [0, 1, 2];
      const lane = lanePool[Math.floor(Math.random() * lanePool.length)];
      setCoins((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          lane,
          position: -22,
        },
      ]);
    }

    setObstacles((prev) => {
      const moved = prev
        .map((o) => ({ ...o, position: o.position + speed * delta }))
        .filter((o) => o.position <= 6);

      return moved;
    });

    setCoins((prev) => {
      let gained = 0;
      const moved = [];

      for (let i = 0; i < prev.length; i += 1) {
        const c = { ...prev[i], position: prev[i].position + speed * delta };
        if (c.position > 6) {
          continue;
        }

        const cx = LANE_X[c.lane];
        const distToCoin = Math.hypot(playerXRef.current - cx, RUNNER_Z - c.position);
        if (distToCoin < 0.8) {
          gained += 5;
        } else {
          moved.push(c);
        }
      }

      if (gained > 0) {
        setScore((s) => s + gained);
      }

      return moved;
    });
  });

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 3, 8]} fov={50} />

      <Environment preset="forest" />
      <ambientLight intensity={0.58} />
      <directionalLight
        position={[8, 10, 7]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -20]} receiveShadow>
        <planeGeometry args={[6, 50]} />
        <meshStandardMaterial map={roadTexture} color="#2e3239" roughness={0.96} metalness={0.08} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, -20]} receiveShadow>
        <planeGeometry args={[0.48, 50]} />
        <meshStandardMaterial
          map={dashTexture}
          transparent
          alphaTest={0.2}
          emissive="#ca8a04"
          emissiveIntensity={0.2}
        />
      </mesh>

      <ContactShadows position={[0, 0.02, RUNNER_Z]} opacity={0.42} scale={10} blur={2.2} far={10} />

      <group
        ref={playerRef}
        position={[LANE_X[currentLane], 0.02, RUNNER_Z]}
        rotation={[0, Math.PI, 0]}
        scale={[0.008, 0.008, 0.008]}
      >
        <Mychar />
      </group>

      {obstacles.map((obs) => (
        <mesh key={obs.id} position={[LANE_X[obs.lane], 0.5, obs.position]} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#ef4444" roughness={0.66} metalness={0.12} />
        </mesh>
      ))}

      {coins.map((coin) => (
        <mesh key={coin.id} position={[LANE_X[coin.lane], 0.5, coin.position]} castShadow>
          <sphereGeometry args={[0.32, 20, 20]} />
          <meshStandardMaterial color="#facc15" metalness={0.8} roughness={0.2} emissive="#ca8a04" emissiveIntensity={0.35} />
        </mesh>
      ))}
    </>
  );
}

export default function Home() {
  const [currentLane, setCurrentLane] = useState(1);
  const [obstacles, setObstacles] = useState([]);
  const [coins, setCoins] = useState([]);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [energy, setEnergy] = useState(100);
  const [gameSpeed, setGameSpeed] = useState(BASE_GAME_SPEED);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const rootRef = useRef(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const stopTouchScroll = (e) => e.preventDefault();
    el.addEventListener('touchmove', stopTouchScroll, { passive: false });
    return () => el.removeEventListener('touchmove', stopTouchScroll);
  }, []);

  useEffect(() => {
    if (isQuizOpen || isBlocked) {
      setGameSpeed(0);
    } else {
      setGameSpeed(BASE_GAME_SPEED);
    }
  }, [isQuizOpen, isBlocked]);

  useEffect(() => {
    if (!isQuizOpen) return;
    const randomIdx = Math.floor(Math.random() * questionBank.length);
    setActiveQuestionIndex(randomIdx);
  }, [isQuizOpen]);

  const moveLaneLeft = useCallback(() => {
    setCurrentLane((prev) => Math.max(0, prev - 1));
  }, []);

  const moveLaneRight = useCallback(() => {
    setCurrentLane((prev) => Math.min(2, prev + 1));
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (isQuizOpen) return;
      if (e.key === 'ArrowLeft') {
        moveLaneLeft();
      }
      if (e.key === 'ArrowRight') {
        moveLaneRight();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isQuizOpen, moveLaneLeft, moveLaneRight]);

  const handleScreenClick = (e) => {
    if (isQuizOpen) return;
    const half = window.innerWidth / 2;
    if (e.clientX < half) {
      moveLaneLeft();
    } else {
      moveLaneRight();
    }
  };

  const handleQuizAnswer = (selected) => {
    const q = questionBank[activeQuestionIndex];
    if (selected === q.correctAnswer) {
      setEnergy(100);
      setIsQuizOpen(false);
      return;
    }
    // Incorrect answer keeps quiz modal open
  };

  return (
    <div
      ref={rootRef}
      className="relative h-screen w-full overflow-hidden bg-slate-900 touch-none select-none"
      onClick={handleScreenClick}
    >
      <Canvas shadows dpr={[1, 2]}>
        <RunnerScene
          currentLane={currentLane}
          gameSpeed={gameSpeed}
          energy={energy}
          setEnergy={setEnergy}
          distance={distance}
          setDistance={setDistance}
          obstacles={obstacles}
          setObstacles={setObstacles}
          coins={coins}
          setCoins={setCoins}
          setScore={setScore}
          setIsQuizOpen={setIsQuizOpen}
          setIsBlocked={setIsBlocked}
        />
      </Canvas>

      <div className="pointer-events-none absolute left-4 right-4 top-4 z-30">
        <div className="rounded-2xl bg-black/55 p-3 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-200">
            <span>Energy</span>
            <span>{Math.ceil(energy)}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-700/80">
            <div
              className="h-full rounded-full bg-linear-to-r from-emerald-400 to-lime-300 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, energy))}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm font-semibold text-white">
            <span>Score: {score}</span>
            <span>Distance: {Math.floor(distance)} m</span>
          </div>
        </div>
      </div>

      {isBlocked && !isQuizOpen && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center">
          <div className="rounded-full border border-amber-300/50 bg-amber-900/75 px-4 py-2 text-sm font-bold text-amber-100 backdrop-blur-sm">
            Obstacle hit: switch lane to continue
          </div>
        </div>
      )}

      {isQuizOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white p-6 shadow-2xl">
            <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-sky-600">Knowledge Boost</p>
            <h2 className="mt-3 text-center text-2xl font-black text-slate-900">
              {questionBank[activeQuestionIndex].question}
            </h2>
            <p className="mt-2 text-center text-sm text-slate-600">Answer correctly to refill energy to 100%.</p>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {questionBank[activeQuestionIndex].options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleQuizAnswer(opt)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-base font-bold text-slate-900 hover:bg-slate-100"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
