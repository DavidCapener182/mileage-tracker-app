import type { ReactNode } from "react"

export function DashboardShell({ header, children }: { header: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4 sm:space-y-6 pb-20 md:pb-0">
      <div className="sticky top-[calc(env(safe-area-inset-top)+5.5rem)] z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
        {header}
      </div>
      {children}
    </section>
  )
}
