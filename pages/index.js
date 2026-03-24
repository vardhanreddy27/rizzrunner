'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, PerspectiveCamera, useGLTF } from '@react-three/drei';
import {
  Box3,
  DefaultLoadingManager,
  DoubleSide,
  MathUtils,
  BoxGeometry,
  MeshStandardMaterial,
  PCFShadowMap,
  Vector3,
} from 'three';
import Mychar from '../components/Mychar';
import WorldMap from '../components/WorldMap';

const LANE_X = [-2.3, 0, 2.3];
const RUNNER_Z = 2;
const RUNNER_Y = 0.08;
const BASE_GAME_SPEED = 6;
const QUIZ_DURATION = 7;
const ENABLE_QUIZ = true;
const ENERGY_DRAIN_DELAY = 6;
const ROAD_SEGMENT_LENGTH = 55;
const ROAD_WRAP_START = 35;
const ROAD_SEGMENT_COUNT = 3;
const COIN_OBSTACLE_SAFE_GAP = 12;
const COIN_COIN_SAFE_GAP = 6;
const QUIZ_QUESTIONS_PER_CHECKPOINT = 3;
const QUIZ_CHECKPOINTS_REQUIRED = 2;
const TOTAL_QUIZ_QUESTIONS = QUIZ_QUESTIONS_PER_CHECKPOINT * QUIZ_CHECKPOINTS_REQUIRED;

function shuffleList(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

const FALLBACK_QUESTION_BANK = [
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

function DirtRoad({ position }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8.6, 55]} />
        <meshStandardMaterial color="#1e293b" roughness={0.92} metalness={0.04} />
      </mesh>
    </group>
  );
}

function SkyBackdrop() {
  const { scene } = useGLTF('/unreal_engine_4_sky.glb');
  const skyScene = useMemo(() => scene.clone(), [scene]);
  const skyRef = useRef(null);

  useEffect(() => {
    skyScene.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      obj.frustumCulled = false;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        mat.transparent = false;
        mat.opacity = 1;
        mat.needsUpdate = true;
      });
    });
  }, [skyScene]);

  useFrame(({ camera }) => {
    if (!skyRef.current) return;
    // Keep sky around the camera so it stays visible in mobile framing.
    skyRef.current.position.set(camera.position.x, -6, camera.position.z - 60);
  });

  return <primitive ref={skyRef} object={skyScene} position={[0, -6, -60]} scale={[28, 28, 28]} />;
}

function CoinModel({ position }) {
  const { scene } = useGLTF('/stylized_coin.glb');
  const coinScene = useMemo(() => scene.clone(), [scene]);
  const coinRef = useRef(null);
  const flipRef = useRef(null);

  useEffect(() => {
    coinScene.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        mat.needsUpdate = true;
      });
    });
  }, [coinScene]);

  useFrame(({ camera, clock }) => {
    if (!coinRef.current || !flipRef.current) return;

    // Keep the coin facing the camera so it is clearly circular at rest.
    coinRef.current.quaternion.copy(camera.quaternion);

    // Continuous full rotation for an infinite spin effect.
    const t = clock.getElapsedTime();
    flipRef.current.rotation.y = t * 2.4;
  });

  return (
    <group ref={coinRef} position={position} scale={[0.52, 0.52, 0.52]}>
      <group ref={flipRef}>
        <primitive object={coinScene} />
      </group>
    </group>
  );
}

function RoadBarrier({ position }) {
  const { scene } = useGLTF('/realistic_road_barrier.glb');
  const barrierScene = useMemo(() => {
    const cloned = scene.clone();

    cloned.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        mat.transparent = false;
        mat.opacity = 1;
        mat.needsUpdate = true;
      });
    });

    const box = new Box3().setFromObject(cloned);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);

    if (size.y > 0.0001) {
      const targetHeight = 1.0;
      const s = targetHeight / size.y;
      cloned.scale.setScalar(s);
      cloned.position.set(-center.x * s, -box.min.y * s, -center.z * s);
    }

    return cloned;
  }, [scene]);

  return (
    <group position={position}>
      <primitive object={barrierScene} />
    </group>
  );
}

function CharacterFallback() {
  return (
    <mesh castShadow position={[0, 0.78, 0]}>
      <capsuleGeometry args={[0.22, 0.9, 6, 10]} />
      <meshStandardMaterial color="#f97316" roughness={0.55} metalness={0.12} />
    </mesh>
  );
}

function laneIndexToX(value) {
  if (value <= 1) return MathUtils.lerp(LANE_X[0], LANE_X[1], value);
  return MathUtils.lerp(LANE_X[1], LANE_X[2], value - 1);
}

function DummyRunner({ initialLane, speedFactor, swayPhase, startOffset = 0, obstacles }) {
  const rootRef = useRef(null);
  const visualRef = useRef(null);
  const normalizedRef = useRef(false);
  const zRef = useRef(RUNNER_Z + startOffset);
  const laneRef = useRef(initialLane);
  const targetLaneRef = useRef(initialLane);
  const laneDecisionTimerRef = useRef(0.8 + (swayPhase % 1) * 0.9);

  const normalizeDummy = useCallback(() => {
    const root = visualRef.current;
    if (!root || normalizedRef.current) return;

    root.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      obj.castShadow = false;
      obj.receiveShadow = false;
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

    const box = new Box3().setFromObject(root);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);

    if (size.y > 0.0001) {
      const targetHeight = 1.48;
      const s = targetHeight / size.y;
      root.scale.setScalar(s);
      root.position.set(-center.x * s, -box.min.y * s + 0.02, -center.z * s);
      normalizedRef.current = true;
    }
  }, []);

  useFrame(({ clock }, delta) => {
    const g = rootRef.current;
    if (!g) return;

    normalizeDummy();

    const t = clock.getElapsedTime();
    zRef.current += (speedFactor - 1) * BASE_GAME_SPEED * 0.7 * delta;
    if (zRef.current > 5.5) zRef.current = -9.5;
    if (zRef.current < -11.5) zRef.current = 4.2;

    laneDecisionTimerRef.current -= delta;

    const obstacleNearLane = (laneIndex, z, range = 2.8) =>
      obstacles.some((o) => o.lane === laneIndex && Math.abs(o.z - z) <= range);

    const currentLaneIndex = Math.round(Math.max(0, Math.min(2, laneRef.current)));
    const dangerAhead = obstacleNearLane(currentLaneIndex, zRef.current + 1.0, 2.8);

    if (dangerAhead || laneDecisionTimerRef.current <= 0) {
      const lanes = [0, 1, 2];
      const safeLanes = lanes.filter((l) => !obstacleNearLane(l, zRef.current + 0.6, 2.6));
      const pool = safeLanes.length > 0 ? safeLanes : lanes;

      const currentTarget = Math.round(targetLaneRef.current);
      const alternativePool = pool.filter((l) => l !== currentTarget);
      const finalPool = alternativePool.length > 0 ? alternativePool : pool;

      targetLaneRef.current = finalPool[Math.floor(Math.random() * finalPool.length)];
      laneDecisionTimerRef.current = 0.7 + Math.random() * 1.4;
    }

    laneRef.current = MathUtils.lerp(laneRef.current, targetLaneRef.current, Math.min(1, delta * 4));

    // Keep dummy runners from ever touching barriers, including during lane interpolation.
    let nearestBarrierZ = Infinity;
    for (let i = 0; i < obstacles.length; i += 1) {
      const o = obstacles[i];
      const laneProximity = Math.abs(laneRef.current - o.lane);
      if (laneProximity > 0.42) continue;
      if (o.z < zRef.current - 1.4) continue;
      if (o.z < nearestBarrierZ) nearestBarrierZ = o.z;
    }

    if (nearestBarrierZ !== Infinity && zRef.current > nearestBarrierZ - 1.15) {
      zRef.current = nearestBarrierZ - 1.15;

      const lanes = [0, 1, 2];
      const safeLanes = lanes.filter((l) => !obstacleNearLane(l, zRef.current + 0.8, 2.8));
      const currentTarget = Math.round(targetLaneRef.current);
      const alternatives = safeLanes.filter((l) => l !== currentTarget);
      if (alternatives.length > 0) {
        targetLaneRef.current = alternatives[Math.floor(Math.random() * alternatives.length)];
      }

      if (laneDecisionTimerRef.current > 0.1) {
        laneDecisionTimerRef.current = 0.1;
      }
    }

    g.position.x = laneIndexToX(laneRef.current) + Math.sin(t * 1.5 + swayPhase) * 0.07;
    g.position.y = RUNNER_Y + Math.sin(t * 4 + swayPhase) * 0.01;
    g.position.z = zRef.current;
  });

  return (
    <group ref={rootRef} rotation={[0, 0, 0]}>
      <Suspense fallback={<CharacterFallback />}>
        <group ref={visualRef} rotation={[0, Math.PI, 0]}>
          <Mychar />
        </group>
      </Suspense>
    </group>
  );
}

function DummyPlayers({ obstacles }) {
  return (
    <>
      <DummyRunner initialLane={0} speedFactor={0.74} swayPhase={0} startOffset={-1.2} obstacles={obstacles} />
      <DummyRunner initialLane={1} speedFactor={0.8} swayPhase={0.9} startOffset={0.8} obstacles={obstacles} />
      <DummyRunner initialLane={2} speedFactor={0.86} swayPhase={1.7} startOffset={-0.4} obstacles={obstacles} />
    </>
  );
}

useGLTF.preload('/unreal_engine_4_sky.glb');
useGLTF.preload('/stylized_coin.glb');
useGLTF.preload('/realistic_road_barrier.glb');
useGLTF.preload('/FastRun.glb');

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
  requiredQuizCount,
  onLowEnergy,
  setHasFinished,
}) {
  const characterRootRef = useRef(null);
  const characterVisualRef = useRef(null);
  const cameraRef = useRef(null);
  const normalizedCharacterRef = useRef(false);
  const roadSegmentsRef = useRef([]);

  const currentXRef = useRef(LANE_X[currentLane]);

  const gameSpeedRef = useRef(gameSpeed);
  const quizOpenRef = useRef(isQuizOpen);
  const gameOverRef = useRef(isGameOver);
  const targetXRef = useRef(targetX);

  const uiEnergyRef = useRef(100);
  const uiDistanceRef = useRef(0);
  const quizTimerRef = useRef(QUIZ_DURATION);
  const elapsedRunRef = useRef(0);
  const lowEnergyHandledRef = useRef(false);
  const finishRef = useRef(null);
  const finishDistanceRef = useRef(220);

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

  const normalizeCharacter = useCallback(() => {
    const root = characterVisualRef.current;
    if (!root || normalizedCharacterRef.current) return;

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

    const box = new Box3().setFromObject(root);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);

    if (size.y > 0.0001) {
      const targetHeight = 1.55;
      const s = targetHeight / size.y;
      root.scale.setScalar(s);
      root.position.set(-center.x * s, -box.min.y * s + 0.02, -center.z * s);
      normalizedCharacterRef.current = true;
    }
  }, []);

  useEffect(() => {
    normalizeCharacter();
  }, [normalizeCharacter]);

  useFrame((_, delta) => {
    const laneTargetX = targetXRef.current;
    currentXRef.current = MathUtils.lerp(currentXRef.current, laneTargetX, 0.2);
    normalizeCharacter();

    if (characterRootRef.current) {
      characterRootRef.current.position.x = currentXRef.current;
      characterRootRef.current.position.z = RUNNER_Z;
    }

    if (cameraRef.current) {
      const camTargetX = MathUtils.lerp(cameraRef.current.position.x, currentXRef.current * 0.54, 0.14);
      cameraRef.current.position.x = camTargetX;
      cameraRef.current.lookAt(currentXRef.current * 0.28, 0.9, 0.9);
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

    for (let i = 0; i < roadSegmentsRef.current.length; i += 1) {
      const seg = roadSegmentsRef.current[i];
      if (!seg) continue;
      seg.position.z += speed * delta;
      if (seg.position.z > ROAD_WRAP_START) {
        seg.position.z -= ROAD_SEGMENT_LENGTH * ROAD_SEGMENT_COUNT;
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

    if (ENABLE_QUIZ && quizCompletedCount < requiredQuizCount) {
      const nextQuizTime = quizTimerRef.current - delta;
      quizTimerRef.current = nextQuizTime;
      setQuizTime(Math.max(0, nextQuizTime));

      if (nextQuizTime <= 0) {
        setIsQuizOpen(true);
        return;
      }
    }

    if (nextEnergy <= 0) {
      if (!lowEnergyHandledRef.current) {
        lowEnergyHandledRef.current = true;
        onLowEnergy();
      }
      return;
    }

    if (nextEnergy > 0 && lowEnergyHandledRef.current) {
      lowEnergyHandledRef.current = false;
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

    if (quizCompletedCount >= requiredQuizCount && finishRef.current) {
      finishRef.current.position.z = -finishDistanceRef.current + uiDistanceRef.current;
      if (finishRef.current.position.z >= RUNNER_Z - 0.6) {
        setHasFinished(true);
        setIsBlocked(true);
      }
    }
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 3.5, 8.7]} fov={66} near={0.1} far={220} />

      <color attach="background" args={['#7aa9df']} />
      <Suspense fallback={null}>
        <SkyBackdrop />
      </Suspense>
      <ambientLight intensity={0.9} />
      <directionalLight
        position={[8, 12, 8]}
        intensity={1.45}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.18, -20]} receiveShadow>
        <planeGeometry args={[9.8, 140]} />
        <meshStandardMaterial color="#1e293b" roughness={0.98} metalness={0.03} />
      </mesh>

      <group>
        <Suspense fallback={null}>
          <group
            ref={(el) => {
              roadSegmentsRef.current[0] = el;
            }}
          >
            <DirtRoad position={[0, -0.02, -20]} />
          </group>
          <group
            ref={(el) => {
              roadSegmentsRef.current[1] = el;
            }}
          >
            <DirtRoad position={[0, -0.02, -75]} />
          </group>
          <group
            ref={(el) => {
              roadSegmentsRef.current[2] = el;
            }}
          >
            <DirtRoad position={[0, -0.02, -130]} />
          </group>
        </Suspense>
      </group>

      {quizCompletedCount >= requiredQuizCount && (
        <group ref={finishRef} position={[0, 0, -220]}>
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[8, 4.2]} />
            <meshStandardMaterial color="#e2e8f0" roughness={0.92} metalness={0.04} />
          </mesh>

          <mesh position={[0, 0.03, 1.7]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[8, 0.35]} />
            <meshStandardMaterial color="#f8fafc" emissive="#f1f5f9" emissiveIntensity={0.08} />
          </mesh>

          <mesh position={[-2.9, 1.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.7, 3, 0.7]} />
            <meshStandardMaterial color="#334155" roughness={0.7} metalness={0.15} />
          </mesh>
          <mesh position={[2.9, 1.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.7, 3, 0.7]} />
            <meshStandardMaterial color="#334155" roughness={0.7} metalness={0.15} />
          </mesh>

          <mesh position={[0, 3.2, 0]} castShadow receiveShadow>
            <boxGeometry args={[6.5, 0.8, 0.8]} />
            <meshStandardMaterial color="#1d4ed8" emissive="#1e3a8a" emissiveIntensity={0.22} />
          </mesh>

          <mesh position={[0, 3.2, 0.41]}>
            <planeGeometry args={[4.2, 0.42]} />
            <meshStandardMaterial color="#dbeafe" emissive="#93c5fd" emissiveIntensity={0.18} />
          </mesh>

          <mesh position={[0, 1.45, -0.35]} castShadow receiveShadow>
            <boxGeometry args={[4.2, 2.9, 0.45]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.78} metalness={0.08} />
          </mesh>

          <mesh position={[-4.2, 0.7, -0.1]} castShadow>
            <cylinderGeometry args={[0.22, 0.3, 1.4, 12]} />
            <meshStandardMaterial color="#16a34a" roughness={0.86} />
          </mesh>
          <mesh position={[4.2, 0.7, -0.1]} castShadow>
            <cylinderGeometry args={[0.22, 0.3, 1.4, 12]} />
            <meshStandardMaterial color="#16a34a" roughness={0.86} />
          </mesh>
        </group>
      )}

      <ContactShadows position={[0, 0.05, RUNNER_Z]} opacity={0.45} scale={10} blur={2.3} far={9} />

      <DummyPlayers obstacles={obstacles} />

      <group ref={characterRootRef} position={[LANE_X[currentLane], RUNNER_Y, RUNNER_Z]} rotation={[0, 0, 0]}>
        <Suspense fallback={<CharacterFallback />}>
          <group ref={characterVisualRef} rotation={[0, Math.PI, 0]}>
            <Mychar />
          </group>
        </Suspense>
      </group>

      {obstacles.map((obs) => (
        <Suspense key={obs.id} fallback={null}>
          <RoadBarrier position={[LANE_X[obs.lane], 0, obs.z]} />
        </Suspense>
      ))}

      {coins.map((coin) => (
        <Suspense key={coin.id} fallback={null}>
          <CoinModel position={[LANE_X[coin.lane], 0.45, coin.z]} />
        </Suspense>
      ))}
    </>
  );
}

export default function Home() {
  const [isBootLoading, setIsBootLoading] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootMessage, setBootMessage] = useState('Loading game assets...');
  const [questionBank, setQuestionBank] = useState(FALLBACK_QUESTION_BANK);
  const [remainingQuestions, setRemainingQuestions] = useState([]);
  const [questionSource, setQuestionSource] = useState('fallback');
  const [showWorldMap, setShowWorldMap] = useState(true);
  const [selectedStage, setSelectedStage] = useState(null);

  const [currentLane, setCurrentLane] = useState(1);
  const [targetX, setTargetX] = useState(0);

  const [gameSpeed, setGameSpeed] = useState(BASE_GAME_SPEED);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [hasFinished, setHasFinished] = useState(false);
  const [quizCompletedCount, setQuizCompletedCount] = useState(0);
  const [requiredQuizCount, setRequiredQuizCount] = useState(ENABLE_QUIZ ? QUIZ_CHECKPOINTS_REQUIRED : 0);

  const [energy, setEnergy] = useState(100);
  const [score, setScore] = useState(0);
  const [distance, setDistance] = useState(0);
  const [quizTime, setQuizTime] = useState(QUIZ_DURATION);
  const [quizRound, setQuizRound] = useState([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizCorrectCount, setQuizCorrectCount] = useState(0);
  const [totalCorrectCount, setTotalCorrectCount] = useState(0);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState('');

  const [obstacles, setObstacles] = useState([]);
  const [coins, setCoins] = useState([]);

  const obstacleIdRef = useRef(1);
  const coinIdRef = useRef(1);
  const rootRef = useRef(null);
  const swipeStartXRef = useRef(null);
  const quizCorrectRef = useRef(0);
  const totalCorrectRef = useRef(0);
  const obstacleStateRef = useRef(obstacles);
  const coinStateRef = useRef(coins);

  useEffect(() => {
    let mounted = true;

    const loadQuestions = async () => {
      try {
        const res = await fetch('/api/game-questions');
        if (!res.ok) return { questions: FALLBACK_QUESTION_BANK, source: 'fallback' };
        const payload = await res.json();
        if (!payload?.questions || payload.questions.length < QUIZ_QUESTIONS_PER_CHECKPOINT) {
          return { questions: FALLBACK_QUESTION_BANK, source: 'fallback' };
        }
        return {
          questions: payload.questions,
          source: payload.source || 'db',
        };
      } catch {
        return { questions: FALLBACK_QUESTION_BANK, source: 'fallback' };
      }
    };

    const runBoot = async () => {
      try {
        setBootProgress(20);
        setBootMessage('Fetching quiz questions...');
        const questionPayload = await loadQuestions();
        if (mounted) {
          setQuestionBank(questionPayload.questions);
          setQuestionSource(questionPayload.source);
        }

        setBootProgress(55);
        setBootMessage('Finalizing game startup...');

        const loadingDone = new Promise((resolve) => {
          const prevOnLoad = DefaultLoadingManager.onLoad;
          const prevOnProgress = DefaultLoadingManager.onProgress;

          DefaultLoadingManager.onProgress = (_, loaded, total) => {
            if (!mounted || total <= 0) return;
            const pct = Math.min(95, Math.max(55, Math.floor((loaded / total) * 95)));
            setBootProgress(pct);
          };

          DefaultLoadingManager.onLoad = () => {
            if (!mounted) return;
            setBootProgress(100);
            DefaultLoadingManager.onLoad = prevOnLoad;
            DefaultLoadingManager.onProgress = prevOnProgress;
            resolve();
          };

          // If assets are already loaded, don't block boot.
          window.setTimeout(resolve, 700);
        });

        await loadingDone;
      } finally {
        if (mounted) {
          window.setTimeout(() => {
            if (!mounted) return;
            setIsBootLoading(false);
          }, 250);
        }
      }
    };

    runBoot();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    obstacleStateRef.current = obstacles;
  }, [obstacles]);

  useEffect(() => {
    coinStateRef.current = coins;
  }, [coins]);

  useEffect(() => {
    const initialPool = shuffleList(questionBank).slice(0, Math.min(TOTAL_QUIZ_QUESTIONS, questionBank.length));
    setRemainingQuestions(initialPool);
  }, [questionBank]);

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

        const spawnZ = -20;
        const occupiedLanes = new Set(prev.map((o) => o.lane));
        const lanesWithCoinNearSpawn = new Set(
          coinStateRef.current
            .filter((c) => Math.abs(c.z - spawnZ) <= COIN_COIN_SAFE_GAP)
            .map((c) => c.lane)
        );
        const lanePool = [0, 1, 2].filter((l) => !occupiedLanes.has(l));
        const safePool = lanePool.filter((l) => !lanesWithCoinNearSpawn.has(l));
        const finalPool = safePool.length > 0 ? safePool : lanePool.length > 0 ? lanePool : [0, 1, 2];
        const lane = finalPool[Math.floor(Math.random() * finalPool.length)];

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
      const spawnZ = -22;
      const blockedByObstacle = new Set(
        obstacleStateRef.current
          .filter((o) => Math.abs(o.z - spawnZ) <= COIN_OBSTACLE_SAFE_GAP)
          .map((o) => o.lane)
      );
      const blockedByCoin = new Set(
        coinStateRef.current
          .filter((c) => Math.abs(c.z - spawnZ) <= COIN_COIN_SAFE_GAP)
          .map((c) => c.lane)
      );

      const candidateLanes = [0, 1, 2].filter(
        (lane) => !blockedByObstacle.has(lane) && !blockedByCoin.has(lane)
      );
      if (candidateLanes.length === 0) return;

      const lane = candidateLanes[Math.floor(Math.random() * candidateLanes.length)];
      const coin = { id: coinIdRef.current, lane, z: -22 };
      coinIdRef.current += 1;
      setCoins((prev) => [...prev, coin]);
    }, 1200);
    return () => clearInterval(id);
  }, [isGameOver, isQuizOpen, hasFinished]);

  useEffect(() => {
    if (!ENABLE_QUIZ) return;
    if (!isQuizOpen) return;
    setRemainingQuestions((prev) => {
      let source = prev;
      if (source.length === 0) {
        source = shuffleList(questionBank).slice(0, Math.min(TOTAL_QUIZ_QUESTIONS, questionBank.length));
      }

      const nextRound = source.slice(0, QUIZ_QUESTIONS_PER_CHECKPOINT);
      const left = source.slice(nextRound.length);

      setQuizRound(nextRound);
      setQuizIndex(0);
      setQuizCorrectCount(0);
      quizCorrectRef.current = 0;
      setQuizAnswered(false);
      setSelectedAnswer('');

      return left;
    });
  }, [isQuizOpen, questionBank]);

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
        // Positive dx means finger moved right, negative means moved left.
        shiftLaneByDirection(dx > 0);
      } else {
        const mid = window.innerWidth / 2;
        shiftLaneByDirection(e.clientX >= mid);
      }

      swipeStartXRef.current = null;
    },
    [isGameOver, isQuizOpen, hasFinished, shiftLaneByDirection]
  );

  const resetRunState = useCallback(() => {
    setCurrentLane(1);
    setTargetX(0);
    setGameSpeed(BASE_GAME_SPEED);
    setIsGameOver(false);
    setIsQuizOpen(false);
    setIsBlocked(false);
    setHasFinished(false);
    setQuizCompletedCount(0);
    setRequiredQuizCount(ENABLE_QUIZ ? QUIZ_CHECKPOINTS_REQUIRED : 0);
    setEnergy(100);
    setScore(0);
    setDistance(0);
    setQuizTime(QUIZ_DURATION);
    setObstacles([]);
    setCoins([]);
    obstacleIdRef.current = 1;
    coinIdRef.current = 1;
    setQuizRound([]);
    setRemainingQuestions(shuffleList(questionBank).slice(0, Math.min(TOTAL_QUIZ_QUESTIONS, questionBank.length)));
    setQuizIndex(0);
    setQuizCorrectCount(0);
    setTotalCorrectCount(0);
    quizCorrectRef.current = 0;
    totalCorrectRef.current = 0;
    setQuizAnswered(false);
    setSelectedAnswer('');
  }, [questionBank]);

  const handleStartFromMap = useCallback(
    (stageId, stageName) => {
      setSelectedStage({ id: stageId, name: stageName });
      resetRunState();
      setShowWorldMap(false);
    },
    [resetRunState]
  );

  const restartGame = useCallback(() => {
    resetRunState();
  }, [resetRunState]);

  const activeQuestion = quizRound[quizIndex] || questionBank[0] || FALLBACK_QUESTION_BANK[0];

  const onAnswerQuiz = (picked) => {
    if (quizAnswered || !activeQuestion) return;

    const isCorrect = picked === activeQuestion.correctAnswer;
    setQuizAnswered(true);
    setSelectedAnswer(picked);

    if (isCorrect) {
      setQuizCorrectCount((v) => {
        const nv = v + 1;
        quizCorrectRef.current = nv;
        return nv;
      });

      setTotalCorrectCount((v) => {
        const nv = v + 1;
        totalCorrectRef.current = nv;
        return nv;
      });
    }
  };

  const handleLowEnergy = useCallback(() => {
    // Keep a fixed 6-question flow: low energy recovery should not open extra quizzes.
    setScore((s) => Math.max(0, s - 10));
    setEnergy(35);
  }, []);

  useEffect(() => {
    if (!ENABLE_QUIZ) return;
    if (!isQuizOpen || !quizAnswered) return;

    const timer = window.setTimeout(() => {
      if (quizIndex < QUIZ_QUESTIONS_PER_CHECKPOINT - 1 && quizIndex < quizRound.length - 1) {
        setQuizIndex((i) => i + 1);
        setQuizAnswered(false);
        setSelectedAnswer('');
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
      setSelectedAnswer('');
    }, 650);

    return () => window.clearTimeout(timer);
  }, [isQuizOpen, quizAnswered, quizIndex, quizRound.length]);

  const userLeaderboardRank = useMemo(() => {
    const correct = Math.min(TOTAL_QUIZ_QUESTIONS, totalCorrectRef.current || totalCorrectCount);
    if (correct >= 6) return 1;
    if (correct === 5) return 2;
    if (correct === 4) return 3;
    if (correct === 3) return 4;
    if (correct === 2) return 5;
    return 6;
  }, [totalCorrectCount]);

  const leaderboardRows = useMemo(() => {
    const names = ['Nova', 'RiderX', 'Ayaan', 'Skye', 'Bolt', 'Milo', 'Veda', 'Zara'];
    const shuffled = [...names].sort(() => Math.random() - 0.5);
    const rows = [];
    const userCorrect = Math.min(TOTAL_QUIZ_QUESTIONS, totalCorrectRef.current || totalCorrectCount);

    for (let rank = 1; rank <= 8; rank += 1) {
      if (rank === userLeaderboardRank) {
        rows.push({
          rank,
          name: 'You',
          correct: userCorrect,
          badge: rank === 1 ? 'Champion' : rank === 2 ? 'Runner-up' : 'Contender',
          isUser: true,
        });
      } else {
        const strongBias = Math.max(0, Math.min(TOTAL_QUIZ_QUESTIONS, 7 - rank));
        rows.push({
          rank,
          name: shuffled[rows.length % shuffled.length],
          correct: strongBias,
          badge: rank <= 3 ? 'Pro' : 'Racer',
          isUser: false,
        });
      }
    }

    return rows;
  }, [totalCorrectCount, userLeaderboardRank]);

  if (showWorldMap) {
    return (
      <WorldMap
        onGameStart={handleStartFromMap}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      className="relative h-screen w-full overflow-hidden bg-slate-900 touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      <Canvas shadows={{ type: PCFShadowMap }} dpr={[1, 2]}>
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
          requiredQuizCount={requiredQuizCount}
          onLowEnergy={handleLowEnergy}
          setHasFinished={setHasFinished}
        />
      </Canvas>

      <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 px-2 pt-[max(0.4rem,env(safe-area-inset-top))]">
        <div className="mx-auto w-full max-w-3xl rounded-xl border border-white/10 bg-black/65 px-3 pb-2 pt-2 shadow-lg backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-200 sm:text-xs">
            <span>Energy</span>
            <span>{Math.ceil(energy)}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-none bg-slate-700/80">
            <div
              className="h-full rounded-none bg-linear-to-r from-emerald-400 via-lime-300 to-yellow-300 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, energy))}%` }}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-white sm:text-sm">
            <span className="truncate">Score: {score}</span>
            <span className="truncate">Distance: {Math.floor(distance)} m</span>
            <span className="truncate">
              {ENABLE_QUIZ
                ? quizCompletedCount < requiredQuizCount
                  ? `Checkpoint ${quizCompletedCount + 1}/${requiredQuizCount}`
                  : 'Finish Unlocked'
                : 'Run Mode'}
            </span>
          </div>
          {selectedStage?.name && (
            <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-cyan-300 sm:text-xs">
              Stage: {selectedStage.name}
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowWorldMap(true)}
        className="absolute left-3 top-[max(0.5rem,env(safe-area-inset-top))] z-40 rounded-lg border border-slate-400/50 bg-slate-900/80 px-3 py-1.5 text-xs font-bold tracking-wide text-slate-100 backdrop-blur-sm hover:border-cyan-400/70 hover:text-cyan-200"
      >
        World Map
      </button>

      {isBlocked && !isQuizOpen && !isGameOver && !hasFinished && (
        <div className="pointer-events-none absolute inset-x-0 top-[4.6rem] z-30 flex justify-center px-2">
          <div className="max-w-md rounded-full border border-amber-300/60 bg-amber-900/80 px-4 py-2 text-center text-xs font-bold text-amber-100 backdrop-blur-sm">
            Obstacle in lane - swipe to side lane to continue
          </div>
        </div>
      )}

      {hasFinished && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-linear-to-br from-slate-900 to-slate-800 p-6 text-white shadow-2xl">
            <h2 className="text-3xl font-black text-center">Success! School Entry Reached</h2>
            <p className="mt-2 text-center text-slate-300">
              Final Quiz Score: {Math.min(TOTAL_QUIZ_QUESTIONS, totalCorrectCount)}/{TOTAL_QUIZ_QUESTIONS}
            </p>
            <p className="mt-1 text-center text-amber-300 font-semibold">You finished at Rank #{userLeaderboardRank}</p>

            <div className="mt-5 rounded-xl border border-white/10 bg-black/25 p-4">
              <h3 className="text-lg font-extrabold tracking-wide text-center text-cyan-300">Leaderboard</h3>
              <div className="mt-3 space-y-2">
                {leaderboardRows.map((row) => (
                  <div
                    key={`${row.rank}-${row.name}`}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                      row.isUser
                        ? 'bg-emerald-500/20 border border-emerald-300/40'
                        : 'bg-slate-700/40 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 text-center font-black text-amber-300">#{row.rank}</span>
                      <span className={`font-bold ${row.isUser ? 'text-emerald-200' : 'text-slate-100'}`}>
                        {row.name}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-100">{row.correct}/{TOTAL_QUIZ_QUESTIONS}</div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-300">{row.badge}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

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

      {/* Quiz UI is temporarily disabled while gameplay is being tuned. */}
      {ENABLE_QUIZ && isQuizOpen && !isGameOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/75 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white p-6 shadow-2xl">
            <h2 className="mt-3 text-center text-2xl font-black text-slate-900">{activeQuestion.question}</h2>
            <p className="mt-2 text-center text-sm text-slate-600">
              Question {Math.min(quizIndex + 1, QUIZ_QUESTIONS_PER_CHECKPOINT)} of {QUIZ_QUESTIONS_PER_CHECKPOINT}
            </p>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activeQuestion.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onAnswerQuiz(opt)}
                  disabled={quizAnswered}
                  className={`rounded-xl border px-4 py-3 text-left text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-100 ${
                    quizAnswered
                      ? opt === selectedAnswer
                        ? 'border-sky-400 bg-sky-100 text-sky-900'
                        : 'border-slate-200 bg-slate-50 text-slate-500'
                      : 'border-slate-200 bg-slate-50 text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>

            {quizAnswered && (
              <div className="mt-4 text-center">
                <p className="text-xs font-medium text-slate-500">Loading next question...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {isBootLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900/95 p-6 text-white shadow-2xl">
            <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-sky-300">RizzRunner</p>
            <h2 className="mt-2 text-center text-2xl font-black">Preparing Game</h2>
            <p className="mt-2 text-center text-sm text-slate-300">{bootMessage}</p>
            <p className="mt-1 text-center text-xs text-slate-400">
              Question source: {questionSource === 'db' ? 'Database (public.game)' : 'Fallback local set'}
            </p>
            <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-linear-to-r from-cyan-400 via-emerald-400 to-lime-300 transition-all duration-300"
                style={{ width: `${bootProgress}%` }}
              />
            </div>
            <p className="mt-2 text-center text-xs font-semibold text-slate-200">{bootProgress}%</p>
          </div>
        </div>
      )}

    </div>
  );
}
