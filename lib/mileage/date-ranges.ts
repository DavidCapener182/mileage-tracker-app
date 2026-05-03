export const getClaimMonthDateRange = (monthKey: string) => {
  const parsed = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  const year = parsed.getFullYear()
  const monthIndex = parsed.getMonth()
  const start = new Date(year, monthIndex - 1, 23)
  const end = new Date(year, monthIndex, 23)
  const toDateKey = (value: Date) => {
    const month = `${value.getMonth() + 1}`.padStart(2, "0")
    const day = `${value.getDate()}`.padStart(2, "0")
    return `${value.getFullYear()}-${month}-${day}`
  }
  return { start: toDateKey(start), end: toDateKey(end) }
}

export const getClaimMonthRangeLabel = (monthKey: string) => {
  const range = getClaimMonthDateRange(monthKey)
  if (!range) return ""
  const formatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })
  return `${formatter.format(new Date(`${range.start}T00:00:00`))} – ${formatter.format(new Date(`${range.end}T00:00:00`))}`
}
