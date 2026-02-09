"use server"

import { createClient } from "@/lib/supabase/server"

export async function seedInitialData() {
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: "Not authenticated" }
  }

  try {
    // Check if data already exists
    const { data: existingLocations } = await supabase.from("mt_locations").select("id").limit(1)

    if (existingLocations && existingLocations.length > 0) {
      return { success: true, message: "Data already seeded" }
    }

    // Insert locations
    const locationsToInsert = [
      {
        userid: user.id,
        name: "Home",
        address: "22 Gort Road",
        city: "Liverpool",
        postcode: "L36 7XA",
        category: "Personal",
      },
      {
        userid: user.id,
        name: "Office",
        address: "Silverwell Street",
        city: "Bolton",
        postcode: "BL1 1PP",
        category: "Office",
      },
      {
        userid: user.id,
        name: "Music Magpie",
        address: "Newby Road",
        city: "Stockport",
        postcode: "SK7 5DA",
        category: "Client",
      },
      {
        userid: user.id,
        name: "FootAsylum Liverpool One",
        address: "Liverpool One",
        city: "Liverpool",
        postcode: "L1",
        category: "Client",
      },
    ]

    const { error: locError } = await supabase.from("mt_locations").insert(locationsToInsert)

    if (locError) throw locError

    // Insert saved routes
    const routesToInsert = [
      { userid: user.id, from: "Office", to: "Music Magpie", distance: "26" },
      { userid: user.id, from: "Music Magpie", to: "Home", distance: "40" },
      { userid: user.id, from: "Office", to: "FootAsylum Liverpool One", distance: "30" },
      { userid: user.id, from: "FootAsylum Liverpool One", to: "Home", distance: "15" },
      { userid: user.id, from: "Home", to: "Office", distance: "30" },
      { userid: user.id, from: "Music Magpie", to: "FootAsylum Liverpool One", distance: "40" },
      { userid: user.id, from: "Home", to: "Music Magpie", distance: "40" },
      { userid: user.id, from: "Home", to: "FootAsylum Liverpool One", distance: "15" },
      { userid: user.id, from: "Office", to: "Home", distance: "30" },
      { userid: user.id, from: "Music Magpie", to: "Office", distance: "26" },
      { userid: user.id, from: "FootAsylum Liverpool One", to: "Music Magpie", distance: "40" },
      { userid: user.id, from: "FootAsylum Liverpool One", to: "Office", distance: "30" },
    ]

    const { error: routeError } = await supabase.from("mt_saved_routes").insert(routesToInsert)

    if (routeError) throw routeError

    // Insert entries
    const entriesToInsert = [
      {
        userid: user.id,
        date: "2025-11-18",
        startPoint: "Office",
        stop1: "Music Magpie",
        finishPoint: "Home",
        clientsVisited: "Music Magpie",
        description: "Client Visit",
        totalMiles: "66.0",
        claimRate: "0.14",
        chargeRate: "0.25",
        totalClaim: "9.24",
        totalCharge: "16.50",
        comments: "Imported",
      },
      {
        userid: user.id,
        date: "2025-11-19",
        startPoint: "Office",
        stop1: "Music Magpie",
        finishPoint: "Office",
        clientsVisited: "Music Magpie",
        description: "Client Visit",
        totalMiles: "52.0",
        claimRate: "0.14",
        chargeRate: "0.25",
        totalClaim: "7.28",
        totalCharge: "13.00",
        comments: "Imported",
      },
      {
        userid: user.id,
        date: "2025-11-24",
        startPoint: "Office",
        stop1: "FootAsylum Liverpool One",
        finishPoint: "Home",
        clientsVisited: "FootAsylum Liverpool One",
        description: "Client Visit",
        totalMiles: "45.0",
        claimRate: "0.14",
        chargeRate: "0.25",
        totalClaim: "6.30",
        totalCharge: "11.25",
        comments: "Imported",
      },
      {
        userid: user.id,
        date: "2025-11-25",
        startPoint: "Office",
        stop1: "Music Magpie",
        finishPoint: "Home",
        clientsVisited: "Music Magpie",
        description: "Client Visit",
        totalMiles: "66.0",
        claimRate: "0.14",
        chargeRate: "0.25",
        totalClaim: "9.24",
        totalCharge: "16.50",
        comments: "Imported",
      },
      {
        userid: user.id,
        date: "2025-12-01",
        startPoint: "Office",
        stop1: "Music Magpie",
        finishPoint: "Home",
        clientsVisited: "Music Magpie",
        description: "Client Visit",
        totalMiles: "66.0",
        claimRate: "0.14",
        chargeRate: "0.25",
        totalClaim: "9.24",
        totalCharge: "16.50",
        comments: "Imported",
      },
    ]

    const { error: entriesError } = await supabase.from("mt_entries").insert(entriesToInsert)

    if (entriesError) throw entriesError

    return { success: true, message: "Data seeded successfully!" }
  } catch (error: any) {
    console.error("Seed error:", error)
    return { success: false, error: error.message }
  }
}

export async function resetData() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "Not authenticated" }

  // Delete all data
  await supabase.from("mt_entries").delete().eq("userid", user.id)
  await supabase.from("mt_saved_routes").delete().eq("userid", user.id)
  await supabase.from("mt_locations").delete().eq("userid", user.id)

  // Re-seed
  return await seedInitialData()
}
