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
  startPostcode?: string
  stop1?: string
  stop1Postcode?: string
  stop2?: string
  stop2Postcode?: string
  stop3?: string
  stop3Postcode?: string
  stop4?: string
  stop4Postcode?: string
  stops?: string[]
  finishPoint?: string
  finishPostcode?: string
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
const AI_TEMPORARY_FAILURE_MESSAGE =
  "AI trip parsing is temporarily unavailable. Please try again in a moment."
const GEMINI_RETRY_DELAYS_MS = [500, 1500]

type GeminiRequestResult =
  | { outcome: "success"; parsed: ParsedTripShape }
  | { outcome: "unavailable" }
  | { outcome: "transient"; detail: string }

const getGeminiModelCandidates = () =>
  Array.from(new Set([CONFIGURED_MODEL, ...FALLBACK_MODELS].filter(Boolean)))

const isGeminiTransientStatus = (status: number) => [429, 500, 503].includes(status)
const isTransientNetworkError = (error: unknown) =>
  error instanceof Error && /fetch failed|network|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i.test(error.message)
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const sanitize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "")
const UK_POSTCODE_REGEX = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i

const normalizePostcode = (value: string | undefined) => (value || "").trim().toUpperCase()
const extractUKPostcode = (value: string | undefined) => normalizePostcode(value?.match(UK_POSTCODE_REGEX)?.[0])

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

  const includes = locations.find((location) => {
    const locToken = sanitize(location.name)
    const shorter = Math.min(locToken.length, candidateToken.length)
    const longer = Math.max(locToken.length, candidateToken.length)
    if (shorter < 3 || longer > shorter * 2) return false
    return locToken.includes(candidateToken) || candidateToken.includes(locToken)
  })
  if (includes) return includes.name

  return null
}

async function requestGeminiParsedTrip(input: {
  model: string
  prompt: string
  geminiKey: string
}): Promise<GeminiRequestResult> {
  let transientDetail = `${input.model} (temporary error)`

  for (let attempt = 0; attempt <= GEMINI_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: input.prompt }] }],
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
          return { outcome: "unavailable" }
        }
        if (isGeminiTransientStatus(response.status)) {
          transientDetail = `${input.model} (${response.status})`
          if (attempt < GEMINI_RETRY_DELAYS_MS.length) {
            await wait(GEMINI_RETRY_DELAYS_MS[attempt])
            continue
          }
          return { outcome: "transient", detail: transientDetail }
        }
        throw new Error(`Gemini request failed for "${input.model}" (${response.status}). ${errorText}`)
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> }
        }>
      }

      const candidateText =
        data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || ""

      if (!candidateText) {
        transientDetail = `${input.model} (empty response)`
        if (attempt < GEMINI_RETRY_DELAYS_MS.length) {
          await wait(GEMINI_RETRY_DELAYS_MS[attempt])
          continue
        }
        throw new Error(`Gemini model "${input.model}" returned an empty response`)
      }

      try {
        return { outcome: "success", parsed: parseGeminiJson(candidateText) }
      } catch (error) {
        transientDetail = `${input.model} (invalid JSON)`
        if (attempt < GEMINI_RETRY_DELAYS_MS.length) {
          await wait(GEMINI_RETRY_DELAYS_MS[attempt])
          continue
        }
        throw error
      }
    } catch (error) {
      if (isTransientNetworkError(error)) {
        transientDetail = `${input.model} (network error)`
        if (attempt < GEMINI_RETRY_DELAYS_MS.length) {
          await wait(GEMINI_RETRY_DELAYS_MS[attempt])
          continue
        }
        return { outcome: "transient", detail: transientDetail }
      }

      throw error
    }
  }

  return { outcome: "transient", detail: transientDetail }
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
- ONLY match a place to a saved location if the user is clearly referring to that exact business/place. For example, if the user says "Arndale Centre Manchester" and a saved location is "Footasylum Manchester Arndale", these are DIFFERENT places (one is a shopping centre, the other is a specific store) — do NOT match them. When in doubt, treat the place as new/unmatched rather than forcing a wrong match.
- When a place clearly maps to a saved location, use the EXACT saved location name in the route field.
- When a place maps to a saved location, include that saved location's postcode in the matching postcode field.
- For unmatched/ad-hoc places, leave postcode fields blank unless the user explicitly gave a postcode.
- When a place does NOT match any saved location, still fill the route field with the user's own description of that place (e.g. "Arndale Centre Manchester", "Sharp Project Manchester"). Also include these names in unmatchedPlaces.
- For each name in unmatchedPlaces, add an entry in resolvedAddresses with a Google Maps-searchable address or query. Include the postcode when you know it. Use any real-world knowledge you have about the business/place to produce the best possible search query (e.g. "Manchester Arndale, Market Street, Manchester M4 3AD, UK" or "Sharp Project, Thorp Road, Manchester M40 5BJ, UK").
- Include ALL stops the user mentions, in order. Never drop a stop just because it does not match a saved location.
- Keep stop order exactly as traveled.
- If "today" is used, resolve to ${input.today}.
- Date must be YYYY-MM-DD.
- description should be short and practical.

Return JSON with this shape only:
{
  "date": "YYYY-MM-DD",
  "startPoint": "",
  "startPostcode": "",
  "stop1": "",
  "stop1Postcode": "",
  "stop2": "",
  "stop2Postcode": "",
  "stop3": "",
  "stop3Postcode": "",
  "stop4": "",
  "stop4Postcode": "",
  "finishPoint": "",
  "finishPostcode": "",
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
  const transientFailures: string[] = []

  for (const model of modelCandidates) {
    const result = await requestGeminiParsedTrip({ model, prompt, geminiKey })
    if (result.outcome === "success") return result.parsed
    if (result.outcome === "unavailable") {
      unavailableModels.push(model)
      continue
    }
    transientFailures.push(result.detail)
  }

  if (transientFailures.length > 0) {
    console.warn("[quick-trip] Gemini transient failures:", transientFailures.join(", "))
    throw new Error(AI_TEMPORARY_FAILURE_MESSAGE)
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
    const locationMap = new Map(locations.map((location) => [location.name, location]))
    const getPostcodeForResolvedName = (name: string, fallback?: string) =>
      normalizePostcode(locationMap.get(name)?.postcode) ||
      normalizePostcode(fallback) ||
      extractUKPostcode(geminiResolvedAddresses[name])

    const trip = {
      date: normalizeDate(rawParsed.date, today),
      startPoint: resolvedStart || "",
      startPostcode: getPostcodeForResolvedName(resolvedStart, rawParsed.startPostcode),
      stop1: resolvedStops[0] || "",
      stop1Postcode: getPostcodeForResolvedName(resolvedStops[0] || "", rawParsed.stop1Postcode),
      stop2: resolvedStops[1] || "",
      stop2Postcode: getPostcodeForResolvedName(resolvedStops[1] || "", rawParsed.stop2Postcode),
      stop3: resolvedStops[2] || "",
      stop3Postcode: getPostcodeForResolvedName(resolvedStops[2] || "", rawParsed.stop3Postcode),
      stop4: resolvedStops[3] || "",
      stop4Postcode: getPostcodeForResolvedName(resolvedStops[3] || "", rawParsed.stop4Postcode),
      finishPoint: resolvedFinish || "",
      finishPostcode: getPostcodeForResolvedName(resolvedFinish, rawParsed.finishPostcode),
      clientsVisited: (rawParsed.clientsVisited || "").trim(),
      description: (rawParsed.description || "").trim(),
    }

    if (!trip.clientsVisited) {
      const clientStops = resolvedStops.filter((s) => !["Home", "Office"].includes(s))
      trip.clientsVisited = clientStops.join(", ")
    }

    const orderedRoute = [trip.startPoint, trip.stop1, trip.stop2, trip.stop3, trip.stop4, trip.finishPoint].filter(Boolean)
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
    const isTemporaryAiFailure = message === AI_TEMPORARY_FAILURE_MESSAGE
    const status = isTemporaryAiFailure
      ? 503
      : /GEMINI_API_KEY|Generative Language API|Gemini model|Gemini models|invalid JSON|empty response/i.test(message)
        ? 400
        : 500
    return NextResponse.json(
      {
        error: message,
        ...(isTemporaryAiFailure ? { code: "AI_TEMPORARILY_UNAVAILABLE" } : {}),
      },
      { status },
    )
  }
}
