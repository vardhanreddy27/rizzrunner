/*
FastRun Character Component
Generated from: FastRun.glb with proper skeleton handling
*/

import React, { useEffect } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import * as THREE from 'three'

useGLTF.preload('/FastRun.glb')

function Model(props) {
  const group = React.useRef()
  const { scene, animations } = useGLTF('/FastRun.glb')
  
  // Properly clone the entire scene with its hierarchy
  const clone = React.useMemo(() => {
    const cloned = SkeletonUtils.clone(scene);
    return cloned;
  }, [scene])

  // Use animations on the cloned scene
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) return;

    const actionNames = Object.keys(actions);
    Object.values(actions).forEach((action) => {
      if (action) action.stop();
    });

    const firstAction = actions[actionNames[0]];
    if (!firstAction) return;
    firstAction.reset();
    firstAction.loop = THREE.LoopRepeat;
    firstAction.clampWhenFinished = false;
    firstAction.play();
  }, [actions])

  return (
    <group ref={group} {...props} dispose={null}>
      <primitive object={clone} />
    </group>
  )
}

export default Model




