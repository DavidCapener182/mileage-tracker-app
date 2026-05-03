import type { ReactNode } from "react"

export function EntryCard({ children, highlight = false }: { children: ReactNode; highlight?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${highlight ? "ring-2 ring-emerald-100" : ""}`}>
      {children}
    </div>
  )
}
