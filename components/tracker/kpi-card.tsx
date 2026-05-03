export function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>
}
