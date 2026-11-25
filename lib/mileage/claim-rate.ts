// Rates are entered in pounds per mile (e.g. 0.21 means 21p).
export const DEFAULT_CLAIM_RATE = "0.21"
export const CLAIM_RATE_HELP = "Enter a rate below £1 per mile in pounds, for example 0.21 for 21p."

export function parseClaimRate(input: string): number | null {
  const value = input.trim()
  if (!/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/.test(value)) return null
  const rate = Number(value)
  return rate < 1 ? rate : null
}

export function claimForMiles(miles: string, rate: string): string | null {
  const parsedRate = parseClaimRate(rate)
  const distance = Number(miles)
  if (parsedRate === null || !miles.trim() || !Number.isFinite(distance) || distance < 0) return null
  return (distance * parsedRate).toFixed(2)
}
