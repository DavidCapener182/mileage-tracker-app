import { KpiCard } from "./kpi-card"

type KpiSummaryProps = {
  miles: string
  reimbursement: string
  reimbursementRate?: string
  chargeOut: string
  trips: string
}

export function KpiSummary({ miles, reimbursement, reimbursementRate, chargeOut, trips }: KpiSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard label="Miles this period" value={miles} />
      <KpiCard
        label="Your reimbursement"
        value={reimbursement}
        hint={reimbursementRate ? `Default: ${reimbursementRate} per mile` : undefined}
      />
      <KpiCard label="Company charge-out" value={chargeOut} hint="£0.25 per mile" />
      <KpiCard label="Trips" value={trips} />
    </div>
  )
}
