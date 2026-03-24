import { useEffect, useState } from 'react';
import Image from 'next/image';

const STAGES = [
  { id: 1, name: 'Stage 1', unlocked: true, x: 67.4, y: 93.4 },
  { id: 2, name: 'Stage 2', unlocked: false, x: 37.7, y: 85.1 },
  { id: 3, name: 'Stage 3', unlocked: false, x: 25.4, y: 71.7 },
  { id: 4, name: 'Stage 4', unlocked: false, x: 52.7, y: 56.8 },
  { id: 5, name: 'Stage 5', unlocked: false, x: 63.8, y: 42.8 },
  { id: 6, name: 'Stage 6', unlocked: false, x: 29.6, y: 31.1 },
  { id: 7, name: 'Stage 7', unlocked: false, x: 44.8, y: 13.8 },
];

function StageHotspot({ stage, index, ready, onPress }) {
  const scale = ready ? 1 : 0.85;

  return (
    <div
      className="absolute"
      style={{
        left: `${stage.x}%`,
        top: `${stage.y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        opacity: ready ? 1 : 0,
        transition: 'transform 360ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 360ms ease',
        transitionDelay: `${index * 65}ms`,
      }}
    >
      <button
        type="button"
        onClick={() => onPress(stage)}
        className="relative h-[13vw] w-[13vw] max-h-[62px] max-w-[62px] min-h-[44px] min-w-[44px] rounded-full bg-transparent active:scale-95"
        aria-label={stage.name}
      >
        {!stage.unlocked && (
          <Image
            src="/lock.png"
            alt="Locked"
            width={24}
            height={24}
            className="pointer-events-none absolute -right-1 -top-1 h-6 w-6 object-contain drop-shadow-[0_3px_6px_rgba(0,0,0,0.55)]"
          />
        )}
      </button>
    </div>
  );
}

export default function WorldMap({ onGameStart }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 40);
    return () => window.clearTimeout(id);
  }, []);

  const handlePressStage = (stage) => {
    if (!stage.unlocked) return;
    onGameStart(stage.id, stage.name);
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      <div className="relative h-full w-full overflow-hidden">
        <Image src="/map.png" alt="World map" fill priority sizes="100vw" className="object-fill" />

        <div className="absolute inset-0">
          {STAGES.map((stage, index) => (
            <StageHotspot key={stage.id} stage={stage} index={index} ready={ready} onPress={handlePressStage} />
          ))}
        </div>
      </div>
    </div>
  );
}
