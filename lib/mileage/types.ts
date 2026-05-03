export type EntryStatus = "draft" | "submitted" | "paid"

export interface TrackerEntry {
  id: string
  date: string
  startPoint: string
  startPostcode?: string
  stop1?: string
  stop2?: string
  stop3?: string
  stop4?: string
  finishPoint: string
  finishPostcode?: string
  clientsVisited?: string
  totalMiles: string
  totalClaim: string
  totalCharge: string
  status?: EntryStatus
}
