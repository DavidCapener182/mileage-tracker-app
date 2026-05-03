import type { ReactNode } from "react"

export function EntryTable({ children }: { children: ReactNode }) {
  return <div className="hidden xl:block overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">{children}</div>
}
