'use client';

import { memo, useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Mychar from './Mychar';

// Constants (must match RizzRunnerGame.js)
const LANE_MIN = -5;
const LANE_MAX = 5;
const LANE_STEP = 2.5;
const LERP_PER_SEC = 10;
const TILE_LEN = 20;

// Companion AI constants
const LOOKAHEAD_DISTANCE = 7.5; // How far ahead companion looks for obstacles
const LANE_CHANGE_COOLDOWN = 0.5; // Minimum time between lane changes
const CHANGE_INTERVAL = 3.0; // Max time before companion considers changing lanes

const CompanionPlayer = memo(function CompanionPlayer({
  initialLane,
  scrollRef,
  pausedRef,
  obstaclesData,
}) {
  const groupRef = useRef();
  const targetXRef = useRef(initialLane);
  const currentXRef = useRef(initialLane);
  const lastLaneChangeRef = useRef(0);
  const lastCheckTimeRef = useRef(0);

  // Initialize refs with proper values
  const positionInitializedRef = useRef(false);
  if (!positionInitializedRef.current && groupRef.current) {
    groupRef.current.position.set(initialLane, 0, 0);
    positionInitializedRef.current = true;
  }

  // AI: Detect upcoming obstacles and dodge them
  const checkObstacles = (currentZ, currentLane) => {
    if (!obstaclesData || obstaclesData.length === 0) return false;

    const phase = THREE.MathUtils.euclideanModulo(scrollRef.current, TILE_LEN * 4);

    // Check each obstacle to see if it's in the lookahead zone
    for (let i = 0; i < obstaclesData.length; i++) {
      const o = obstaclesData[i];
      const obstacleZ = o.z0 + phase;
      const distanceAhead = obstacleZ - currentZ;

      // Is this obstacle coming up in our lookahead window?
      if (distanceAhead > -2 && distanceAhead < LOOKAHEAD_DISTANCE) {
        // Is it in our current lane?
        const dx = Math.abs(currentLane - o.x);
        if (dx < o.w * 0.5 + 0.5) {
          // Dangerous! Need to move lanes
          return true;
        }
      }
    }

    return false;
  };

  // Find safe lane to move to (avoiding obstacles)
  const findSafeLane = (currentZ, currentLane) => {
    if (!obstaclesData || obstaclesData.length === 0) return currentLane;

    const phase = THREE.MathUtils.euclideanModulo(scrollRef.current, TILE_LEN * 4);
    const possibleLanes = [LANE_MIN, LANE_MIN + LANE_STEP, 0, LANE_MAX - LANE_STEP, LANE_MAX];

    // Filter out current lane and find safe lanes
    const safeLanes = possibleLanes.filter((lane) => {
      if (Math.abs(lane - currentLane) < 0.1) return false; // Current lane

      // Check if any obstacle blocks this lane
      for (let i = 0; i < obstaclesData.length; i++) {
        const o = obstaclesData[i];
        const obstacleZ = o.z0 + phase;
        const distanceAhead = obstacleZ - currentZ;

        if (distanceAhead > -2 && distanceAhead < LOOKAHEAD_DISTANCE) {
          const dx = Math.abs(lane - o.x);
          if (dx < o.w * 0.5 + 0.5) {
            return false; // Blocked
          }
        }
      }

      return true; // Safe
    });

    if (safeLanes.length === 0) return currentLane;
    return safeLanes[Math.floor(Math.random() * safeLanes.length)];
  };

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const g = groupRef.current;
    const now = state.clock.getElapsedTime();

    // AI: Check for obstacles and change lanes if needed
    if (now - lastCheckTimeRef.current > CHANGE_INTERVAL) {
      lastCheckTimeRef.current = now;

      const currentLane = currentXRef.current;
      const companionZ = scrollRef.current; // Companion always at player's scroll position

      if (checkObstacles(companionZ, currentLane)) {
        if (now - lastLaneChangeRef.current > LANE_CHANGE_COOLDOWN) {
          targetXRef.current = findSafeLane(companionZ, currentLane);
          lastLaneChangeRef.current = now;
        }
      }
    }

    // Smooth lane transition (lerp)
    const t = targetXRef.current;
    const k = 1 - Math.exp(-LERP_PER_SEC * delta);
    currentXRef.current += (t - currentXRef.current) * k;

    // Update position (must update all coordinates)
    g.position.x = currentXRef.current;
    g.position.y = 0;
    g.position.z = 0;
  });

  return (
    <group 
      ref={groupRef} 
      position={[initialLane, 0, 0]}
      rotation={[0, Math.PI, 0]} 
      scale={[0.008, 0.008, 0.008]}
    >
      <Mychar />
    </group>
  );
});

export default CompanionPlayer;
