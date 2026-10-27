// Placeholder for slice 1. The real layout, chat, products and quiz views
// arrive in later slices.
export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-3xl font-semibold text-teal-700">Mia</h1>
      <p className="text-slate-600">Product Learning Assistant is being set up.</p>
      <p className="text-xs text-slate-500">
        Mia is a learning tool and does not replace advice from a pharmacist or doctor.
      </p>
    </main>
  );
}
