#!/usr/bin/env node

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

const TOLERANCE_MILES = Number.parseFloat(process.env.ROUTE_MILE_TOLERANCE || "2")
const ROUTE_LIMIT = Number.parseInt(process.env.ROUTE_AUDIT_LIMIT || "2000", 10)
const APPLY_CHANGES = process.env.APPLY_CHANGES === "1"

if (!SUPABASE_URL) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL")
  process.exit(1)
}
if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
if (!MAPS_API_KEY) {
  console.error("Missing GOOGLE_MAPS_API_KEY")
  process.exit(1)
}

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
}

const parseMiles = (value) => {
  const parsed = Number.parseFloat(String(value || ""))
  return Number.isFinite(parsed) ? parsed : null
}

const formatAddress = (location) =>
  [location?.address, location?.city, location?.postcode].filter(Boolean).join(", ").trim() || location?.name || ""

const normalizeKey = (value) => String(value || "").trim().toLowerCase()

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

const isIgnoredRoute = (from, to) => normalizeKey(from) === "home" && normalizeKey(to) === "tfs chester"

const main = async () => {
  const routesUrl = `${SUPABASE_URL}/rest/v1/mt_saved_routes?select=id,userid,from,to,distance&order=from.asc,id.asc&limit=${ROUTE_LIMIT}`
  const locationsUrl = `${SUPABASE_URL}/rest/v1/mt_locations?select=userid,name,address,city,postcode&limit=5000`

  const [{ response: routesRes, data: routesData, text: routesText }, { response: locRes, data: locData, text: locText }] =
    await Promise.all([
      fetchJson(routesUrl, { headers }),
      fetchJson(locationsUrl, { headers }),
    ])

  if (!routesRes.ok) {
    throw new Error(`Could not read saved_routes: ${routesRes.status} ${routesText}`)
  }
  if (!locRes.ok) {
    throw new Error(`Could not read locations: ${locRes.status} ${locText}`)
  }

  const routes = Array.isArray(routesData) ? routesData : []
  const locations = Array.isArray(locData) ? locData : []
  if (routes.length === 0) {
    console.log("No saved routes found.")
    return
  }

  const locationByUserAndName = new Map()
  for (const loc of locations) {
    const key = `${normalizeKey(loc.userid)}::${normalizeKey(loc.name)}`
    if (!locationByUserAndName.has(key)) locationByUserAndName.set(key, loc)
  }

  const groupMap = new Map()
  for (const route of routes) {
    const key = `${normalizeKey(route.userid)}::${normalizeKey(route.from)}::${normalizeKey(route.to)}`
    const list = groupMap.get(key) || []
    list.push(route)
    groupMap.set(key, list)
  }

  const keepRoutes = []
  const duplicateIdsToDelete = []

  for (const list of groupMap.values()) {
    keepRoutes.push(list[0])
    if (list.length > 1) {
      for (let i = 1; i < list.length; i += 1) duplicateIdsToDelete.push(list[i].id)
    }
  }

  const mapsCache = new Map()
  const updates = []
  const skipped = []
  const mapErrors = []

  for (const route of keepRoutes) {
    const from = String(route.from || "").trim()
    const to = String(route.to || "").trim()

    if (isIgnoredRoute(from, to)) {
      skipped.push({ id: route.id, from, to, reason: "ignored by user request" })
      continue
    }

    const storedMiles = parseMiles(route.distance)
    if (storedMiles == null) continue

    const fromLoc = locationByUserAndName.get(`${normalizeKey(route.userid)}::${normalizeKey(from)}`)
    const toLoc = locationByUserAndName.get(`${normalizeKey(route.userid)}::${normalizeKey(to)}`)
    const origin = formatAddress(fromLoc || { name: from })
    const destination = formatAddress(toLoc || { name: to })
    const cacheKey = `${normalizeKey(origin)}::${normalizeKey(destination)}`

    let mapsResult = mapsCache.get(cacheKey)
    if (!mapsResult) {
      mapsResult = await getGoogleMapsMiles(origin, destination)
      mapsCache.set(cacheKey, mapsResult)
    }

    if (mapsResult.miles == null) {
      mapErrors.push({ id: route.id, from, to, error: mapsResult.error || "Unknown maps error" })
      continue
    }

    const delta = Number(Math.abs(storedMiles - mapsResult.miles).toFixed(1))
    if (delta > TOLERANCE_MILES) {
      updates.push({
        id: route.id,
        from,
        to,
        oldDistance: String(route.distance),
        newDistance: mapsResult.miles.toFixed(1),
        delta,
      })
    }
  }

  const report = {
    totalRoutes: routes.length,
    keptAfterDedup: keepRoutes.length,
    duplicatesToDelete: duplicateIdsToDelete.length,
    updatesOverTolerance: updates.length,
    skipped: skipped.length,
    mapErrors: mapErrors.length,
  }

  console.log("Reconcile plan:")
  console.log(JSON.stringify(report, null, 2))
  console.log("")

  if (updates.length > 0) {
    console.log("Planned distance updates (first 20):")
    for (const row of updates.slice(0, 20)) {
      console.log(
        `- ${row.from} -> ${row.to}: ${row.oldDistance} -> ${row.newDistance} (delta ${row.delta.toFixed(1)} mi)`,
      )
    }
    if (updates.length > 20) {
      console.log(`... and ${updates.length - 20} more`)
    }
    console.log("")
  }

  if (duplicateIdsToDelete.length > 0) {
    console.log(`Planned duplicate deletions: ${duplicateIdsToDelete.length}`)
    console.log("")
  }

  if (!APPLY_CHANGES) {
    console.log("Dry run only. Set APPLY_CHANGES=1 to apply updates/deletions.")
    return
  }

  for (const row of updates) {
    const url = `${SUPABASE_URL}/rest/v1/mt_saved_routes?id=eq.${encodeURIComponent(row.id)}`
    const { response, text } = await fetchJson(url, {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ distance: row.newDistance }),
    })
    if (!response.ok) {
      throw new Error(`Failed updating ${row.id}: ${response.status} ${text}`)
    }
  }

  if (duplicateIdsToDelete.length > 0) {
    const chunks = []
    for (let i = 0; i < duplicateIdsToDelete.length; i += 100) {
      chunks.push(duplicateIdsToDelete.slice(i, i + 100))
    }

    for (const chunk of chunks) {
      const inList = chunk.map((id) => String(id)).join(",")
      const url = `${SUPABASE_URL}/rest/v1/mt_saved_routes?id=in.(${encodeURIComponent(inList)})`
      const { response, text } = await fetchJson(url, {
        method: "DELETE",
        headers: {
          ...headers,
          Prefer: "return=minimal",
        },
      })
      if (!response.ok) {
        throw new Error(`Failed deleting duplicates: ${response.status} ${text}`)
      }
    }
  }

  console.log("Applied changes successfully.")
  console.log(`- Updated distances: ${updates.length}`)
  console.log(`- Deleted duplicates: ${duplicateIdsToDelete.length}`)
}

main().catch((error) => {
  console.error("Reconcile failed:", error instanceof Error ? error.message : String(error))
  process.exit(1)
})
