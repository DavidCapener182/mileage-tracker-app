#!/usr/bin/env node

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const APPLY_CHANGES = process.env.APPLY_CHANGES === "1"

const OLD_VALUE = process.env.RENAME_OLD_VALUE || "Footasylum Presto"
const NEW_VALUE = process.env.RENAME_NEW_VALUE || "Footasylum Preston"

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

const countRows = async (table, column, value) => {
  const url =
    `${SUPABASE_URL}/rest/v1/${table}` +
    `?select=id&${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`
  const { response, data, text } = await fetchJson(url, { headers })
  if (!response.ok) throw new Error(`Count failed for ${table}.${column}: ${response.status} ${text}`)
  return Array.isArray(data) ? data.length : 0
}

const patchRows = async (table, column, oldValue, body) => {
  const url =
    `${SUPABASE_URL}/rest/v1/${table}` +
    `?${encodeURIComponent(column)}=eq.${encodeURIComponent(oldValue)}`
  const { response, text } = await fetchJson(url, {
    method: "PATCH",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`Patch failed for ${table}.${column}: ${response.status} ${text}`)
}

const main = async () => {
  const columnsToScan = [
    ["mt_locations", "name"],
    ["mt_saved_routes", "from"],
    ["mt_saved_routes", "to"],
    ["mt_entries", "startPoint"],
    ["mt_entries", "stop1"],
    ["mt_entries", "stop2"],
    ["mt_entries", "stop3"],
    ["mt_entries", "stop4"],
    ["mt_entries", "finishPoint"],
  ]

  const counts = {}
  for (const [table, column] of columnsToScan) {
    counts[`${table}.${column}`] = await countRows(table, column, OLD_VALUE)
  }

  console.log("Rename plan:")
  console.log(JSON.stringify({ oldValue: OLD_VALUE, newValue: NEW_VALUE, counts }, null, 2))
  console.log("")

  if (!APPLY_CHANGES) {
    console.log("Dry run only. Set APPLY_CHANGES=1 to apply renames.")
    return
  }

  await patchRows("mt_locations", "name", OLD_VALUE, { name: NEW_VALUE })
  await patchRows("mt_saved_routes", "from", OLD_VALUE, { from: NEW_VALUE })
  await patchRows("mt_saved_routes", "to", OLD_VALUE, { to: NEW_VALUE })
  await patchRows("mt_entries", "startPoint", OLD_VALUE, { startPoint: NEW_VALUE })
  await patchRows("mt_entries", "stop1", OLD_VALUE, { stop1: NEW_VALUE })
  await patchRows("mt_entries", "stop2", OLD_VALUE, { stop2: NEW_VALUE })
  await patchRows("mt_entries", "stop3", OLD_VALUE, { stop3: NEW_VALUE })
  await patchRows("mt_entries", "stop4", OLD_VALUE, { stop4: NEW_VALUE })
  await patchRows("mt_entries", "finishPoint", OLD_VALUE, { finishPoint: NEW_VALUE })

  const postCounts = {}
  for (const [table, column] of columnsToScan) {
    postCounts[`${table}.${column}`] = await countRows(table, column, OLD_VALUE)
  }

  console.log("Applied renames.")
  console.log(JSON.stringify({ remainingOldValueCounts: postCounts }, null, 2))
}

main().catch((error) => {
  console.error("Rename failed:", error instanceof Error ? error.message : String(error))
  process.exit(1)
})
