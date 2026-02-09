#!/usr/bin/env node

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BEARER_TOKEN = process.env.SUPABASE_BEARER_TOKEN
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const API_KEY = SERVICE_ROLE_KEY || ANON_KEY
const AUTH_TOKEN = BEARER_TOKEN || SERVICE_ROLE_KEY || ANON_KEY
const TOLERANCE_MILES = Number.parseFloat(process.env.ROUTE_MILE_TOLERANCE || "1.0")
const ROUTE_LIMIT = Number.parseInt(process.env.ROUTE_AUDIT_LIMIT || "200", 10)

if (!SUPABASE_URL) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL")
  process.exit(1)
}

if (!API_KEY || !AUTH_TOKEN) {
  console.error("Missing Supabase credentials. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_BEARER_TOKEN.")
  process.exit(1)
}

if (!MAPS_API_KEY) {
  console.error("Missing GOOGLE_MAPS_API_KEY")
  process.exit(1)
}

const supabaseHeaders = {
  apikey: API_KEY,
  Authorization: `Bearer ${AUTH_TOKEN}`,
}

const parseMiles = (value) => {
  const parsed = Number.parseFloat(String(value || ""))
  return Number.isFinite(parsed) ? parsed : null
}

const formatAddress = (location) =>
  [location?.address, location?.city, location?.postcode].filter(Boolean).join(", ").trim() || location?.name || ""

const canonicalPair = (from, to) => {
  const left = String(from || "").trim().toLowerCase()
  const right = String(to || "").trim().toLowerCase()
  return [left, right].sort().join("::")
}

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
  const endpoint = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${encodeURIComponent(MAPS_API_KEY)}`
  const { response, data, text } = await fetchJson(endpoint)

  if (!response.ok) {
    return { miles: null, error: `HTTP ${response.status}: ${text.slice(0, 240)}` }
  }

  const status = data?.status
  if (status !== "OK") {
    return { miles: null, error: `Maps status ${status || "UNKNOWN"}` }
  }

  const meters =
    data?.routes?.[0]?.legs?.reduce((sum, leg) => sum + (leg?.distance?.value || 0), 0) || 0

  if (!meters || meters <= 0) {
    return { miles: null, error: "No distance returned" }
  }

  return { miles: Number((meters / 1609.344).toFixed(1)), error: null }
}

const printRow = (route, audited) => {
  const stored = route.storedMiles == null ? "n/a" : route.storedMiles.toFixed(1)
  const maps = audited.mapsMiles == null ? "n/a" : audited.mapsMiles.toFixed(1)
  const delta = audited.deltaMiles == null ? "n/a" : audited.deltaMiles.toFixed(1)
  const status = audited.status.padEnd(11, " ")
  console.log(`${status} | ${stored.padStart(6, " ")} | ${maps.padStart(6, " ")} | ${delta.padStart(6, " ")} | ${route.from} -> ${route.to}`)
  if (audited.error) {
    console.log(`             maps_error: ${audited.error}`)
  }
}

const main = async () => {
  const routesUrl = `${SUPABASE_URL}/rest/v1/mt_saved_routes?select=id,userid,from,to,distance&limit=${ROUTE_LIMIT}`
  const locationsUrl = `${SUPABASE_URL}/rest/v1/mt_locations?select=name,address,city,postcode,userid&limit=1000`

  const [{ response: routesRes, data: routesData, text: routesText }, { response: locRes, data: locData, text: locText }] =
    await Promise.all([
      fetchJson(routesUrl, { headers: supabaseHeaders }),
      fetchJson(locationsUrl, { headers: supabaseHeaders }),
    ])

  if (!routesRes.ok) {
    console.error(`Could not read saved_routes: ${routesRes.status} ${routesText}`)
    process.exit(1)
  }

  if (!locRes.ok) {
    console.error(`Could not read locations: ${locRes.status} ${locText}`)
    process.exit(1)
  }

  const routes = Array.isArray(routesData) ? routesData : []
  const locations = Array.isArray(locData) ? locData : []
  const locationMap = new Map()
  for (const loc of locations) {
    const key = String(loc?.name || "").trim()
    if (key) locationMap.set(key.toLowerCase(), loc)
  }

  if (routes.length === 0) {
    console.log("No saved_routes rows visible.")
    if (!SERVICE_ROLE_KEY && !BEARER_TOKEN) {
      console.log("Likely reason: RLS. Add SUPABASE_SERVICE_ROLE_KEY or SUPABASE_BEARER_TOKEN, then rerun.")
    }
    return
  }

  console.log(`Auditing ${routes.length} saved routes (tolerance: +/-${TOLERANCE_MILES.toFixed(1)} mi)...`)
  console.log("")
  console.log("STATUS      | STORED | MAPS   | DELTA  | ROUTE")
  console.log("------------+--------+--------+--------+-----------------------------------------------")

  const mapsCache = new Map()
  const audited = []

  for (const route of routes) {
    const from = String(route.from || "").trim()
    const to = String(route.to || "").trim()
    const storedMiles = parseMiles(route.distance)
    const fromLoc = locationMap.get(from.toLowerCase())
    const toLoc = locationMap.get(to.toLowerCase())
    const origin = formatAddress(fromLoc || { name: from })
    const destination = formatAddress(toLoc || { name: to })
    const pairKey = canonicalPair(origin, destination)

    let cached = mapsCache.get(pairKey)
    if (!cached) {
      cached = await getGoogleMapsMiles(origin, destination)
      mapsCache.set(pairKey, cached)
    }

    const mapsMiles = cached.miles
    const deltaMiles =
      storedMiles != null && mapsMiles != null ? Number(Math.abs(storedMiles - mapsMiles).toFixed(1)) : null

    let status = "ERROR"
    if (storedMiles == null) {
      status = "NO_STORED"
    } else if (mapsMiles == null) {
      status = "NO_MAPS"
    } else if (deltaMiles <= TOLERANCE_MILES) {
      status = "OK"
    } else {
      status = "MISMATCH"
    }

    const result = {
      status,
      storedMiles,
      mapsMiles,
      deltaMiles,
      error: cached.error,
    }
    audited.push({ route: { from, to, storedMiles }, result })
    printRow({ from, to, storedMiles }, result)
  }

  const summary = audited.reduce(
    (acc, item) => {
      acc.total += 1
      acc[item.result.status] = (acc[item.result.status] || 0) + 1
      return acc
    },
    { total: 0 },
  )

  console.log("")
  console.log("Summary:")
  console.log(`- Total routes checked: ${summary.total}`)
  console.log(`- OK: ${summary.OK || 0}`)
  console.log(`- MISMATCH: ${summary.MISMATCH || 0}`)
  console.log(`- NO_STORED: ${summary.NO_STORED || 0}`)
  console.log(`- NO_MAPS: ${summary.NO_MAPS || 0}`)
}

main().catch((error) => {
  console.error("Route audit failed:", error instanceof Error ? error.message : String(error))
  process.exit(1)
})
