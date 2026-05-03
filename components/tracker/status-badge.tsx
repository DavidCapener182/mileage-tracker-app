import type { EntryStatus } from "@/lib/mileage/types"

export function StatusBadge({ status }: { status: EntryStatus }) {
  const styles = {
    draft: "bg-slate-100 text-slate-700",
    submitted: "bg-indigo-100 text-indigo-700",
    paid: "bg-emerald-100 text-emerald-700",
  }
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[status]}`}>{status}</span>
}
