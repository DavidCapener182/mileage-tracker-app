#!/usr/bin/env node

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const APPLY_CHANGES = process.env.APPLY_CHANGES === "1"
const USE_MAPS_FALLBACK = process.env.USE_MAPS_FALLBACK !== "0"
const ENTRY_LIMIT = Number.parseInt(process.env.ENTRY_BACKFILL_LIMIT || "5000", 10)

if (!SUPABASE_URL) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL")
  process.exit(1)
}
if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
}

const normalize = (value) => String(value || "").trim().toLowerCase()
const routeKey = (userid, from, to) => `${normalize(userid)}::${normalize(from)}::${normalize(to)}`
const reversibleKey = (userid, a, b) => {
  const left = normalize(a)
  const right = normalize(b)
  return left <= right ? `${normalize(userid)}::${left}::${right}` : `${normalize(userid)}::${right}::${left}`
}
const parseMiles = (value) => {
  const n = Number.parseFloat(String(value || ""))
  return Number.isFinite(n) ? n : null
}
const formatAddress = (location) =>
  [location?.address, location?.city, location?.postcode].filter(Boolean).join(", ").trim() || location?.name || ""

const fetchJson = async (url, init = {}) => {
  const response = await fetch(url, init)
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  return { response, data, text }
}

const getGoogleMapsMiles = async (origin, destination) => {
  if (!MAPS_API_KEY) return { miles: null, error: "No MAPS API key configured" }
  const endpoint = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${encodeURIComponent(MAPS_API_KEY)}`
  const { response, data, text } = await fetchJson(endpoint)
  if (!response.ok) {
    return { miles: null, error: `HTTP ${response.status}: ${text.slice(0, 200)}` }
  }
  if (data?.status !== "OK") {
    return { miles: null, error: `Maps status ${data?.status || "UNKNOWN"}` }
  }
  const meters =
    data?.routes?.[0]?.legs?.reduce((sum, leg) => sum + (leg?.distance?.value || 0), 0) || 0
  if (!meters || meters <= 0) {
    return { miles: null, error: "No distance returned" }
  }
  return { miles: Number((meters / 1609.344).toFixed(1)), error: null }
}

const getEntryLegs = (entry) => {
  const points = [entry.startPoint, entry.stop1, entry.stop2, entry.stop3, entry.stop4, entry.finishPoint]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
  const legs = []
  for (let i = 0; i < points.length - 1; i += 1) {
    legs.push({ from: points[i], to: points[i + 1] })
  }
  return legs
}

const main = async () => {
  const entriesUrl =
    `${SUPABASE_URL}/rest/v1/mt_entries?select=id,userid,date,startPoint,stop1,stop2,stop3,stop4,finishPoint,totalMiles,claimRate,chargeRate,totalClaim,totalCharge` +
    `&order=date.desc,id.desc&limit=${ENTRY_LIMIT}`
  const routesUrl = `${SUPABASE_URL}/rest/v1/mt_saved_routes?select=userid,from,to,distance&limit=5000`
  const locationsUrl = `${SUPABASE_URL}/rest/v1/mt_locations?select=userid,name,address,city,postcode&limit=5000`

  const [{ response: entriesRes, data: entriesData, text: entriesText }, { response: routesRes, data: routesData, text: routesText }, { response: locRes, data: locData, text: locText }] =
    await Promise.all([
      fetchJson(entriesUrl, { headers }),
      fetchJson(routesUrl, { headers }),
      fetchJson(locationsUrl, { headers }),
    ])

  if (!entriesRes.ok) throw new Error(`Could not read entries: ${entriesRes.status} ${entriesText}`)
  if (!routesRes.ok) throw new Error(`Could not read saved_routes: ${routesRes.status} ${routesText}`)
  if (!locRes.ok) throw new Error(`Could not read locations: ${locRes.status} ${locText}`)

  const entries = Array.isArray(entriesData) ? entriesData : []
  const savedRoutes = Array.isArray(routesData) ? routesData : []
  const locations = Array.isArray(locData) ? locData : []

  if (entries.length === 0) {
    console.log("No entries found.")
    return
  }

  const routeDistanceMap = new Map()
  for (const route of savedRoutes) {
    const miles = parseMiles(route.distance)
    if (miles == null) continue
    const key = reversibleKey(route.userid, route.from, route.to)
    if (!routeDistanceMap.has(key)) routeDistanceMap.set(key, miles)
  }

  const locationMap = new Map()
  for (const location of locations) {
    const key = routeKey(location.userid, location.name, "")
    if (!locationMap.has(key)) locationMap.set(key, location)
  }

  const mapsCache = new Map()
  const updates = []
  const skipped = []
  let mapsFallbackLegs = 0

  for (const entry of entries) {
    const legs = getEntryLegs(entry)
    if (legs.length === 0) {
      skipped.push({ id: entry.id, reason: "No route legs in entry" })
      continue
    }

    let totalMiles = 0
    let missingLeg = null

    for (const leg of legs) {
      const directKey = reversibleKey(entry.userid, leg.from, leg.to)
      let miles = routeDistanceMap.get(directKey) ?? null

      if (miles == null && USE_MAPS_FALLBACK && MAPS_API_KEY) {
        const fromLoc = locationMap.get(routeKey(entry.userid, leg.from, ""))
        const toLoc = locationMap.get(routeKey(entry.userid, leg.to, ""))
        const origin = formatAddress(fromLoc || { name: leg.from })
        const destination = formatAddress(toLoc || { name: leg.to })
        const mapsKey =
          normalize(origin) <= normalize(destination)
            ? `${normalize(origin)}::${normalize(destination)}`
            : `${normalize(destination)}::${normalize(origin)}`

        let cached = mapsCache.get(mapsKey)
        if (!cached) {
          cached = await getGoogleMapsMiles(origin, destination)
          mapsCache.set(mapsKey, cached)
        }
        if (cached.miles != null) {
          miles = cached.miles
          mapsFallbackLegs += 1
        }
      }

      if (miles == null) {
        missingLeg = `${leg.from} -> ${leg.to}`
        break
      }
      totalMiles += miles
    }

    if (missingLeg) {
      skipped.push({ id: entry.id, reason: `Missing distance for ${missingLeg}` })
      continue
    }

    const roundedMiles = Number(totalMiles.toFixed(1))
    const oldMiles = parseMiles(entry.totalMiles) ?? 0
    const delta = Math.abs(roundedMiles - oldMiles)
    if (delta < 0.05) continue

    const claimRate = parseMiles(entry.claimRate) ?? 0
    const chargeRate = parseMiles(entry.chargeRate) ?? 0
    const newTotalClaim = (roundedMiles * claimRate).toFixed(2)
    const newTotalCharge = (roundedMiles * chargeRate).toFixed(2)

    updates.push({
      id: entry.id,
      date: entry.date,
      oldMiles: oldMiles.toFixed(1),
      newMiles: roundedMiles.toFixed(1),
      oldClaim: String(entry.totalClaim || "0"),
      newClaim: newTotalClaim,
      oldCharge: String(entry.totalCharge || "0"),
      newCharge: newTotalCharge,
    })
  }

  console.log("Backfill plan:")
  console.log(
    JSON.stringify(
      {
        entriesScanned: entries.length,
        entriesToUpdate: updates.length,
        entriesSkipped: skipped.length,
        mapsFallbackLegs,
      },
      null,
      2,
    ),
  )
  console.log("")

  if (updates.length > 0) {
    console.log("Planned updates:")
    for (const row of updates) {
      console.log(
        `- ${row.date} (${row.id.slice(0, 8)}): miles ${row.oldMiles} -> ${row.newMiles}, claim ${row.oldClaim} -> ${row.newClaim}, charge ${row.oldCharge} -> ${row.newCharge}`,
      )
    }
    console.log("")
  }

  if (skipped.length > 0) {
    console.log("Skipped entries:")
    for (const row of skipped) {
      console.log(`- ${row.id.slice(0, 8)}: ${row.reason}`)
    }
    console.log("")
  }

  if (!APPLY_CHANGES) {
    console.log("Dry run only. Set APPLY_CHANGES=1 to apply updates.")
    return
  }

  for (const row of updates) {
    const url = `${SUPABASE_URL}/rest/v1/mt_entries?id=eq.${encodeURIComponent(row.id)}`
    const { response, text } = await fetchJson(url, {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        totalMiles: row.newMiles,
        totalClaim: row.newClaim,
        totalCharge: row.newCharge,
      }),
    })
    if (!response.ok) {
      throw new Error(`Failed updating entry ${row.id}: ${response.status} ${text}`)
    }
  }

  console.log("Applied updates successfully.")
  console.log(`- Entries updated: ${updates.length}`)
}

main().catch((error) => {
  console.error("Backfill failed:", error instanceof Error ? error.message : String(error))
  process.exit(1)
})
