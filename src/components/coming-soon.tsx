export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">This view is being built and will be available soon.</p>
    </div>
  );
}
