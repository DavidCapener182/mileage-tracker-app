import type { ReactNode } from "react"

export function EntryList({ desktop, mobile }: { desktop: ReactNode; mobile: ReactNode }) {
  return (
    <>
      <div className="hidden xl:block">{desktop}</div>
      <div className="xl:hidden">{mobile}</div>
    </>
  )
}
