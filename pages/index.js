import dynamic from 'next/dynamic';

const RizzRunnerGame = dynamic(() => import('../components/RizzRunnerGame'), {
  ssr: false,
  loading: () => (
    <div
      className="fixed inset-0 z-0 min-h-dvh bg-linear-to-b from-sky-300 to-sky-100"
      aria-hidden
    />
  ),
});

export default function Home() {
  return <RizzRunnerGame />;
}
