import { useEffect, useState } from 'react';
import Image from 'next/image';

const MAP_WIDTH = 1125;
const MAP_HEIGHT = 2436;

const STAGES = [
  { id: 1, name: 'Stage 1', unlocked: true, x: 67.4, y: 92.5 },
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
        className="relative rounded-full bg-transparent active:scale-95"
        style={{
          width: 'clamp(44px, 11vw, 64px)',
          height: 'clamp(44px, 11vw, 64px)',
        }}
        aria-label={stage.name}
      >
        {stage.unlocked && stage.id !== 1 && (
          <span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              boxShadow: '0 0 0 2px rgba(255,255,255,0.28), 0 0 20px rgba(34,197,94,0.42)',
              animation: 'mapPulse 1.7s ease-in-out infinite',
            }}
          />
        )}
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
    <div className="fixed inset-0 overflow-hidden bg-[#9dcc35]">
      <style jsx>{`
        @keyframes mapPulse {
          0%,
          100% {
            transform: scale(0.95);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.05);
            opacity: 1;
          }
        }
      `}</style>

      <div className="relative flex h-full w-full items-center justify-center">
        <div
          className="relative overflow-hidden"
          style={{
            aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
            width: `min(100vw, calc(100dvh * ${MAP_WIDTH} / ${MAP_HEIGHT}))`,
            height: `min(100dvh, calc(100vw * ${MAP_HEIGHT} / ${MAP_WIDTH}))`,
          }}
        >
          <Image
            src="/map.png"
            alt="World map"
            fill
            priority
            sizes="(max-width: 768px) 100vw, 46vw"
            className="object-contain"
          />

          <div className="absolute inset-0">
            {STAGES.map((stage, index) => (
              <StageHotspot key={stage.id} stage={stage} index={index} ready={ready} onPress={handlePressStage} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
