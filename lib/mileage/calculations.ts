import type { TrackerEntry } from "./types"

export const REIMBURSEMENT_RATE = 0.14
export const CHARGE_OUT_RATE = 0.25

export const calculateKpis = (entries: TrackerEntry[]) => {
  return entries.reduce(
    (acc, entry) => {
      acc.miles += Number.parseFloat(entry.totalMiles) || 0
      acc.reimbursement += Number.parseFloat(entry.totalClaim) || 0
      acc.chargeOut += Number.parseFloat(entry.totalCharge) || 0
      acc.trips += 1
      return acc
    },
    { miles: 0, reimbursement: 0, chargeOut: 0, trips: 0 },
  )
}
