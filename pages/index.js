'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, PerspectiveCamera } from '@react-three/drei';
import {
  CanvasTexture,
  DoubleSide,
  MathUtils,
  RepeatWrapping,
  SRGBColorSpace,
  CylinderGeometry,
  BoxGeometry,
  MeshStandardMaterial,
} from 'three';
import Mychar from '../components/Mychar';

const LANE_X = [-2, 0, 2];
const RUNNER_Z = 2;
const BASE_GAME_SPEED = 6;
const QUIZ_DURATION = 7;
const ENERGY_DRAIN_DELAY = 6;

const questionBank = [
  {
    question: 'What is 2 + 2?',
    options: ['3', '4', '5', '6'],
    correctAnswer: '4',
    explanation: '2 + 2 equals 4 because adding two pairs gives four total.',
  },
  {
    question: 'Which shape has exactly 3 sides?',
    options: ['Square', 'Triangle', 'Circle', 'Rectangle'],
    correctAnswer: 'Triangle',
    explanation: 'A triangle is the only basic shape with exactly three sides.',
  },
  {
    question: 'What is 5 x 3?',
    options: ['8', '15', '10', '20'],
    correctAnswer: '15',
    explanation: '5 groups of 3 equals 15.',
  },
  {
    question: 'How many degrees are in a right angle?',
    options: ['45', '60', '90', '120'],
    correctAnswer: '90',
    explanation: 'A right angle is always 90 degrees.',
  },
  {
    question: 'What is 12 - 7?',
    options: ['3', '4', '5', '6'],
    correctAnswer: '5',
    explanation: 'Subtracting 7 from 12 leaves 5.',
  },
];

function makeRoadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2f3238';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#3a3e46';
  for (let y = 0; y < canvas.height; y += 72) {
    ctx.fillRect(0, y, canvas.width, 2);
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 22);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function makeDashTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#facc15';
  for (let y = 0; y < canvas.height; y += 84) {
    ctx.fillRect(20, y, 24, 46);
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1, 22);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function GameScene({
  currentLane,
  targetX,
  gameSpeed,
  energy,
  quizTime,
  isQuizOpen,
  isGameOver,
  isBlocked,
  obstacles,
  setObstacles,
  coins,
  setCoins,
  setEnergy,
  setScore,
  setDistance,
  setIsGameOver,
  setIsBlocked,
  setIsQuizOpen,
  setQuizTime,
  quizCompletedCount,
  setHasFinished,
}) {
  const characterRootRef = useRef(null);
  const characterVisualRef = useRef(null);
  const cameraRef = useRef(null);

  const currentXRef = useRef(LANE_X[currentLane]);

  const gameSpeedRef = useRef(gameSpeed);
  const quizOpenRef = useRef(isQuizOpen);
  const gameOverRef = useRef(isGameOver);
  const targetXRef = useRef(targetX);

  const roadTexture = useMemo(() => makeRoadTexture(), []);
  const dashTexture = useMemo(() => makeDashTexture(), []);
  const roadTextureRef = useRef(null);
  const dashTextureRef = useRef(null);

  const coinGeometry = useMemo(() => new CylinderGeometry(0.26, 0.26, 0.1, 20), []);
  const obstacleGeometry = useMemo(() => new BoxGeometry(0.8, 0.8, 0.8), []);
  const coinMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#facc15',
        emissive: '#ca8a04',
        emissiveIntensity: 0.32,
        metalness: 0.7,
        roughness: 0.25,
      }),
    []
  );
  const obstacleMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: '#ef4444',
        roughness: 0.62,
        metalness: 0.1,
      }),
    []
  );

  const uiEnergyRef = useRef(100);
  const uiDistanceRef = useRef(0);
  const quizTimerRef = useRef(QUIZ_DURATION);
  const elapsedRunRef = useRef(0);
  const finishRef = useRef(null);
  const finishDistanceRef = useRef(220);

  const buildingRefs = useRef([]);
  const buildingData = useMemo(
    () =>
      Array.from({ length: 54 }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const stackOffset = [4.9, 5.7, 6.5][i % 3];
        return {
          x: side * stackOffset,
          y: 0,
          z: -8 - i * 3.4,
          h: 2.4 + (i % 7) * 0.65,
          w: 0.95 + (i % 4) * 0.2,
          d: 1.05 + (i % 3) * 0.25,
          color: ['#475569', '#334155', '#3f4a5c'][i % 3],
        };
      }),
    []
  );

  useEffect(() => {
    targetXRef.current = targetX;
  }, [targetX]);

  useEffect(() => {
    gameSpeedRef.current = gameSpeed;
  }, [gameSpeed]);

  useEffect(() => {
    quizOpenRef.current = isQuizOpen;
  }, [isQuizOpen]);

  useEffect(() => {
    gameOverRef.current = isGameOver;
  }, [isGameOver]);

  const blockedRef = useRef(isBlocked);
  useEffect(() => {
    blockedRef.current = isBlocked;
  }, [isBlocked]);

  useEffect(() => {
    uiEnergyRef.current = energy;
  }, [energy]);

  useEffect(() => {
    quizTimerRef.current = quizTime;
  }, [quizTime]);

  useEffect(() => {
    roadTextureRef.current = roadTexture;
    dashTextureRef.current = dashTexture;
  }, [roadTexture, dashTexture]);

  useEffect(() => {
    const root = characterVisualRef.current;
    if (!root) return;

    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      obj.frustumCulled = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        mat.transparent = false;
        mat.opacity = 1;
        mat.side = DoubleSide;
        mat.depthWrite = true;
        mat.needsUpdate = true;
      });
    });
  }, []);

  useFrame((_, delta) => {
    const laneTargetX = targetXRef.current;
    currentXRef.current = MathUtils.lerp(currentXRef.current, laneTargetX, 0.2);

    if (characterRootRef.current) {
      characterRootRef.current.position.x = currentXRef.current;
      characterRootRef.current.position.z = RUNNER_Z;
    }

    if (cameraRef.current) {
      cameraRef.current.lookAt(0, 0.45, -5.5);
    }

    // Keep collision checks active even while blocked so lane switch can resume running.
    let obstacleBlockedNow = false;
    for (let i = 0; i < obstacles.length; i += 1) {
      const ox = LANE_X[obstacles[i].lane];
      const dist = Math.hypot(currentXRef.current - ox, RUNNER_Z - obstacles[i].z);
      if (dist < 0.8) {
        obstacleBlockedNow = true;
        break;
      }
    }
    if (obstacleBlockedNow !== blockedRef.current) {
      blockedRef.current = obstacleBlockedNow;
      setIsBlocked(obstacleBlockedNow);
    }

    if (gameOverRef.current || quizOpenRef.current || blockedRef.current) {
      return;
    }

    const speed = gameSpeedRef.current;
    if (roadTextureRef.current) {
      roadTextureRef.current.offset.y += speed * delta * 0.45;
    }
    if (dashTextureRef.current) {
      dashTextureRef.current.offset.y += speed * delta;
    }

    for (let i = 0; i < buildingData.length; i += 1) {
      const mesh = buildingRefs.current[i];
      if (!mesh) continue;
      mesh.position.z += speed * delta * 0.85;
      if (mesh.position.z > 8) {
        mesh.position.z = -220 - (i % 9) * 4;
      }
    }

    elapsedRunRef.current += delta;

    const drain = elapsedRunRef.current >= ENERGY_DRAIN_DELAY ? 10 * delta : 0;
    const nextEnergy = Math.max(0, uiEnergyRef.current - drain);
    uiEnergyRef.current = nextEnergy;
    setEnergy(nextEnergy);

    const nextDistance = uiDistanceRef.current + speed * delta;
    uiDistanceRef.current = nextDistance;
    setDistance(nextDistance);

    if (quizCompletedCount < 2) {
      const nextQuizTime = quizTimerRef.current - delta;
      quizTimerRef.current = nextQuizTime;
      setQuizTime(Math.max(0, nextQuizTime));

      if (nextQuizTime <= 0) {
        setIsQuizOpen(true);
        return;
      }
    }

    if (nextEnergy <= 0) {
      setIsGameOver(true);
      return;
    }

    setObstacles((prev) => {
      const moved = prev
        .map((o) => ({ ...o, z: o.z + speed * delta }))
        .filter((o) => o.z <= 5);

      return moved;
    });

    setCoins((prev) => {
      let collected = 0;
      const moved = [];

      for (let i = 0; i < prev.length; i += 1) {
        const c = { ...prev[i], z: prev[i].z + speed * delta };
        if (c.z > 5) {
          continue;
        }

        const cx = LANE_X[c.lane];
        const dist = Math.hypot(currentXRef.current - cx, RUNNER_Z - c.z);
        if (dist < 0.8) {
          collected += 1;
        } else {
          moved.push(c);
        }
      }

      if (collected > 0) {
        setScore((s) => s + collected);
        setEnergy((e) => Math.min(100, e + 5 * collected));
        uiEnergyRef.current = Math.min(100, uiEnergyRef.current + 5 * collected);
      }

      return moved;
    });

    if (quizCompletedCount >= 2 && finishRef.current) {
      finishRef.current.position.z = -finishDistanceRef.current + uiDistanceRef.current;
      if (finishRef.current.position.z >= RUNNER_Z - 0.6) {
        setHasFinished(true);
        setIsBlocked(true);
      }
    }
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 3.5, 8]} fov={56} near={0.1} far={150} />

      <Environment preset="city" />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[8, 12, 8]}
        intensity={1.3}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -20]} receiveShadow>
        <planeGeometry args={[6, 50]} />
        <meshStandardMaterial map={roadTexture} color="#2f3238" roughness={0.95} metalness={0.08} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, -20]} receiveShadow>
        <planeGeometry args={[0.5, 50]} />
        <meshStandardMaterial
          map={dashTexture}
          transparent
          alphaTest={0.2}
          emissive="#ca8a04"
          emissiveIntensity={0.25}
        />
      </mesh>

      {buildingData.map((b, i) => (
        <mesh
          key={`b-${i}`}
          ref={(el) => {
            buildingRefs.current[i] = el;
          }}
          position={[b.x, b.h / 2, b.z]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.color} roughness={0.78} metalness={0.15} />
        </mesh>
      ))}

      {quizCompletedCount >= 2 && (
        <group ref={finishRef} position={[0, 0, -220]}>
          <mesh position={[0, 2.1, 0]} castShadow receiveShadow>
            <boxGeometry args={[5.8, 2.4, 0.5]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.75} metalness={0.08} />
          </mesh>
          <mesh position={[0, 3.4, 0]} castShadow>
            <boxGeometry args={[6.4, 0.8, 0.55]} />
            <meshStandardMaterial color="#2563eb" emissive="#1d4ed8" emissiveIntensity={0.25} />
          </mesh>
          <mesh position={[0, 3.4, 0.31]}>
            <planeGeometry args={[3.8, 0.5]} />
            <meshStandardMaterial color="#dbeafe" emissive="#93c5fd" emissiveIntensity={0.15} />
          </mesh>
          <mesh position={[-2.45, 1.2, 0]} castShadow>
            <boxGeometry args={[0.4, 2.4, 0.4]} />
            <meshStandardMaterial color="#334155" roughness={0.8} metalness={0.2} />
          </mesh>
          <mesh position={[2.45, 1.2, 0]} castShadow>
            <boxGeometry args={[0.4, 2.4, 0.4]} />
            <meshStandardMaterial color="#334155" roughness={0.8} metalness={0.2} />
          </mesh>
        </group>
      )}

      <ContactShadows position={[0, 0.02, RUNNER_Z]} opacity={0.45} scale={10} blur={2.3} far={9} />

      <group ref={characterRootRef} position={[LANE_X[currentLane], 0.02, RUNNER_Z]} rotation={[0, 0, 0]}>
        <group ref={characterVisualRef} rotation={[0, Math.PI, 0]} scale={[0.008, 0.008, 0.008]}>
          <Mychar />
        </group>
      </group>

      {obstacles.map((obs) => (
        <mesh
          key={obs.id}
          geometry={obstacleGeometry}
          material={obstacleMaterial}
          position={[LANE_X[obs.lane], 0.4, obs.z]}
          castShadow
          receiveShadow
        />
      ))}

      {coins.map((coin) => (
        <mesh
          key={coin.id}
          geometry={coinGeometry}
          material={coinMaterial}
          position={[LANE_X[coin.lane], 0.45, coin.z]}
          rotation={[Math.PI / 2, 0, 0]}
          castShadow
        />
      ))}
    </>
  );
}

export default function Home() {
  const [currentLane, setCurrentLane] = useState(1);
  const [targetX, setTargetX] = useState(0);

  const [gameSpeed, setGameSpeed] = useState(BASE_GAME_SPEED);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const [quizCompletedCount, setQuizCompletedCount] = useState(0);

  const [energy, setEnergy] = useState(100);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [quizTime, setQuizTime] = useState(QUIZ_DURATION);
  const [quizRound, setQuizRound] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizFeedback, setQuizFeedback] = useState('');
  const [quizWasCorrect, setQuizWasCorrect] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);

  const [obstacles, setObstacles] = useState([]);
  const [coins, setCoins] = useState([]);

  const obstacleIdRef = useRef(1);
  const coinIdRef = useRef(1);
  const rootRef = useRef(null);
  const swipeStartXRef = useRef(null);
  const quizCorrectRef = useRef(0);

  useEffect(() => {
    setTargetX(LANE_X[currentLane]);
  }, [currentLane]);

  useEffect(() => {
    if (isGameOver || isQuizOpen || isBlocked || hasFinished) {
      setGameSpeed(0);
    } else {
      setGameSpeed(BASE_GAME_SPEED);
    }
  }, [isGameOver, isQuizOpen, isBlocked, hasFinished]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (isGameOver || isQuizOpen || hasFinished) return;
      if (e.key === 'ArrowLeft') {
        setCurrentLane((l) => Math.max(0, l - 1));
      }
      if (e.key === 'ArrowRight') {
        setCurrentLane((l) => Math.min(2, l + 1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isGameOver, isQuizOpen, hasFinished]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const preventScroll = (e) => e.preventDefault();
    el.addEventListener('touchmove', preventScroll, { passive: false });
    return () => el.removeEventListener('touchmove', preventScroll);
  }, []);

  useEffect(() => {
    if (isGameOver || isQuizOpen || hasFinished || isBlocked) return undefined;
    const id = setInterval(() => {
      setObstacles((prev) => {
        // Never allow 3 obstacles simultaneously; keep escape lane always available.
        if (prev.length >= 2) return prev;

        const occupiedLanes = new Set(prev.map((o) => o.lane));
        const lanePool = [0, 1, 2].filter((l) => !occupiedLanes.has(l));
        const safePool = lanePool.length > 0 ? lanePool : [0, 1, 2];
        const lane = safePool[Math.floor(Math.random() * safePool.length)];

        const obstacle = { id: obstacleIdRef.current, lane, z: -20 };
        obstacleIdRef.current += 1;
        return [...prev, obstacle];
      });
    }, 800);
    return () => clearInterval(id);
  }, [isGameOver, isQuizOpen, hasFinished, isBlocked]);

  useEffect(() => {
    if (isGameOver || isQuizOpen || hasFinished) return undefined;
    const id = setInterval(() => {
      const blockedLane = Math.floor(Math.random() * 3);
      const candidateLanes = [0, 1, 2].filter((lane) => lane !== blockedLane);
      const lane = candidateLanes[Math.floor(Math.random() * candidateLanes.length)];
      const coin = { id: coinIdRef.current, lane, z: -22 };
      coinIdRef.current += 1;
      setCoins((prev) => [...prev, coin]);
    }, 1200);
    return () => clearInterval(id);
  }, [isGameOver, isQuizOpen, hasFinished]);

  useEffect(() => {
    if (!isQuizOpen) return;
    const pool = [...questionBank]
      .sort(() => Math.random() - 0.5)
      .slice(0, Math.min(3, questionBank.length));
    setQuizRound(pool);
    setQuizIndex(0);
    setQuizCorrectCount(0);
    quizCorrectRef.current = 0;
    setQuizAnswered(false);
    setQuizFeedback('');
    setQuizWasCorrect(false);
    setShowConfetti(false);
  }, [isQuizOpen]);

  const shiftLaneByDirection = useCallback((goRight) => {
    if (goRight) {
      setCurrentLane((l) => Math.min(2, l + 1));
    } else {
      setCurrentLane((l) => Math.max(0, l - 1));
    }
  }, []);

  const handlePointerDown = useCallback((e) => {
    if (isGameOver || isQuizOpen || hasFinished) return;
    swipeStartXRef.current = e.clientX;
  }, [isGameOver, isQuizOpen, hasFinished]);

  const handlePointerUp = useCallback(
    (e) => {
      if (isGameOver || isQuizOpen || hasFinished) return;
      if (swipeStartXRef.current == null) return;

      const dx = e.clientX - swipeStartXRef.current;
      const threshold = 24;

      if (Math.abs(dx) >= threshold) {
        shiftLaneByDirection(dx < 0);
      } else {
        const mid = window.innerWidth / 2;
        shiftLaneByDirection(e.clientX >= mid);
      }

      swipeStartXRef.current = null;
    },
    [isGameOver, isQuizOpen, hasFinished, shiftLaneByDirection]
  );

  const restartGame = useCallback(() => {
    setCurrentLane(1);
    setTargetX(0);
    setGameSpeed(BASE_GAME_SPEED);
    setIsGameOver(false);
    setIsQuizOpen(false);
    setIsBlocked(false);
    setHasFinished(false);
    setQuizCompletedCount(0);
    setEnergy(100);
    setScore(0);
    setDistance(0);
    setQuizTime(QUIZ_DURATION);
    setObstacles([]);
    setCoins([]);
    obstacleIdRef.current = 1;
    coinIdRef.current = 1;
    setQuizRound([]);
    setQuizIndex(0);
    setQuizCorrectCount(0);
    quizCorrectRef.current = 0;
    setQuizAnswered(false);
    setQuizFeedback('');
    setQuizWasCorrect(false);
    setShowConfetti(false);
  }, []);

  const activeQuestion = quizRound[quizIndex] || questionBank[0];

  const onAnswerQuiz = (picked) => {
    if (quizAnswered || !activeQuestion) return;

    const isCorrect = picked === activeQuestion.correctAnswer;
    setQuizAnswered(true);
    setQuizWasCorrect(isCorrect);

    if (isCorrect) {
      setQuizCorrectCount((v) => {
        const nv = v + 1;
        quizCorrectRef.current = nv;
        return nv;
      });
      setQuizFeedback('Correct! Great job.');
      setConfettiKey((k) => k + 1);
      setShowConfetti(true);
    } else {
      quizCorrectRef.current = quizCorrectCount;
      setQuizFeedback(
        `Wrong answer. Correct answer: ${activeQuestion.correctAnswer}. ${activeQuestion.explanation}`
      );
      setShowConfetti(false);
    }
  };

  useEffect(() => {
    if (!isQuizOpen || !quizAnswered) return;

    const timer = window.setTimeout(() => {
      if (quizIndex < 2 && quizIndex < quizRound.length - 1) {
        setQuizIndex((i) => i + 1);
        setQuizAnswered(false);
        setQuizFeedback('');
        setQuizWasCorrect(false);
        setShowConfetti(false);
        return;
      }

      const totalCorrect = quizCorrectRef.current;
      let refill = 25;
      if (totalCorrect >= 3) refill = 100;
      else if (totalCorrect === 2) refill = 75;
      else if (totalCorrect === 1) refill = 50;

      setEnergy(refill);
      setQuizCompletedCount((v) => v + 1);
      setIsQuizOpen(false);
      setQuizTime(QUIZ_DURATION);
      setGameSpeed(BASE_GAME_SPEED);
      setQuizAnswered(false);
      setQuizFeedback('');
      setQuizWasCorrect(false);
      setShowConfetti(false);
    }, 1300);

    return () => window.clearTimeout(timer);
  }, [isQuizOpen, quizAnswered, quizIndex, quizRound.length]);

  return (
    <div
      ref={rootRef}
      className="relative h-screen w-full overflow-hidden bg-slate-900 touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <Canvas shadows dpr={[1, 2]}>
        <GameScene
          currentLane={currentLane}
          targetX={targetX}
          gameSpeed={gameSpeed}
          energy={energy}
          quizTime={quizTime}
          isQuizOpen={isQuizOpen}
          isGameOver={isGameOver}
          isBlocked={isBlocked}
          obstacles={obstacles}
          setObstacles={setObstacles}
          coins={coins}
          setCoins={setCoins}
          setEnergy={setEnergy}
          setScore={setScore}
          setDistance={setDistance}
          setIsGameOver={setIsGameOver}
          setIsBlocked={setIsBlocked}
          setIsQuizOpen={setIsQuizOpen}
          setQuizTime={setQuizTime}
          quizCompletedCount={quizCompletedCount}
          setHasFinished={setHasFinished}
        />
      </Canvas>

      <div className="pointer-events-none absolute left-0 right-0 top-0 z-30">
        <div className="w-full bg-black/65 px-3 pb-2 pt-2 backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-slate-200">
          <span>Energy</span>
          <span>{Math.ceil(energy)}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-none bg-slate-700/80">
            <div
              className="h-full rounded-none bg-linear-to-r from-emerald-400 via-lime-300 to-yellow-300 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, energy))}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-sm font-semibold text-white">
            <span>Score: {score}</span>
            <span>Distance: {Math.floor(distance)} m</span>
            <span>{quizCompletedCount < 2 ? `Checkpoint ${quizCompletedCount + 1}/2` : 'Finish Unlocked'}</span>
          </div>
        </div>
      </div>

      {isBlocked && !isQuizOpen && !isGameOver && !hasFinished && (
        <div className="pointer-events-none absolute inset-x-0 top-18 z-30 flex justify-center">
          <div className="rounded-full border border-amber-300/60 bg-amber-900/80 px-4 py-2 text-xs font-bold text-amber-100 backdrop-blur-sm">
            Obstacle in lane - swipe to side lane to continue
          </div>
        </div>
      )}

      {hasFinished && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 text-center text-white shadow-2xl">
            <h2 className="text-3xl font-black">School Entry Reached</h2>
            <p className="mt-2 text-slate-300">Awesome! You completed both quiz checkpoints.</p>
            <button
              type="button"
              onClick={restartGame}
              className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-base font-bold text-slate-950 hover:bg-emerald-400"
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      {isGameOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-6 text-center text-white shadow-2xl">
            <h2 className="text-3xl font-black">Game Over</h2>
            <p className="mt-2 text-slate-300">Energy exhausted. Try collecting more coins next run.</p>
            <button
              type="button"
              onClick={restartGame}
              className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-base font-bold text-slate-950 hover:bg-emerald-400"
            >
              Restart
            </button>
          </div>
        </div>
      )}

      {isQuizOpen && !isGameOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white p-6 shadow-2xl">
            <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-sky-600">Quiz Pause</p>
            <h2 className="mt-3 text-center text-2xl font-black text-slate-900">{activeQuestion.question}</h2>
            <p className="mt-2 text-center text-sm text-slate-600">
              Question {Math.min(quizIndex + 1, 3)} of 3
            </p>

            {showConfetti && (
              <div key={confettiKey} className="pointer-events-none absolute inset-0 overflow-hidden">
                {Array.from({ length: 24 }).map((_, i) => (
                  <span
                    key={i}
                    className="quiz-confetti"
                    style={{
                      left: `${(i * 37) % 100}%`,
                      animationDelay: `${(i % 6) * 0.05}s`,
                      backgroundColor: ['#22c55e', '#f43f5e', '#3b82f6', '#facc15'][i % 4],
                    }}
                  />
                ))}
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activeQuestion.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onAnswerQuiz(opt)}
                  disabled={quizAnswered}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-base font-bold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {opt}
                </button>
              ))}
            </div>

            {quizAnswered && (
              <div className="mt-4 space-y-3">
                <p className={`text-sm font-semibold ${quizWasCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {quizFeedback}
                </p>
                <p className="text-xs font-medium text-slate-500">
                  Moving to next question automatically...
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx global>{`
        .quiz-confetti {
          position: absolute;
          top: -10px;
          width: 8px;
          height: 14px;
          border-radius: 2px;
          animation: confetti-fall 1s ease-out forwards;
        }

        @keyframes confetti-fall {
          0% {
            transform: translateY(-10px) rotate(0deg);
            opacity: 0;
          }
          12% {
            opacity: 1;
          }
          100% {
            transform: translateY(260px) rotate(540deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
