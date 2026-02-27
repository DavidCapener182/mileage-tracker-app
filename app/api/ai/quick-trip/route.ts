import { NextResponse } from "next/server"

interface RequestLocation {
  name: string
  address?: string
  city?: string
  postcode?: string
}

interface RequestSavedRoute {
  from: string
  to: string
  distance: string
}

interface ParsedTripShape {
  date?: string
  startPoint?: string
  stop1?: string
  stop2?: string
  stop3?: string
  stop4?: string
  stops?: string[]
  finishPoint?: string
  clientsVisited?: string
  description?: string
  unmatchedPlaces?: string[]
  resolvedAddresses?: Record<string, string>
  confidence?: "high" | "medium" | "low"
}

const CONFIGURED_MODEL = process.env.GEMINI_MODEL?.trim() || ""
const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
]

const getGeminiModelCandidates = () =>
  Array.from(new Set([CONFIGURED_MODEL, ...FALLBACK_MODELS].filter(Boolean)))

const sanitize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "")

const formatLocationAddress = (location: RequestLocation) =>
  [location.address, location.city, location.postcode].filter(Boolean).join(", ").trim() || location.name

const normalizeDate = (value: string | undefined, fallbackDate: string) => {
  if (!value) return fallbackDate
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  return fallbackDate
}

const parseDistance = (value: string) => {
  const numeric = Number.parseFloat(value || "")
  return Number.isFinite(numeric) ? numeric : null
}

const stripJsonFences = (value: string) =>
  value
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")

const parseGeminiJson = (raw: string): ParsedTripShape => {
  const cleaned = stripJsonFences(raw)

  try {
    return JSON.parse(cleaned) as ParsedTripShape
  } catch {
    const firstBrace = cleaned.indexOf("{")
    const lastBrace = cleaned.lastIndexOf("}")

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const maybeJson = cleaned.slice(firstBrace, lastBrace + 1)
      return JSON.parse(maybeJson) as ParsedTripShape
    }

    throw new Error("Gemini returned invalid JSON.")
  }
}

const getSavedRouteMiles = (from: string, to: string, savedRoutes: RequestSavedRoute[]) => {
  const match = savedRoutes.find(
    (route) =>
      (route.from.toLowerCase() === from.toLowerCase() && route.to.toLowerCase() === to.toLowerCase()) ||
      (route.from.toLowerCase() === to.toLowerCase() && route.to.toLowerCase() === from.toLowerCase()),
  )
  if (!match) return null
  return parseDistance(match.distance)
}

const findBestLocationName = (candidate: string | undefined, locations: RequestLocation[]) => {
  if (!candidate) return null
  const trimmed = candidate.trim()
  if (!trimmed) return null

  const direct = locations.find((location) => location.name.toLowerCase() === trimmed.toLowerCase())
  if (direct) return direct.name

  const candidateToken = sanitize(trimmed)
  if (!candidateToken) return null

  const exactNormalized = locations.find((location) => sanitize(location.name) === candidateToken)
  if (exactNormalized) return exactNormalized.name

  const includes = locations.find(
    (location) => sanitize(location.name).includes(candidateToken) || candidateToken.includes(sanitize(location.name)),
  )
  if (includes) return includes.name

  return null
}

async function fetchGeminiParsedTrip(input: {
  text: string
  today: string
  locations: RequestLocation[]
}) {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY
  if (!geminiKey) {
    throw new Error("Missing GEMINI_API_KEY")
  }

  const locationListWithAddresses = input.locations
    .map((location) => {
      const addr = [location.address, location.city, location.postcode].filter(Boolean).join(", ")
      return addr ? `- ${location.name} (${addr})` : `- ${location.name}`
    })
    .join("\n")

  const prompt = `
You are a mileage tracking parser.
Convert the user note into strict JSON.

Rules:
- The user has these saved locations:
${locationListWithAddresses}
- When a place clearly maps to a saved location, use the EXACT saved location name in the route field.
- When a place does NOT match any saved location, still fill the route field with a short descriptive name for that place (e.g. "Footasylum Glasgow", "Tesco Extra Bolton"). Also include these names in unmatchedPlaces.
- For each name in unmatchedPlaces, add an entry in resolvedAddresses with a Google Maps-searchable address or query (e.g. "Footasylum, Silverburn Shopping Centre, Glasgow" or "Tesco Extra, Bolton, UK"). Use any real-world knowledge you have about the business/place to produce the best possible search query.
- Keep stop order exactly as traveled.
- If "today" is used, resolve to ${input.today}.
- Date must be YYYY-MM-DD.
- description should be short and practical.

Return JSON with this shape only:
{
  "date": "YYYY-MM-DD",
  "startPoint": "",
  "stop1": "",
  "stop2": "",
  "stop3": "",
  "stop4": "",
  "finishPoint": "",
  "clientsVisited": "",
  "description": "",
  "unmatchedPlaces": [],
  "resolvedAddresses": {},
  "confidence": "high"
}

User note:
${input.text}
`.trim()

  const modelCandidates = getGeminiModelCandidates()
  const unavailableModels: string[] = []

  for (const model of modelCandidates) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      if (response.status === 400 && /api key/i.test(errorText)) {
        throw new Error("Invalid GEMINI_API_KEY. Update .env.local and restart the dev server.")
      }
      if (response.status === 403 && /SERVICE_DISABLED|not been used/i.test(errorText)) {
        throw new Error("Enable the Generative Language API for this Google project and try again.")
      }
      if (response.status === 404 && /models\//i.test(errorText)) {
        unavailableModels.push(model)
        continue
      }
      throw new Error(`Gemini request failed for "${model}" (${response.status}). ${errorText}`)
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> }
      }>
    }

    const candidateText =
      data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || ""

    if (!candidateText) {
      throw new Error(`Gemini model "${model}" returned an empty response`)
    }

    return parseGeminiJson(candidateText)
  }

  const triedModels = unavailableModels.length > 0 ? unavailableModels.join(", ") : modelCandidates.join(", ")
  throw new Error(`Gemini models unavailable for this API key. Tried: ${triedModels}.`)
}

async function getGoogleMapsMiles(
  origin: string,
  destination: string,
  mapsApiKey: string,
): Promise<{ miles: number | null; error?: string }> {
  try {
    const endpoint = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&key=${encodeURIComponent(mapsApiKey)}`
    const response = await fetch(endpoint)

    if (!response.ok) {
      return { miles: null, error: `HTTP ${response.status}` }
    }

    const data = (await response.json()) as {
      status?: string
      error_message?: string
      routes?: Array<{
        legs?: Array<{ distance?: { value?: number } }>
      }>
    }

    if (data.status !== "OK") {
      return { miles: null, error: `Maps API: ${data.status}${data.error_message ? ` – ${data.error_message}` : ""}` }
    }

    const meters =
      data.routes?.[0]?.legs?.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0) || 0

    if (meters <= 0) {
      return { miles: null, error: "Route returned 0 distance" }
    }

    return { miles: Number((meters / 1609.344).toFixed(1)) }
  } catch (err) {
    return { miles: null, error: err instanceof Error ? err.message : "Unknown fetch error" }
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string
      today?: string
      locations?: RequestLocation[]
      savedRoutes?: RequestSavedRoute[]
    }

    const text = (body.text || "").trim()
    const today = body.today || new Date().toISOString().slice(0, 10)
    const locations = body.locations || []
    const savedRoutes = body.savedRoutes || []

    if (!text) {
      return NextResponse.json({ error: "Text is required." }, { status: 400 })
    }
    if (locations.length === 0) {
      return NextResponse.json({ error: "At least one saved location is required." }, { status: 400 })
    }

    const rawParsed = await fetchGeminiParsedTrip({ text, today, locations })
    const geminiResolvedAddresses: Record<string, string> = rawParsed.resolvedAddresses || {}
    const adhocLocations: string[] = []

    const resolveLocation = (candidate: string | undefined) => {
      if (!candidate || !candidate.trim()) return ""
      const matched = findBestLocationName(candidate, locations)
      if (matched) return matched
      const name = candidate.trim()
      if (!adhocLocations.includes(name)) adhocLocations.push(name)
      return name
    }

    const resolvedStart = resolveLocation(rawParsed.startPoint)

    const rawStops = Array.isArray(rawParsed.stops)
      ? rawParsed.stops
      : [rawParsed.stop1, rawParsed.stop2, rawParsed.stop3, rawParsed.stop4]
    const resolvedStops = rawStops
      .map((stop) => resolveLocation(stop))
      .filter(Boolean)
      .slice(0, 4)

    const resolvedFinish = resolveLocation(rawParsed.finishPoint)

    const trip = {
      date: normalizeDate(rawParsed.date, today),
      startPoint: resolvedStart || "",
      stop1: resolvedStops[0] || "",
      stop2: resolvedStops[1] || "",
      stop3: resolvedStops[2] || "",
      stop4: resolvedStops[3] || "",
      finishPoint: resolvedFinish || "",
      clientsVisited: (rawParsed.clientsVisited || "").trim(),
      description: (rawParsed.description || "").trim(),
    }

    if (!trip.clientsVisited) {
      const clientStops = resolvedStops.filter((s) => !["Home", "Office"].includes(s))
      trip.clientsVisited = clientStops.join(", ")
    }

    const orderedRoute = [trip.startPoint, trip.stop1, trip.stop2, trip.stop3, trip.stop4, trip.finishPoint].filter(Boolean)
    const locationMap = new Map(locations.map((location) => [location.name, location]))
    const adhocSet = new Set(adhocLocations)
    const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""

    const getAddressForMaps = (name: string) => {
      const saved = locationMap.get(name)
      if (saved) return formatLocationAddress(saved)
      return geminiResolvedAddresses[name] || name
    }

    const mapsApiConfigured = Boolean(mapsApiKey)
    const legs: Array<{
      from: string
      to: string
      distance: string
      source: "saved_route" | "google_maps" | "missing"
      mapsQuery?: { origin: string; destination: string }
      error?: string
    }> = []
    let totalMiles = 0

    for (let i = 0; i < orderedRoute.length - 1; i += 1) {
      const from = orderedRoute[i]
      const to = orderedRoute[i + 1]
      const legHasAdhoc = adhocSet.has(from) || adhocSet.has(to)

      let miles = legHasAdhoc ? null : getSavedRouteMiles(from, to, savedRoutes)
      let source: "saved_route" | "google_maps" | "missing" = "saved_route"
      let legError: string | undefined
      let mapsQuery: { origin: string; destination: string } | undefined

      if (miles === null && mapsApiConfigured) {
        const fromAddress = getAddressForMaps(from)
        const toAddress = getAddressForMaps(to)
        mapsQuery = { origin: fromAddress, destination: toAddress }
        const result = await getGoogleMapsMiles(fromAddress, toAddress, mapsApiKey)
        miles = result.miles
        legError = result.error
        source = miles === null ? "missing" : "google_maps"
      }

      if (miles === null) {
        source = "missing"
        if (!mapsApiConfigured && legHasAdhoc) {
          legError = "GOOGLE_MAPS_API_KEY not configured"
        }
      } else {
        totalMiles += miles
      }

      legs.push({
        from,
        to,
        distance: miles === null ? "" : miles.toFixed(1),
        source,
        ...(mapsQuery && { mapsQuery }),
        ...(legError && { error: legError }),
      })
    }

    const missingLegs = legs.filter((leg) => !leg.distance).map((leg) => `${leg.from} -> ${leg.to}`)

    const usedGoogleMaps = legs.some((leg) => leg.source === "google_maps")

    return NextResponse.json({
      trip,
      confidence: rawParsed.confidence || "medium",
      unmatchedPlaces: rawParsed.unmatchedPlaces || [],
      adhocLocations,
      distance: {
        legs,
        missingLegs,
        totalMiles: totalMiles > 0 ? totalMiles.toFixed(1) : "",
      },
      metadata: {
        usedGoogleMaps,
        mapsApiConfigured,
        resolvedAddresses: geminiResolvedAddresses,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    const status = /GEMINI_API_KEY|Generative Language API|Gemini model|Gemini models|invalid JSON|empty response/i.test(message)
      ? 400
      : 500
    return NextResponse.json({ error: message }, { status })
  }
}
