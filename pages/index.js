import dynamic from 'next/dynamic';

const RizzRunnerGame = dynamic(() => import('../components/RizzRunnerGame'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-0 flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-gradient-to-b from-sky-300 to-sky-100 px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-600 border-t-transparent" aria-hidden />
      <p className="text-base font-semibold text-slate-800">Starting game…</p>
      <p className="max-w-sm text-sm text-slate-600">
        If this takes long on mobile, the 3D model is still downloading.
      </p>
    </div>
  ),
});

export default function Home() {
  return <RizzRunnerGame />;
}
