"use client"

import type React from "react"

import { useState, useEffect, useMemo, useRef } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Plus,
  MapPin,
  Download,
  Trash2,
  Save,
  FileText,
  Navigation,
  Cloud,
  Loader2,
  Pencil,
  ArrowRight,
  Route,
  LogOut,
  ArrowLeftRight,
  PoundSterling,
  List,
  Car,
} from "lucide-react"
import { seedInitialData } from "@/app/actions/seed-data"
import { toast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"

// --- Types ---
interface Location {
  id: string
  name: string
  address: string
  city: string
  postcode: string
  category: string
}

interface SavedRoute {
  id: string
  from: string // Changed from from_location
  to: string // Changed from to_location
  distance: string
}

interface Entry {
  id: string
  date: string
  startPoint: string // Changed from start_point
  stop1?: string
  stop2?: string
  stop3?: string
  stop4?: string
  finishPoint: string // Changed from finish_point
  clientsVisited?: string // Changed from clients_visited
  description?: string
  totalMiles: string // Changed from total_miles
  claimRate: string // Changed from claim_rate
  chargeRate: string // Changed from charge_rate
  totalClaim: string
  totalCharge: string
  comments?: string
  createdat: string // Changed from created_at to match database column
}

interface QuickTripDraft {
  trip: {
    date: string
    startPoint: string
    stop1: string
    stop2: string
    stop3: string
    stop4: string
    finishPoint: string
    clientsVisited: string
    description: string
  }
  confidence: "high" | "medium" | "low"
  unmatchedPlaces: string[]
  adhocLocations: string[]
  distance: {
    legs: Array<{
      from: string
      to: string
      distance: string
      source: "saved_route" | "google_maps" | "missing"
      error?: string
    }>
    missingLegs: string[]
    totalMiles: string
  }
  metadata: {
    usedGoogleMaps: boolean
    mapsApiConfigured?: boolean
    resolvedAddresses?: Record<string, string>
  }
}

interface QuickTripErrorResponse {
  error?: string
  code?: string
}

// --- Constants ---
const DEFAULT_CLAIM_RATE = "0.14"
const DEFAULT_CHARGE_RATE = "0.25"
const DEFAULT_CURRENCY = "GBP"
const QUICK_ADD_TEMPORARY_AI_MESSAGE =
  "AI trip parsing is temporarily unavailable. Please try again in a moment."

const getTodayLocalDate = () => {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

const getQuickAddErrorMessage = (status: number, data: QuickTripErrorResponse) => {
  if (data.code === "AI_TEMPORARILY_UNAVAILABLE" || status === 503) {
    return QUICK_ADD_TEMPORARY_AI_MESSAGE
  }

  return data.error || "Could not parse trip note."
}

// --- UI Components ---
const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden ${className}`}>{children}</div>
)

const Button = ({
  children,
  onClick,
  variant = "primary",
  className = "",
  type = "button",
  disabled = false,
  title = "",
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: "primary" | "secondary" | "danger" | "ghost"
  className?: string
  type?: "button" | "submit"
  disabled?: boolean
  title?: string
}) => {
  const baseStyle =
    "px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 justify-center min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-100",
    secondary: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300",
    danger: "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200",
    ghost: "text-slate-500 hover:text-indigo-600 hover:bg-indigo-50",
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

const Input = ({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
}: {
  label?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  type?: string
  placeholder?: string
  className?: string
}) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    {label && <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>}
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 text-base bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 min-h-[44px]"
    />
  </div>
)

const Select = ({
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
}: {
  label?: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  options: { value: string; label: string }[]
  placeholder?: string
  className?: string
}) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    {label && <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</label>}
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full px-3 py-2.5 text-base bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 appearance-none min-h-[44px]"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  </div>
)

// --- Main Page Component ---
export default function MileageTrackerPage() {
  const [user, setUser] = useState<any>(null)
  const [activeTab, setActiveTab] = useState("tracker")
  const [locations, setLocations] = useState<Location[]>([])
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasCheckedSeed, setHasCheckedSeed] = useState(false)
  const router = useRouter()

  const supabase = useMemo(() => createClient(), [])

  // Auth check
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user || null
      // Only update user if the ID has changed to prevent unnecessary re-renders/fetches
      setUser((prevUser: any) => {
        if (prevUser?.id === currentUser?.id) return prevUser
        return currentUser
      })
      if (!currentUser) {
        router.push("/auth/login")
      }
    })

    supabase.auth.getUser().then(({ data: { user }, error }) => {
      // Invalid/expired refresh token – sign out and force re-login
      if (error) {
        const isRefreshTokenError =
          error.message?.includes("Refresh Token") ||
          error.message?.includes("refresh_token") ||
          error.message?.includes("invalid_refresh_token")
        if (isRefreshTokenError) {
          supabase.auth.signOut().finally(() => router.push("/auth/login"))
          return
        }
      }
      if (!user) {
        router.push("/auth/login")
      } else {
        setUser((prevUser: any) => {
          if (prevUser?.id === user.id) return prevUser
          return user
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [router, supabase])

  useEffect(() => {
    if (!user) return

    const fetchData = async () => {
      // Only set loading if we don't have data yet to prevent flashing/resetting
      if (locations.length === 0 && savedRoutes.length === 0 && entries.length === 0) {
        setIsLoading(true)
      }
      console.log("[v0] Fetching initial data...")

      const [locationsRes, routesRes, entriesRes] = await Promise.all([
        supabase.from("mt_locations").select("*").order("name"),
        supabase.from("mt_saved_routes").select("*").order("from", { ascending: true }),
        supabase
          .from("mt_entries")
          .select("*")
          .order("date", { ascending: false })
          .order("createdat", { ascending: false }),
      ])

      console.log("[v0] Entries fetched:", entriesRes.data?.length || 0)
      if (locationsRes.data) setLocations(locationsRes.data)
      if (routesRes.data) setSavedRoutes(routesRes.data)
      if (entriesRes.data) setEntries(entriesRes.data)

      setIsLoading(false)
    }

    fetchData()

    const channel = supabase
      .channel("db_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "mt_locations" }, (payload) => {
        console.log("[v0] Location change:", payload.eventType, payload.new)
        if (payload.eventType === "INSERT") {
          setLocations((prev) => {
            if (prev.some((loc) => loc.id === payload.new.id)) return prev
            return [...prev, payload.new as Location].sort((a, b) => a.name.localeCompare(b.name))
          })
        } else if (payload.eventType === "DELETE") {
          setLocations((prev) => prev.filter((loc) => loc.id !== payload.old.id))
        } else if (payload.eventType === "UPDATE") {
          setLocations((prev) => prev.map((loc) => (loc.id === payload.new.id ? (payload.new as Location) : loc)))
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mt_saved_routes" }, (payload) => {
        console.log("[v0] Route change:", payload.eventType, payload.new)
        if (payload.eventType === "INSERT") {
          setSavedRoutes((prev) => {
            if (prev.some((route) => route.id === payload.new.id)) return prev
            return [...prev, payload.new as SavedRoute].sort((a, b) => a.from.localeCompare(b.from))
          })
        } else if (payload.eventType === "DELETE") {
          setSavedRoutes((prev) => prev.filter((route) => route.id !== payload.old.id))
        } else if (payload.eventType === "UPDATE") {
          setSavedRoutes((prev) =>
            prev.map((route) => (route.id === payload.new.id ? (payload.new as SavedRoute) : route)),
          )
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mt_entries" }, (payload) => {
        console.log("[v0] Entry change:", payload.eventType, payload.new || payload.old)
        if (payload.eventType === "INSERT") {
          setEntries((prev) => {
            if (prev.some((entry) => entry.id === payload.new.id)) return prev
            const newEntry = payload.new as Entry
            console.log("[v0] Adding entry to list:", newEntry.id, newEntry.date)
            return [newEntry, ...prev]
          })
        } else if (payload.eventType === "DELETE") {
          setEntries((prev) => prev.filter((entry) => entry.id !== payload.old.id))
        } else if (payload.eventType === "UPDATE") {
          setEntries((prev) => prev.map((entry) => (entry.id === payload.new.id ? (payload.new as Entry) : entry)))
        }
      })
      .subscribe((status) => {
        console.log("[v0] Realtime subscription status:", status)
      })

    return () => {
      console.log("[v0] Unsubscribing from realtime")
      channel.unsubscribe()
    }
  }, [user, supabase])

  useEffect(() => {
    if (!user || hasCheckedSeed || isLoading) return

    const checkAndSeed = async () => {
      const { data, error } = await supabase.from("mt_entries").select("id").limit(1)

      if (!data || data.length === 0) {
        const result = await seedInitialData()
        if (result.success) {
          // Refresh data after seeding
          const [locationsRes, routesRes, entriesRes] = await Promise.all([
            supabase.from("mt_locations").select("*").order("name"),
            supabase.from("mt_saved_routes").select("*").order("from", { ascending: true }),
            supabase
              .from("mt_entries")
              .select("*")
              .order("date", { ascending: false })
              .order("createdat", { ascending: false }),
          ])

          if (locationsRes.data) setLocations(locationsRes.data)
          if (routesRes.data) setSavedRoutes(routesRes.data)
          if (entriesRes.data) setEntries(entriesRes.data)
        }
      }
      setHasCheckedSeed(true)
    }

    checkAndSeed()
  }, [user, hasCheckedSeed, isLoading, supabase])

  // --- CRUD Actions ---
  const handleAddLocation = async (
    newLoc: Omit<Location, "id" | "createdat">, // Changed from created_at to createdat
  ) => {
    if (!user) throw new Error("Not authenticated")
    const { data, error } = await supabase
      .from("mt_locations")
      .insert({ ...newLoc, userid: user.id })
      .select()
    if (error) throw error
    if (data) {
      setLocations((prev) => [...prev, data[0] as Location].sort((a, b) => a.name.localeCompare(b.name)))
    }
  }

  const handleDeleteLocation = async (id: string) => {
    const { error } = await supabase.from("mt_locations").delete().eq("id", id)
    if (error) throw error
    setLocations((prev) => prev.filter((loc) => loc.id !== id))
  }

  // Updated handleAddRoute
  const handleAddRoute = async (newRoute: { from: string; to: string; distance: string }) => {
    if (!user) return
    const { data, error } = await supabase
      .from("mt_saved_routes")
      .insert({ ...newRoute, userid: user.id })
      .select()
    if (error) throw error
    if (data) {
      setSavedRoutes((prev) => [...prev, data[0] as SavedRoute].sort((a, b) => a.from.localeCompare(b.from)))
    }
  }

  // Updated handleUpdateRoute
  const handleUpdateRoute = async (id: string, updatedRoute: { from: string; to: string; distance: string }) => {
    const { data, error } = await supabase
      .from("mt_saved_routes")
      .update({ ...updatedRoute, updatedat: new Date().toISOString() })
      .eq("id", id)
      .select()
    if (error) throw error
    if (data) {
      setSavedRoutes((prev) =>
        prev.map((route) => (route.id === id ? (data[0] as SavedRoute) : route)),
      )
    }
  }

  const handleDeleteRoute = async (id: string) => {
    const { error } = await supabase.from("mt_saved_routes").delete().eq("id", id)
    if (error) throw error
    setSavedRoutes((prev) => prev.filter((route) => route.id !== id))
  }

  // Updated handleAddEntry
  const handleAddEntry = async (entry: Omit<Entry, "id" | "createdat">) => {
    // Changed from created_at to createdat
    if (!user) throw new Error("User not authenticated")
    console.log("[v0] Adding entry:", entry)
    console.log("[v0] User ID:", user?.id)

    const dataToInsert = {
      ...entry,
      userid: user!.id,
    }
    console.log("[v0] Data to insert:", dataToInsert)

    const { data, error } = await supabase.from("mt_entries").insert([dataToInsert]).select()

    console.log("[v0] Insert result - data:", data, "error:", error)

    if (error) {
      console.error("[v0] Database error:", error)
      throw error
    }

    console.log("[v0] Entry added successfully:", data)

    if (data && data.length > 0) {
      const { data: freshEntries } = await supabase
        .from("mt_entries")
        .select("*")
        .order("date", { ascending: false })
        .order("createdat", { ascending: false })

      if (freshEntries) {
        console.log("[v0] Manually updating entries after insert:", freshEntries.length)
        setEntries(freshEntries)
      }
    }
  }

  // Updated handleUpdateEntry
  const handleUpdateEntry = async (id: string, updatedData: Partial<Entry>) => {
    const { error } = await supabase
      .from("mt_entries")
      .update({ ...updatedData, updatedat: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error
  }

  const handleDeleteEntry = async (id: string) => {
    console.log("[v0] handleDeleteEntry called with id:", id)

    try {
      // Optimistically update the UI immediately
      setEntries((prev) => prev.filter((entry) => entry.id !== id))

      const { data, error } = await supabase.from("mt_entries").delete().eq("id", id)
      console.log("[v0] Delete result - data:", data, "error:", error)
      if (error) {
        console.error("[v0] Delete error:", error)
        // Revert the optimistic update on error
        const { data: freshEntries } = await supabase
          .from("mt_entries")
          .select("*")
          .order("date", { ascending: false })
          .order("createdat", { ascending: false })
        if (freshEntries) {
          setEntries(freshEntries)
        }
        throw new Error(error.message)
      }
    } catch (err) {
      console.error("[v0] Delete exception:", err)
      // Revert the optimistic update on error
      const { data: freshEntries } = await supabase
        .from("mt_entries")
        .select("*")
        .order("date", { ascending: false })
        .order("createdat", { ascending: false })
      if (freshEntries) {
        setEntries(freshEntries)
      }
      throw new Error(err instanceof Error ? err.message : "Failed to delete entry. Please try again.")
    }
  }

  const handleDeleteAllEntries = async () => {
    console.log("[v0] handleDeleteAllEntries called")

    if (!user) {
      throw new Error("You must be logged in to delete entries.")
    }

    try {
      // Optimistically update the UI immediately
      setEntries([])

      const { error } = await supabase.from("mt_entries").delete().eq("userid", user.id)
      console.log("[v0] Delete all result - error:", error)
      if (error) {
        console.error("[v0] Delete all error:", error)
        // Revert the optimistic update on error
        const { data: freshEntries } = await supabase
          .from("mt_entries")
          .select("*")
          .order("date", { ascending: false })
          .order("createdat", { ascending: false })
        if (freshEntries) {
          setEntries(freshEntries)
        }
        throw new Error(error.message)
      }
      console.log("[v0] Successfully deleted all entries")
    } catch (err) {
      console.error("[v0] Delete all exception:", err)
      // Revert the optimistic update on error
      const { data: freshEntries } = await supabase
        .from("mt_entries")
        .select("*")
        .order("date", { ascending: false })
        .order("createdat", { ascending: false })
      if (freshEntries) {
        setEntries(freshEntries)
      }
      throw new Error(err instanceof Error ? err.message : "Failed to delete all entries. Please try again.")
    }
  }

  const handleRefreshEntries = async () => {
    const { data } = await supabase
      .from("mt_entries")
      .select("*")
      .order("date", { ascending: false })
      .order("createdat", { ascending: false })

    if (data) {
      setEntries(data)
      console.log("[v0] Manually refreshed entries:", data.length)
    }
  }

  // --- Import sample data ---

  const exportToCSV = () => {
    const headers = [
      "Date",
      "Starting Point",
      "1st Stop",
      "2nd Stop",
      "3rd Stop",
      "4th Stop",
      "Finish Point",
      "Clients Visited",
      "Description",
      "Total Miles",
      "Claim Rate",
      "Claim Value",
      "Charge Rate",
      "Charge Value",
      "Comments",
    ]
    const rows = entries.map((e) => [
      e.date,
      e.startPoint, // Changed from e.start_point
      e.stop1 || "",
      e.stop2 || "",
      e.stop3 || "",
      e.stop4 || "",
      e.finishPoint, // Changed from e.finish_point
      `"${e.clientsVisited || ""}"`, // Changed from e.clients_visited
      `"${e.description || ""}"`,
      e.totalMiles, // Changed from e.total_miles
      e.claimRate, // Changed from e.claim_rate
      e.totalClaim,
      e.chargeRate, // Changed from e.charge_rate
      e.totalCharge,
      `"${e.comments || ""}"`,
    ])
    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    link.setAttribute("href", url)
    link.setAttribute("download", `mileage_tracker_export_${getTodayLocalDate()}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast({
      title: "Export ready",
      description: "Your mileage CSV has been downloaded.",
    })
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="sticky top-0 z-50 bg-indigo-900 text-white shadow-lg pt-safe-or-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pl-safe pr-safe">
          <div className="py-3 sm:py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="bg-white/10 p-1.5 rounded-lg shrink-0">
                  <Image
                    src="/mileage-tracker-pro-icon.png"
                    alt="Mileage Tracker Pro"
                    width={28}
                    height={28}
                    priority
                    className="h-7 w-7 rounded-md object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl font-bold tracking-tight truncate">Mileage Tracker Pro</h1>
                  <div className="flex items-center gap-1.5 text-indigo-200 text-xs">
                    {user ? (
                      <>
                        <Cloud className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-100">Cloud Connected</span>
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-orange-400" />
                        <span className="text-orange-100">Connecting...</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium text-indigo-200 hover:bg-white/10 transition-colors flex items-center gap-2 min-h-[44px]"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
                <span className="sm:hidden">Log out</span>
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>

            <div className="mt-3">
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                <button
                  onClick={() => setActiveTab("tracker")}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === "tracker" ? "bg-white text-indigo-900 shadow-sm" : "text-indigo-200 hover:bg-white/10"}`}
                >
                  My Trips
                </button>
                <button
                  onClick={() => setActiveTab("locations")}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === "locations" ? "bg-white text-indigo-900 shadow-sm" : "text-indigo-200 hover:bg-white/10"}`}
                >
                  <span className="sm:hidden">Locations</span>
                  <span className="hidden sm:inline">Locations & Routes</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pl-safe pr-safe py-4 sm:py-8 pb-[calc(env(safe-area-inset-bottom)+5.25rem)] md:pb-safe">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-500" />
            <p>Loading your tracker data...</p>
          </div>
        ) : activeTab === "tracker" ? (
          <TrackerView
            user={user}
            locations={locations}
            savedRoutes={savedRoutes}
            entries={entries}
            onAddEntry={handleAddEntry}
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onDeleteAll={handleDeleteAllEntries}
            onExport={exportToCSV}
            onRefresh={handleRefreshEntries}
            onOpenLocationsTab={() => setActiveTab("locations")}
          />
        ) : (
          <LocationsView
            user={user}
            locations={locations}
            savedRoutes={savedRoutes}
            onAddLocation={handleAddLocation}
            onDeleteLocation={handleDeleteLocation}
            onAddRoute={handleAddRoute}
            onUpdateRoute={handleUpdateRoute}
            onDeleteRoute={handleDeleteRoute}
          />
        )}
      </main>

      <div className="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-slate-400">
        User ID: <span className="font-mono">{user?.id?.slice(0, 8) || "..."}</span>
      </div>
    </div>
  )
}

// --- Tracker View ---
const TrackerView = ({
  user,
  locations,
  savedRoutes,
  entries,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onDeleteAll,
  onExport,
  onRefresh,
  onOpenLocationsTab,
}: {
  user: { id: string } | null
  locations: Location[]
  savedRoutes: SavedRoute[]
  entries: Entry[]
  onAddEntry: (entry: Omit<Entry, "id" | "createdat">) => Promise<void> // Changed from created_at to createdat
  onUpdateEntry: (id: string, data: Partial<Entry>) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
  onDeleteAll: () => Promise<void>
  onExport: () => void
  onRefresh: () => Promise<void>
  onOpenLocationsTab: () => void
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [entryIdToDelete, setEntryIdToDelete] = useState<string | null>(null)
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false)
  const [isDeletingEntry, setIsDeletingEntry] = useState(false)
  const [isDeletingAll, setIsDeletingAll] = useState(false)
  const [assistantMode, setAssistantMode] = useState<"freeform" | "guided">("freeform")
  const [quickAddText, setQuickAddText] = useState("")
  const [guidedStart, setGuidedStart] = useState("")
  const [guidedStops, setGuidedStops] = useState("")
  const [guidedFinish, setGuidedFinish] = useState("")
  const [guidedPurpose, setGuidedPurpose] = useState("")
  const [isParsingQuickAdd, setIsParsingQuickAdd] = useState(false)
  const [quickDraft, setQuickDraft] = useState<QuickTripDraft | null>(null)
  const [draftAdhocNames, setDraftAdhocNames] = useState<string[]>([])
  const [mobileDetailsEntryId, setMobileDetailsEntryId] = useState<string | null>(null)
  const [newlyAddedEntryIds, setNewlyAddedEntryIds] = useState<Record<string, true>>({})
  const [monthlyStartMileage, setMonthlyStartMileage] = useState("")
  const [currentMileage, setCurrentMileage] = useState("")
  const [monthlyVehicleCost, setMonthlyVehicleCost] = useState("")
  const previousEntryIdsRef = useRef<Set<string>>(new Set())
  const locale = useMemo(() => (typeof navigator !== "undefined" ? navigator.language : "en-GB"), [])
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [locale],
  )
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: DEFAULT_CURRENCY,
        maximumFractionDigits: 2,
      }),
    [locale],
  )

  const [formData, setFormData] = useState({
    date: getTodayLocalDate(),
    startPoint: "",
    stop1: "",
    stop2: "",
    stop3: "",
    stop4: "",
    finishPoint: "",
    clientsVisited: "",
    description: "",
    totalMiles: "",
    claimRate: DEFAULT_CLAIM_RATE,
    chargeRate: DEFAULT_CHARGE_RATE,
  })

  const [legDistances, setLegDistances] = useState<Record<string, string>>({})

  const resetForm = () => {
    setFormData({
      date: getTodayLocalDate(),
      startPoint: "",
      stop1: "",
      stop2: "",
      stop3: "",
      stop4: "",
      finishPoint: "",
      clientsVisited: "",
      description: "",
      totalMiles: "",
      claimRate: DEFAULT_CLAIM_RATE,
      chargeRate: DEFAULT_CHARGE_RATE,
    })
    setLegDistances({})
    setDraftAdhocNames([])
    setEditingId(null)
    setIsFormOpen(false)
  }

  const handleEditClick = (entry: Entry) => {
    setMobileDetailsEntryId(null)
    setFormData({
      date: entry.date,
      startPoint: entry.startPoint,
      stop1: entry.stop1 || "",
      stop2: entry.stop2 || "",
      stop3: entry.stop3 || "",
      stop4: entry.stop4 || "",
      finishPoint: entry.finishPoint,
      clientsVisited: entry.clientsVisited || "",
      description: entry.description || "",
      totalMiles: entry.totalMiles,
      claimRate: entry.claimRate || DEFAULT_CLAIM_RATE,
      chargeRate: entry.chargeRate || DEFAULT_CHARGE_RATE,
    })
    setEditingId(entry.id)
    setIsFormOpen(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const getRouteLegs = () => {
    const route: { id: string; name: string }[] = []
    if (formData.startPoint) route.push({ id: "start", name: formData.startPoint })
    if (formData.stop1) route.push({ id: "stop1", name: formData.stop1 })
    if (formData.stop2) route.push({ id: "stop2", name: formData.stop2 })
    if (formData.stop3) route.push({ id: "stop3", name: formData.stop3 })
    if (formData.stop4) route.push({ id: "stop4", name: formData.stop4 })
    if (formData.finishPoint) route.push({ id: "finish", name: formData.finishPoint })

    const legs: { from: string; to: string; id: string }[] = []
    for (let i = 0; i < route.length - 1; i++) {
      legs.push({
        from: route[i].name,
        to: route[i + 1].name,
        id: `${route[i].id}-${route[i + 1].id}`,
      })
    }
    return legs
  }

  const legs = getRouteLegs()
  const hasMultipleLegs = legs.length > 0

  useEffect(() => {
    const newLegDistances = { ...legDistances }
    let hasChanges = false
    let newTotal = 0

    legs.forEach((leg) => {
      if (newLegDistances[leg.id]) {
        newTotal += Number.parseFloat(newLegDistances[leg.id]) || 0
      } else {
        const match = savedRoutes.find(
          (r) => (r.from === leg.from && r.to === leg.to) || (r.from === leg.to && r.to === leg.from),
        )

        if (match) {
          newLegDistances[leg.id] = match.distance
          newTotal += Number.parseFloat(match.distance) || 0
          hasChanges = true
        }
      }
    })

    if (hasChanges) {
      setLegDistances(newLegDistances)
      setFormData((prev) => ({ ...prev, totalMiles: newTotal > 0 ? newTotal.toString() : "" }))
    } else {
      let currentTotal = 0
      legs.forEach((leg) => {
        if (newLegDistances[leg.id]) {
          currentTotal += Number.parseFloat(newLegDistances[leg.id]) || 0
        }
      })

      if (currentTotal.toString() !== formData.totalMiles && currentTotal > 0) {
        setFormData((prev) => ({ ...prev, totalMiles: currentTotal.toString() }))
      }
    }
  }, [
    formData.startPoint,
    formData.stop1,
    formData.stop2,
    formData.stop3,
    formData.stop4,
    formData.finishPoint,
    savedRoutes,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ])

  const handleLegChange = (id: string, value: string) => {
    const newLegs = { ...legDistances, [id]: value }
    setLegDistances(newLegs)
    let total = 0
    legs.forEach((leg) => {
      const val = leg.id === id ? value : newLegs[leg.id]
      total += Number.parseFloat(val) || 0
    })
    setFormData((prev) => ({ ...prev, totalMiles: total > 0 ? total.toString() : "" }))
  }

  const totalClaim = (
    Number.parseFloat(formData.totalMiles || "0") * Number.parseFloat(formData.claimRate || "0")
  ).toFixed(2)
  const totalCharge = (
    Number.parseFloat(formData.totalMiles || "0") * Number.parseFloat(formData.chargeRate || "0")
  ).toFixed(2)
  const formatDate = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`)
    if (Number.isNaN(parsed.getTime())) {
      return value
    }
    return dateFormatter.format(parsed)
  }
  const formatCurrency = (value: number | string) => {
    const parsed = typeof value === "number" ? value : Number.parseFloat(value || "0")
    return currencyFormatter.format(Number.isNaN(parsed) ? 0 : parsed)
  }
  const mobileDetailsEntry = useMemo(
    () => entries.find((entry) => entry.id === mobileDetailsEntryId) || null,
    [entries, mobileDetailsEntryId],
  )
  const totals = useMemo(
    () =>
      entries.reduce(
        (acc, curr) => {
          acc.miles += Number.parseFloat(curr.totalMiles) || 0
          acc.claim += Number.parseFloat(curr.totalClaim) || 0
          acc.charge += Number.parseFloat(curr.totalCharge) || 0
          return acc
        },
        { miles: 0, claim: 0, charge: 0 },
      ),
    [entries],
  )
  const currentMonthKey = useMemo(() => getTodayLocalDate().slice(0, 7), [])
  const monthlyBusinessMiles = useMemo(
    () =>
      entries.reduce((acc, entry) => {
        if (!entry.date.startsWith(currentMonthKey)) return acc
        return acc + (Number.parseFloat(entry.totalMiles) || 0)
      }, 0),
    [entries, currentMonthKey],
  )
  const monthlyClaimable = useMemo(
    () =>
      entries.reduce((acc, entry) => {
        if (!entry.date.startsWith(currentMonthKey)) return acc
        return acc + (Number.parseFloat(entry.totalClaim) || 0)
      }, 0),
    [entries, currentMonthKey],
  )
  const totalVehicleMiles = Math.max(0, (Number.parseFloat(currentMileage) || 0) - (Number.parseFloat(monthlyStartMileage) || 0))
  const personalMiles = Math.max(0, totalVehicleMiles - monthlyBusinessMiles)
  const businessCostShare =
    totalVehicleMiles > 0 ? ((Number.parseFloat(monthlyVehicleCost) || 0) * monthlyBusinessMiles) / totalVehicleMiles : 0
  const claimVsBusinessCost = monthlyClaimable - businessCostShare

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return
    const raw = window.localStorage.getItem(`mileage-insights:${user.id}`)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as {
        monthlyStartMileage?: string
        currentMileage?: string
        monthlyVehicleCost?: string
      }
      setMonthlyStartMileage(parsed.monthlyStartMileage || "")
      setCurrentMileage(parsed.currentMileage || "")
      setMonthlyVehicleCost(parsed.monthlyVehicleCost || "")
    } catch {
      // Ignore malformed localStorage and use default empty values.
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return
    window.localStorage.setItem(
      `mileage-insights:${user.id}`,
      JSON.stringify({ monthlyStartMileage, currentMileage, monthlyVehicleCost }),
    )
  }, [user?.id, monthlyStartMileage, currentMileage, monthlyVehicleCost])

  useEffect(() => {
    const currentIds = new Set(entries.map((entry) => entry.id))

    if (previousEntryIdsRef.current.size === 0) {
      previousEntryIdsRef.current = currentIds
      return
    }

    const insertedIds = Array.from(currentIds).filter((id) => !previousEntryIdsRef.current.has(id))
    if (insertedIds.length === 0) {
      previousEntryIdsRef.current = currentIds
      return
    }

    setNewlyAddedEntryIds((prev) => {
      const next = { ...prev }
      insertedIds.forEach((id) => {
        next[id] = true
      })
      return next
    })

    const timeout = setTimeout(() => {
      setNewlyAddedEntryIds((prev) => {
        const next = { ...prev }
        insertedIds.forEach((id) => {
          delete next[id]
        })
        return next
      })
    }, 2200)

    previousEntryIdsRef.current = currentIds
    return () => clearTimeout(timeout)
  }, [entries])

  useEffect(() => {
    if (mobileDetailsEntryId && !entries.some((entry) => entry.id === mobileDetailsEntryId)) {
      setMobileDetailsEntryId(null)
    }
  }, [entries, mobileDetailsEntryId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log("[v0] ========== FORM SUBMIT START ==========")
    console.log("[v0] User:", user)
    console.log("[v0] Form Data:", formData)
    console.log("[v0] Total Claim:", totalClaim, "Total Charge:", totalCharge)

    if (!user) {
      console.log("[v0] No user - showing toast")
      toast({
        title: "Still connecting",
        description: "Wait for Cloud Connected in the header, then try again.",
        variant: "destructive",
      })
      return
    }

    if (!formData.startPoint || !formData.finishPoint || !formData.date || !formData.totalMiles) {
      toast({
        title: "Missing required fields",
        description: "Date, starting point, finish point, and total miles are required.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    console.log("[v0] Starting save operation...")

    try {
      const entryData = { ...formData, totalClaim, totalCharge }
      console.log("[v0] Entry data to save:", entryData)

      if (editingId) {
        console.log("[v0] Updating entry:", editingId)
        await onUpdateEntry(editingId, entryData)
      } else {
        console.log("[v0] Adding new entry")
        await onAddEntry(entryData as any)
      }

      console.log("[v0] Save successful, resetting form")
      resetForm()
      toast({
        title: editingId ? "Trip updated" : "Trip saved",
        description: "Your mileage entry is now in your recent trips list.",
      })
      console.log("[v0] ========== FORM SUBMIT SUCCESS ==========")
    } catch (err: any) {
      console.error("[v0] ========== FORM SUBMIT ERROR ==========")
      console.error("[v0] Error object:", err)
      console.error("[v0] Error message:", err.message)
      console.error("[v0] Error stack:", err.stack)
      toast({
        title: "Could not save trip",
        description: err.message || "Please check your connection and try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }
  const openTripForm = () => {
    if (locations.length < 2) {
      toast({
        title: "Add locations first",
        description: "Create at least two saved locations before adding a trip.",
        variant: "destructive",
      })
      return
    }
    resetForm()
    setIsFormOpen((prev) => !prev)
  }
  const confirmDeleteEntry = async () => {
    if (!entryIdToDelete) return
    setIsDeletingEntry(true)
    try {
      await onDeleteEntry(entryIdToDelete)
      toast({
        title: "Trip deleted",
        description: "The selected trip has been removed.",
      })
      setEntryIdToDelete(null)
    } catch (error) {
      toast({
        title: "Could not delete trip",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeletingEntry(false)
    }
  }
  const confirmDeleteAllEntries = async () => {
    setIsDeletingAll(true)
    try {
      await onDeleteAll()
      toast({
        title: "All trips deleted",
        description: "Your entries list has been cleared.",
      })
      setIsDeleteAllOpen(false)
    } catch (error) {
      toast({
        title: "Could not delete all trips",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeletingAll(false)
    }
  }

  const buildGuidedNote = () => {
    const stopsText = guidedStops
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .join(", ")
    const visitPart = stopsText ? `visited ${stopsText}` : "made no intermediate stops"
    const purposePart = guidedPurpose.trim() ? ` for ${guidedPurpose.trim()}` : ""
    return `Today I left ${guidedStart || "[start]"}, ${visitPart}, and finished at ${guidedFinish || "[finish]"}${purposePart}.`
  }

  const parseQuickAdd = async (sourceText?: string) => {
    const textToParse = (sourceText || quickAddText).trim()
    if (!textToParse) {
      toast({
        title: "Add a trip note first",
        description: "Type a free-text trip note or use guided prompts.",
        variant: "destructive",
      })
      return
    }

    if (locations.length === 0) {
      toast({
        title: "No locations available",
        description: "Add saved locations before using AI Quick Add.",
        variant: "destructive",
      })
      return
    }

    setIsParsingQuickAdd(true)
    try {
      const response = await fetch("/api/ai/quick-trip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: textToParse,
          today: getTodayLocalDate(),
          locations,
          savedRoutes,
        }),
      })

      const data = (await response.json()) as QuickTripDraft | QuickTripErrorResponse
      if (!response.ok || "error" in data) {
        throw new Error(
          getQuickAddErrorMessage(response.status, "error" in data ? data : { error: "Could not parse trip note." }),
        )
      }

      setQuickDraft(data)
      toast({
        title: "Draft parsed",
        description: "Review details, then add it to the table or open it in the form.",
      })
    } catch (error) {
      toast({
        title: "AI parse failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsParsingQuickAdd(false)
    }
  }

  const mapLegDistancesToFormIds = (trip: QuickTripDraft["trip"], draftLegs: QuickTripDraft["distance"]["legs"]) => {
    const route: Array<{ fieldId: string; name: string }> = []
    if (trip.startPoint) route.push({ fieldId: "start", name: trip.startPoint })
    if (trip.stop1) route.push({ fieldId: "stop1", name: trip.stop1 })
    if (trip.stop2) route.push({ fieldId: "stop2", name: trip.stop2 })
    if (trip.stop3) route.push({ fieldId: "stop3", name: trip.stop3 })
    if (trip.stop4) route.push({ fieldId: "stop4", name: trip.stop4 })
    if (trip.finishPoint) route.push({ fieldId: "finish", name: trip.finishPoint })

    const result: Record<string, string> = {}

    for (let i = 0; i < route.length - 1; i += 1) {
      const from = route[i].name
      const to = route[i + 1].name
      const leg = draftLegs.find(
        (item) => (item.from === from && item.to === to) || (item.from === to && item.to === from),
      )
      if (leg?.distance) {
        result[`${route[i].fieldId}-${route[i + 1].fieldId}`] = leg.distance
      }
    }

    return result
  }

  const applyQuickDraftToForm = () => {
    if (!quickDraft) return
    const trip = quickDraft.trip

    setDraftAdhocNames(quickDraft.adhocLocations || [])
    setFormData({
      date: trip.date || getTodayLocalDate(),
      startPoint: trip.startPoint || "",
      stop1: trip.stop1 || "",
      stop2: trip.stop2 || "",
      stop3: trip.stop3 || "",
      stop4: trip.stop4 || "",
      finishPoint: trip.finishPoint || "",
      clientsVisited: trip.clientsVisited || "",
      description: trip.description || "",
      totalMiles: quickDraft.distance.totalMiles || "",
      claimRate: DEFAULT_CLAIM_RATE,
      chargeRate: DEFAULT_CHARGE_RATE,
    })
    setLegDistances(mapLegDistancesToFormIds(trip, quickDraft.distance.legs))
    setEditingId(null)
    setIsFormOpen(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const addQuickDraftToTable = async () => {
    if (!quickDraft) return
    const trip = quickDraft.trip
    const totalMiles = quickDraft.distance.totalMiles || ""

    if (!trip.startPoint || !trip.finishPoint || !trip.date || !totalMiles) {
      toast({
        title: "Draft needs review",
        description: "Open in form to complete missing fields or distance.",
        variant: "destructive",
      })
      return
    }

    const claimRate = DEFAULT_CLAIM_RATE
    const chargeRate = DEFAULT_CHARGE_RATE
    const totalClaim = (Number.parseFloat(totalMiles) * Number.parseFloat(claimRate)).toFixed(2)
    const totalCharge = (Number.parseFloat(totalMiles) * Number.parseFloat(chargeRate)).toFixed(2)

    try {
      await onAddEntry({
        date: trip.date,
        startPoint: trip.startPoint,
        stop1: trip.stop1 || "",
        stop2: trip.stop2 || "",
        stop3: trip.stop3 || "",
        stop4: trip.stop4 || "",
        finishPoint: trip.finishPoint,
        clientsVisited: trip.clientsVisited || "",
        description: trip.description || "",
        totalMiles,
        claimRate,
        chargeRate,
        totalClaim,
        totalCharge,
      })
      setQuickDraft(null)
      setQuickAddText("")
      toast({
        title: "Trip added",
        description: "AI draft was added directly to your entries.",
      })
    } catch (error) {
      toast({
        title: "Could not add trip",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  const locationOptions = useMemo(() => {
    const savedOpts = locations.map((l) => ({ value: l.name, label: l.name }))
    const savedNames = new Set(locations.map((l) => l.name))
    const adhocOpts = draftAdhocNames
      .filter((name) => !savedNames.has(name))
      .map((name) => ({ value: name, label: `${name} (ad-hoc)` }))
    return [...savedOpts, ...adhocOpts]
  }, [locations, draftAdhocNames])

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 md:pb-0">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
        <Card className="p-3 sm:p-4 flex items-center justify-between bg-white">
          <div>
            <p className="text-slate-500 text-xs sm:text-sm font-medium">Total Miles</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-800">{totals.miles.toFixed(1)}</p>
          </div>
          <Navigation className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-500 opacity-20" />
        </Card>
        <Card className="p-3 sm:p-4 flex items-center justify-between bg-white border-emerald-200 border-l-4">
          <div>
            <p className="text-emerald-700 text-xs sm:text-sm font-medium">Total Claimable</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-emerald-600">{formatCurrency(totals.claim)}</p>
          </div>
          <PoundSterling className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-500 opacity-20" />
        </Card>
        <Card className="col-span-2 sm:col-span-1 p-3 sm:p-4 flex items-center justify-between bg-white border-blue-200 border-l-4">
          <div>
            <p className="text-blue-700 text-xs sm:text-sm font-medium">Total Chargeable</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-600">{formatCurrency(totals.charge)}</p>
          </div>
          <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-blue-500 opacity-20" />
        </Card>
      </div>

      <Card className="p-3 sm:p-4 md:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Car className="w-5 h-5 text-indigo-600" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Vehicle Mileage & Cost Check</p>
            <p className="text-xs text-slate-500">Track personal miles and compare business claimable against your running costs.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="Month Start Odometer"
            type="number"
            value={monthlyStartMileage}
            onChange={(e) => setMonthlyStartMileage(e.target.value)}
            placeholder="e.g. 42100"
          />
          <Input
            label="Current Odometer"
            type="number"
            value={currentMileage}
            onChange={(e) => setCurrentMileage(e.target.value)}
            placeholder="e.g. 42640"
          />
          <Input
            label="Monthly Vehicle Cost (£)"
            type="number"
            value={monthlyVehicleCost}
            onChange={(e) => setMonthlyVehicleCost(e.target.value)}
            placeholder="e.g. 400"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Vehicle Miles</p>
            <p className="text-lg font-bold text-slate-800">{totalVehicleMiles.toFixed(1)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Business Miles (Month)</p>
            <p className="text-lg font-bold text-indigo-700">{monthlyBusinessMiles.toFixed(1)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Personal Miles</p>
            <p className="text-lg font-bold text-orange-600">{personalMiles.toFixed(1)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Business Cost Share</p>
            <p className="text-lg font-bold text-slate-800">{formatCurrency(businessCostShare)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Claimable vs Cost</p>
            <p className={`text-lg font-bold ${claimVsBusinessCost >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatCurrency(claimVsBusinessCost)}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-3 sm:p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-800">AI Trip Assistant</p>
            <p className="text-xs text-slate-500">
              Describe a trip in plain English, or use guided prompts. AI will prepare a draft.
            </p>
          </div>
          <div className="flex w-full sm:w-auto rounded-lg border border-slate-200 p-1">
            <button
              type="button"
              onClick={() => setAssistantMode("freeform")}
              className={`flex-1 sm:flex-none rounded-md px-3 py-1.5 text-xs font-medium ${assistantMode === "freeform" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Free Text
            </button>
            <button
              type="button"
              onClick={() => setAssistantMode("guided")}
              className={`flex-1 sm:flex-none rounded-md px-3 py-1.5 text-xs font-medium ${assistantMode === "guided" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Guided
            </button>
          </div>
        </div>

        {assistantMode === "freeform" ? (
          <div className="mt-4 space-y-3">
            <textarea
              value={quickAddText}
              onChange={(e) => setQuickAddText(e.target.value)}
              rows={4}
              placeholder='Example: "Today I left Home, visited Client A then Client B, then back to Office for H&S audit."'
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void parseQuickAdd()} disabled={isParsingQuickAdd}>
                {isParsingQuickAdd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isParsingQuickAdd ? "Parsing..." : "Parse With AI"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Select
              label="Start"
              options={locationOptions}
              value={guidedStart}
              onChange={(e) => setGuidedStart(e.target.value)}
            />
            <Select
              label="Finish"
              options={locationOptions}
              value={guidedFinish}
              onChange={(e) => setGuidedFinish(e.target.value)}
            />
            <Input
              label="Stops (comma separated)"
              value={guidedStops}
              placeholder="Client A, Client B"
              onChange={(e) => setGuidedStops(e.target.value)}
              className="md:col-span-2"
            />
            <Input
              label="Purpose"
              value={guidedPurpose}
              placeholder="H&S audits"
              onChange={(e) => setGuidedPurpose(e.target.value)}
              className="md:col-span-2"
            />
            <div className="md:col-span-2 flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  const note = buildGuidedNote()
                  setQuickAddText(note)
                  void parseQuickAdd(note)
                }}
                disabled={isParsingQuickAdd}
              >
                {isParsingQuickAdd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {isParsingQuickAdd ? "Parsing..." : "Build Draft"}
              </Button>
            </div>
          </div>
        )}

        {quickDraft && (
          <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-white px-2 py-1 font-semibold text-slate-700 border border-slate-200">
                Confidence: {quickDraft.confidence}
              </span>
              {quickDraft.metadata.usedGoogleMaps && (
                <span className="rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 border border-emerald-200">
                  Distances via Google Maps
                </span>
              )}
              {quickDraft.adhocLocations && quickDraft.adhocLocations.length > 0 && (
                <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-1 font-semibold border border-blue-200">
                  Ad-hoc: {quickDraft.adhocLocations.join(", ")}
                </span>
              )}
            </div>

            {/* Maps API not configured banner */}
            {quickDraft.adhocLocations &&
              quickDraft.adhocLocations.length > 0 &&
              quickDraft.metadata.mapsApiConfigured === false && (
                <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                  <span className="font-bold">Google Maps API key not configured.</span>{" "}
                  Ad-hoc locations need the <code className="bg-amber-100 px-1 rounded">GOOGLE_MAPS_API_KEY</code>{" "}
                  environment variable to auto-calculate distances. Add it to{" "}
                  <code className="bg-amber-100 px-1 rounded">.env.local</code> (or Vercel env vars) and redeploy.
                </div>
              )}

            {/* Maps API error banner */}
            {quickDraft.metadata.mapsApiConfigured !== false &&
              quickDraft.distance.legs.some((leg) => leg.error) && (
                <div className="rounded-md bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1">
                  <span className="font-bold">Google Maps distance lookup failed:</span>
                  {quickDraft.distance.legs
                    .filter((leg) => leg.error)
                    .map((leg, index) => (
                      <div key={`leg-err-${index}`}>
                        {leg.from} → {leg.to}: {leg.error}
                      </div>
                    ))}
                </div>
              )}

            <div className="text-sm text-slate-700">
              <span className="font-semibold">{formatDate(quickDraft.trip.date)}</span>
              <span className="mx-2 text-slate-400">|</span>
              {(() => {
                const adhocSet = new Set(quickDraft.adhocLocations || [])
                const allPoints = [
                  quickDraft.trip.startPoint,
                  quickDraft.trip.stop1,
                  quickDraft.trip.stop2,
                  quickDraft.trip.stop3,
                  quickDraft.trip.stop4,
                  quickDraft.trip.finishPoint,
                ].filter(Boolean)
                return allPoints.map((point, index) => (
                  <span key={`draft-point-${index}`}>
                    {index > 0 && <span className="mx-1 text-slate-400">{"->"}</span>}
                    <span className={adhocSet.has(point) ? "text-blue-700 font-semibold" : ""}>
                      {point}
                    </span>
                  </span>
                ))
              })()}
              {!quickDraft.trip.startPoint && !quickDraft.trip.finishPoint && <span>?</span>}
            </div>

            {quickDraft.distance.legs.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {quickDraft.distance.legs.map((leg, index) => (
                  <div
                    key={`draft-leg-${index}`}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1 border ${
                      leg.source === "google_maps"
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : leg.source === "saved_route"
                          ? "bg-white border-slate-200 text-slate-600"
                          : "bg-amber-50 border-amber-200 text-amber-700"
                    }`}
                  >
                    <span className="font-medium truncate max-w-[80px]">{leg.from}</span>
                    <ArrowRight className="w-3 h-3 flex-shrink-0 opacity-50" />
                    <span className="font-medium truncate max-w-[80px]">{leg.to}</span>
                    <span className="font-bold">
                      {leg.distance ? `${leg.distance} mi` : "?"}
                    </span>
                    {leg.source === "google_maps" && (
                      <span className="text-[10px] opacity-70">Maps</span>
                    )}
                    {leg.source === "saved_route" && (
                      <span className="text-[10px] opacity-70">Saved</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="text-xs text-slate-600">
              Total Miles: <span className="font-semibold">{quickDraft.distance.totalMiles || "Not calculated"}</span>
              {quickDraft.distance.missingLegs.length > 0 && (
                <span className="ml-2 text-amber-700">
                  Missing distances: {quickDraft.distance.missingLegs.join(", ")}
                </span>
              )}
            </div>

            {quickDraft.trip.description && (
              <p className="text-sm text-slate-700">
                <span className="font-semibold">Description:</span> {quickDraft.trip.description}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={applyQuickDraftToForm}>
                Review In Form
              </Button>
              <Button onClick={() => void addQuickDraftToTable()}>Add To Table</Button>
              <Button variant="secondary" onClick={() => setQuickDraft(null)}>
                Dismiss Draft
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3">
        <h2 className="text-base sm:text-lg font-bold text-slate-800">Recent Entries</h2>
        <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:flex-wrap sm:w-auto">
          <Button variant="secondary" onClick={onRefresh} className="w-full sm:w-auto">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </Button>
          <Button variant="secondary" onClick={onExport} className="hidden md:flex w-full sm:w-auto">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          {entries.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => setIsDeleteAllOpen(true)}
              className="w-full sm:w-auto text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Delete All</span>
              <span className="sm:hidden">Delete</span>
            </Button>
          )}
          <Button onClick={openTripForm} disabled={!user} className="hidden md:flex w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Add New Trip
          </Button>
        </div>
      </div>

      <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 rounded-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-2 px-2 py-2">
          <Button variant="secondary" onClick={onExport} className="w-full">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button onClick={openTripForm} disabled={!user} className="w-full">
            <Plus className="w-4 h-4" />
            New Trip
          </Button>
        </div>
      </div>

      {/* Entry Form */}
      {isFormOpen && (
        <Card
          className={`p-4 sm:p-6 bg-white border-2 shadow-lg ring-4 animate-in slide-in-from-top-4 duration-300 ${editingId ? "border-orange-200 ring-orange-50" : "border-indigo-100 ring-indigo-50"}`}
        >
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className={`font-bold flex items-center gap-2 ${editingId ? "text-orange-600" : "text-indigo-900"}`}>
                {editingId ? (
                  <>
                    <Pencil className="w-5 h-5" /> Editing Trip
                  </>
                ) : (
                  "New Mileage Entry"
                )}
              </h3>
              <button type="button" onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                type="date"
                label="Date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              />
              <Select
                label="Starting Point"
                options={locationOptions}
                value={formData.startPoint}
                onChange={(e) => setFormData({ ...formData, startPoint: e.target.value })}
              />
              <Select
                label="Finish Point"
                options={locationOptions}
                value={formData.finishPoint}
                onChange={(e) => setFormData({ ...formData, finishPoint: e.target.value })}
              />
              <Input
                label="Clients Visited"
                placeholder="e.g. John Doe"
                value={formData.clientsVisited}
                onChange={(e) => setFormData({ ...formData, clientsVisited: e.target.value })}
              />
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 block">
                Intermediate Stops (Optional)
              </span>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Select
                  label="1st Stop"
                  placeholder="None"
                  options={locationOptions}
                  value={formData.stop1}
                  onChange={(e) => setFormData({ ...formData, stop1: e.target.value })}
                />
                <Select
                  label="2nd Stop"
                  placeholder="None"
                  options={locationOptions}
                  value={formData.stop2}
                  onChange={(e) => setFormData({ ...formData, stop2: e.target.value })}
                />
                <Select
                  label="3rd Stop"
                  placeholder="None"
                  options={locationOptions}
                  value={formData.stop3}
                  onChange={(e) => setFormData({ ...formData, stop3: e.target.value })}
                />
                <Select
                  label="4th Stop"
                  placeholder="None"
                  options={locationOptions}
                  value={formData.stop4}
                  onChange={(e) => setFormData({ ...formData, stop4: e.target.value })}
                />
              </div>
            </div>

            {hasMultipleLegs && (
              <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                <div className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Navigation className="w-3 h-3" /> Route Breakdown (Auto-fills from Saved Routes)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {legs.map((leg) => (
                    <div
                      key={leg.id}
                      className="flex items-center gap-2 bg-white p-2 rounded border border-indigo-200 shadow-sm"
                    >
                      <div className="flex-1 text-xs text-slate-600 truncate flex items-center gap-1">
                        <span className="font-medium">{leg.from}</span>
                        <ArrowRight className="w-3 h-3 text-indigo-300 flex-shrink-0" />
                        <span className="font-medium">{leg.to}</span>
                      </div>
                      <div className="w-20">
                        <input
                          type="number"
                          placeholder="0"
                          className="w-full text-right bg-slate-50 border-b border-indigo-200 focus:outline-none focus:border-indigo-500 text-sm font-medium text-slate-700"
                          value={legDistances[leg.id] || ""}
                          onChange={(e) => handleLegChange(leg.id, e.target.value)}
                        />
                      </div>
                      <span className="text-xs text-slate-400">mi</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              <Input
                label="Description"
                placeholder="Meeting purpose etc."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Miles</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0.0"
                      value={formData.totalMiles}
                      onChange={(e) => setFormData({ ...formData, totalMiles: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-bold"
                    />
                  </div>
                </div>
              </div>
              <div className="md:col-span-2">
                <Input
                  type="number"
                  label={`Claim Rate (${DEFAULT_CURRENCY})`}
                  value={formData.claimRate}
                  onChange={(e) => setFormData({ ...formData, claimRate: e.target.value })}
                />
              </div>
              <div className="md:col-span-2 pb-2">
                <div className="text-xl font-bold text-emerald-600">{formatCurrency(totalClaim)}</div>
                <div className="text-[10px] text-emerald-700 uppercase font-bold">Claimable</div>
              </div>
              <div className="md:col-span-2">
                <Input
                  type="number"
                  label={`Charge Rate (${DEFAULT_CURRENCY})`}
                  value={formData.chargeRate}
                  onChange={(e) => setFormData({ ...formData, chargeRate: e.target.value })}
                />
              </div>
              <div className="md:col-span-2 pb-2">
                <div className="text-xl font-bold text-blue-600">{formatCurrency(totalCharge)}</div>
                <div className="text-[10px] text-blue-700 uppercase font-bold">Chargeable</div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isSaving || !user}>
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving ? "Saving..." : editingId ? "Update Trip" : "Save Trip"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Data Table */}
      <Card className="overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[920px] text-sm text-left">
            <thead className="bg-indigo-900 text-white uppercase text-xs font-semibold">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 whitespace-nowrap">Route</th>
                <th className="px-4 py-3 whitespace-nowrap">Clients</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Miles</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Claim ({DEFAULT_CURRENCY})</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Charge ({DEFAULT_CURRENCY})</th>
                <th className="px-4 py-3 whitespace-nowrap">Description</th>
                <th className="px-4 py-3 whitespace-nowrap w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                      <div className="rounded-full bg-indigo-50 p-3">
                        <Navigation className="h-5 w-5 text-indigo-500" />
                      </div>
                      <p className="font-semibold text-slate-700">No trips recorded yet</p>
                      <p className="text-sm text-slate-500">
                        Add your first trip to start seeing mileage totals and report-ready values.
                      </p>
                      <div className="mt-1 flex gap-2">
                        <Button onClick={openTripForm}>
                          <Plus className="w-4 h-4" />
                          Add First Trip
                        </Button>
                        <Button variant="secondary" onClick={onOpenLocationsTab}>
                          Manage Locations
                        </Button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`hover:bg-slate-50 transition-colors ${newlyAddedEntryIds[entry.id] ? "animate-in fade-in-0 slide-in-from-top-1 duration-500 bg-emerald-50/50" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-700">{formatDate(entry.date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> {entry.startPoint}
                        </div>
                        {(entry.stop1 || entry.stop2) && (
                          <div className="pl-2.5 border-l border-slate-200 ml-0.5 text-xs text-slate-400">
                            {entry.stop1 && <div>• {entry.stop1}</div>}
                            {entry.stop2 && <div>• {entry.stop2}</div>}
                            {(entry.stop3 || entry.stop4) && <div className="italic">+ more stops</div>}
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-400"></div> {entry.finishPoint}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{entry.clientsVisited}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                      {Number.parseFloat(entry.totalMiles || "0").toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">{formatCurrency(entry.totalClaim)}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{formatCurrency(entry.totalCharge)}</td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[220px]">{entry.description || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleEditClick(entry)}
                          className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                          title="Edit Entry"
                          type="button"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEntryIdToDelete(entry.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors p-1"
                          title="Delete Entry"
                          type="button"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden divide-y divide-slate-100">
          {entries.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                <div className="rounded-full bg-indigo-50 p-3">
                  <Navigation className="h-5 w-5 text-indigo-500" />
                </div>
                <p className="font-semibold text-slate-700">No trips recorded yet</p>
                <p className="text-sm text-slate-500">
                  Add your first trip to unlock totals and cleaner exports.
                </p>
                <div className="mt-1 flex w-full flex-col gap-2">
                  <Button onClick={openTripForm} className="w-full">
                    <Plus className="w-4 h-4" />
                    Add First Trip
                  </Button>
                  <Button variant="secondary" onClick={onOpenLocationsTab} className="w-full">
                    Manage Locations
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className={`p-3 space-y-2.5 ${newlyAddedEntryIds[entry.id] ? "animate-in fade-in-0 slide-in-from-top-1 duration-500 bg-emerald-50/50" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-700">{formatDate(entry.date)}</div>
                    <div className="mt-1 text-sm font-medium leading-tight text-slate-700 break-words">
                      {entry.startPoint} {"->"} {entry.finishPoint}
                    </div>
                    {entry.clientsVisited && (
                      <div className="mt-1 text-xs text-slate-500 break-words">Client: {entry.clientsVisited}</div>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => setMobileDetailsEntryId(entry.id)}
                    className="shrink-0 px-2.5 min-h-[38px] text-xs"
                  >
                    Details
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-0.5">
                  <div className="text-center p-1.5 bg-slate-50 rounded-lg">
                    <div className="text-[11px] text-slate-500 mb-0.5">Miles</div>
                    <div className="font-bold text-sm text-slate-700">{Number.parseFloat(entry.totalMiles || "0").toFixed(1)}</div>
                  </div>
                  <div className="text-center p-1.5 bg-emerald-50 rounded-lg">
                    <div className="text-[11px] text-emerald-700 mb-0.5">Claim</div>
                    <div className="font-bold text-sm text-emerald-600">{formatCurrency(entry.totalClaim)}</div>
                  </div>
                  <div className="text-center p-1.5 bg-blue-50 rounded-lg">
                    <div className="text-[11px] text-blue-700 mb-0.5">Charge</div>
                    <div className="font-bold text-sm text-blue-600">{formatCurrency(entry.totalCharge)}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Drawer open={Boolean(mobileDetailsEntryId)} onOpenChange={(open) => !open && setMobileDetailsEntryId(null)}>
        <DrawerContent className="md:hidden max-h-[88vh]">
          {mobileDetailsEntry && (
            <>
              <DrawerHeader className="text-left border-b border-slate-100">
                <DrawerTitle>{formatDate(mobileDetailsEntry.date)}</DrawerTitle>
                <DrawerDescription>
                  {mobileDetailsEntry.startPoint} {"->"} {mobileDetailsEntry.finishPoint}
                </DrawerDescription>
              </DrawerHeader>
              <div className="space-y-4 overflow-y-auto px-4 py-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-slate-50 p-3 text-center">
                    <p className="text-[11px] uppercase font-semibold text-slate-500">Miles</p>
                    <p className="text-sm font-bold text-slate-700">
                      {Number.parseFloat(mobileDetailsEntry.totalMiles || "0").toFixed(1)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 p-3 text-center">
                    <p className="text-[11px] uppercase font-semibold text-emerald-700">Claim</p>
                    <p className="text-sm font-bold text-emerald-600">{formatCurrency(mobileDetailsEntry.totalClaim)}</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 p-3 text-center">
                    <p className="text-[11px] uppercase font-semibold text-blue-700">Charge</p>
                    <p className="text-sm font-bold text-blue-600">{formatCurrency(mobileDetailsEntry.totalCharge)}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-[11px] uppercase tracking-wide font-semibold text-slate-500">Route Stops</p>
                  <div className="space-y-1 text-sm text-slate-700">
                    <div>Start: {mobileDetailsEntry.startPoint}</div>
                    {[mobileDetailsEntry.stop1, mobileDetailsEntry.stop2, mobileDetailsEntry.stop3, mobileDetailsEntry.stop4]
                      .filter(Boolean)
                      .map((stop, index) => (
                        <div key={`${mobileDetailsEntry.id}-stop-${index}`}>Stop {index + 1}: {stop}</div>
                      ))}
                    <div>Finish: {mobileDetailsEntry.finishPoint}</div>
                  </div>
                </div>

                {mobileDetailsEntry.clientsVisited && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Client</p>
                    <p className="mt-1 text-sm text-slate-700">{mobileDetailsEntry.clientsVisited}</p>
                  </div>
                )}

                {mobileDetailsEntry.description && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Description</p>
                    <p className="mt-1 text-sm text-slate-700">{mobileDetailsEntry.description}</p>
                  </div>
                )}

                {mobileDetailsEntry.comments && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Comments</p>
                    <p className="mt-1 text-sm text-slate-700">{mobileDetailsEntry.comments}</p>
                  </div>
                )}
              </div>
              <DrawerFooter className="border-t border-slate-100 pb-safe">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      handleEditClick(mobileDetailsEntry)
                    }}
                    className="w-full"
                  >
                    Edit Trip
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => {
                      setMobileDetailsEntryId(null)
                      setEntryIdToDelete(mobileDetailsEntry.id)
                    }}
                  >
                    Delete Trip
                  </Button>
                </div>
                <DrawerClose asChild>
                  <Button variant="secondary">Close</Button>
                </DrawerClose>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>

      <AlertDialog open={Boolean(entryIdToDelete)} onOpenChange={(open) => !open && setEntryIdToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this trip?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected trip entry will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingEntry}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingEntry}
              onClick={(e) => {
                e.preventDefault()
                void confirmDeleteEntry()
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingEntry ? "Deleting..." : "Delete Trip"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all trips?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {entries.length} entries in your history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingAll}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeletingAll}
              onClick={(e) => {
                e.preventDefault()
                void confirmDeleteAllEntries()
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeletingAll ? "Deleting..." : "Delete All Trips"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// --- Locations View ---
const LocationsView = ({
  user,
  locations,
  savedRoutes,
  onAddLocation,
  onDeleteLocation,
  onAddRoute,
  onUpdateRoute,
  onDeleteRoute,
}: {
  user: { id: string } | null
  locations: Location[]
  savedRoutes: SavedRoute[]
  onAddLocation: (loc: Omit<Location, "id">) => Promise<void>
  onDeleteLocation: (id: string) => Promise<void>
  onAddRoute: (route: { from: string; to: string; distance: string }) => Promise<void>
  onUpdateRoute: (id: string, route: { from: string; to: string; distance: string }) => Promise<void>
  onDeleteRoute: (id: string) => Promise<void>
}) => {
  const [newLoc, setNewLoc] = useState({ name: "", address: "", city: "", postcode: "", category: "Client" })
  const [newRoute, setNewRoute] = useState({ from: "", to: "", distance: "" })
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState("add-location")

  const handleLocSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLoc.name) return
    await onAddLocation(newLoc)
    setNewLoc({ name: "", address: "", city: "", postcode: "", category: "Client" })
    // On mobile, switch to list view after adding
    if (window.innerWidth < 768) setMobileTab("view-locations")
  }

  const handleRouteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newRoute.from || !newRoute.to || !newRoute.distance) return
    if (!user) {
      toast({
        title: "Still connecting",
        description: "Wait for Cloud Connected before saving routes.",
        variant: "destructive",
      })
      return
    }

    if (editingRouteId) {
      await onUpdateRoute(editingRouteId, newRoute)
      setEditingRouteId(null)
    } else {
      // Check for existing route (reversible)
      const existing = savedRoutes.find(
        (r) =>
          (r.from === newRoute.from && r.to === newRoute.to) || (r.from === newRoute.to && r.to === newRoute.from),
      )

      if (existing) {
        toast({
          title: "Route already exists",
          description: `${existing.from} ↔ ${existing.to} (${existing.distance} mi) is already saved.`,
          variant: "destructive",
        })
        return
      }

      await onAddRoute(newRoute)
    }
    setNewRoute({ from: "", to: "", distance: "" })
    // On mobile, switch to list view after adding
    if (window.innerWidth < 768) setMobileTab("view-routes")
  }

  const handleEditRouteClick = (route: SavedRoute) => {
    setNewRoute({ from: route.from, to: route.to, distance: route.distance })
    setEditingRouteId(route.id)
    // On mobile, switch to add view (which is now edit view)
    if (window.innerWidth < 768) setMobileTab("add-route")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleCancelRouteEdit = () => {
    setNewRoute({ from: "", to: "", distance: "" })
    setEditingRouteId(null)
  }

  const uniqueKeys = new Set<string>()
  const sortedRoutes = [...savedRoutes]
    .map((route) => {
      let from = route.from
      let to = route.to
      // Normalize: Prefer Home or Office as the 'from' location
      if (to === "Home" || (to === "Office" && from !== "Home")) {
        ;[from, to] = [to, from]
      }
      return { ...route, displayFrom: from, displayTo: to }
    })
    .filter((route) => {
      const key = `${route.displayFrom}|${route.displayTo}`
      if (uniqueKeys.has(key)) return false
      uniqueKeys.add(key)
      return true
    })
    .sort((a, b) => {
      const res = a.displayFrom.localeCompare(b.displayFrom)
      if (res !== 0) return res
      return a.displayTo.localeCompare(b.displayTo)
    })

  const locationOptions = locations.map((l) => ({ value: l.name, label: l.name }))

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Mobile Navigation Tabs */}
      <div className="md:hidden grid grid-cols-4 gap-1.5 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm mb-4 sticky top-[calc(env(safe-area-inset-top)+5.5rem)] z-40">
        <button
          onClick={() => setMobileTab("add-location")}
          className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[10px] font-bold transition-all ${mobileTab === "add-location"
            ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
            : "text-slate-400 hover:bg-slate-50"
            }`}
        >
          <MapPin className="w-4 h-4 mb-1" />
          <span className="text-center leading-none">New<br />Loc</span>
        </button>
        <button
          onClick={() => setMobileTab("view-locations")}
          className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[10px] font-bold transition-all ${mobileTab === "view-locations"
            ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
            : "text-slate-400 hover:bg-slate-50"
            }`}
        >
          <List className="w-4 h-4 mb-1" />
          <span className="text-center leading-none">Saved<br />Locs</span>
        </button>
        <button
          onClick={() => setMobileTab("add-route")}
          className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[10px] font-bold transition-all ${mobileTab === "add-route"
            ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
            : "text-slate-400 hover:bg-slate-50"
            }`}
        >
          <Plus className="w-4 h-4 mb-1" />
          <span className="text-center leading-none">New<br />Dist</span>
        </button>
        <button
          onClick={() => setMobileTab("view-routes")}
          className={`flex flex-col items-center justify-center py-2 px-1 rounded-lg text-[10px] font-bold transition-all ${mobileTab === "view-routes"
            ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
            : "text-slate-400 hover:bg-slate-50"
            }`}
        >
          <ArrowLeftRight className="w-4 h-4 mb-1" />
          <span className="text-center leading-none">Saved<br />Dists</span>
        </button>
      </div>

      {/* SECTION 1: LOCATIONS */}
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 ${mobileTab.includes("location") ? "block" : "hidden md:grid"}`}>
        <div className={`lg:col-span-1 ${mobileTab === "add-location" ? "block" : "hidden md:block"}`}>
          <Card className="p-4 sm:p-6 lg:sticky lg:top-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-600" />
              Add New Location
            </h2>
            <form onSubmit={handleLocSubmit} className="space-y-4">
              <Input
                label="Location ID (Name)"
                placeholder="e.g. Office"
                value={newLoc.name}
                onChange={(e) => setNewLoc({ ...newLoc, name: e.target.value })}
              />
              <Input
                label="Street Address"
                placeholder="123 Main St"
                value={newLoc.address}
                onChange={(e) => setNewLoc({ ...newLoc, address: e.target.value })}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  label="City"
                  placeholder="Bolton"
                  value={newLoc.city}
                  onChange={(e) => setNewLoc({ ...newLoc, city: e.target.value })}
                />
                <Input
                  label="Postcode"
                  placeholder="BL1 1PP"
                  value={newLoc.postcode}
                  onChange={(e) => setNewLoc({ ...newLoc, postcode: e.target.value })}
                />
              </div>
              <Select
                label="Category"
                options={[
                  { value: "Personal", label: "Personal" },
                  { value: "Office", label: "Office" },
                  { value: "Client", label: "Client" },
                  { value: "Site", label: "Site" },
                ]}
                value={newLoc.category}
                onChange={(e) => setNewLoc({ ...newLoc, category: e.target.value })}
              />
              <Button type="submit" className="w-full mt-2" disabled={!user}>
                Add Location
              </Button>
            </form>
          </Card>
        </div>
        <div className={`lg:col-span-2 ${mobileTab === "view-locations" ? "block" : "hidden md:block"}`}>
          <Card>
            <div className="bg-indigo-900 text-white px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
              <h3 className="font-bold">Saved Locations</h3>
              <span className="text-indigo-200 text-sm bg-indigo-800 px-2 py-1 rounded-full">
                {locations.length} locations
              </span>
            </div>
            <div className="divide-y divide-slate-100 md:max-h-[500px] md:overflow-y-auto">
              {locations.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
                    <div className="rounded-full bg-indigo-50 p-3">
                      <MapPin className="h-5 w-5 text-indigo-500" />
                    </div>
                    <p className="font-semibold text-slate-700">No locations yet</p>
                    <p className="text-sm text-slate-500">Add Home, Office, and client locations to speed up trip logging.</p>
                    <Button variant="secondary" onClick={() => setMobileTab("add-location")}>
                      Add First Location
                    </Button>
                  </div>
                </div>
              ) : (
                locations.map((loc) => (
                  <div
                    key={loc.id}
                    className="p-3 sm:p-4 flex items-start justify-between gap-3 hover:bg-slate-50 group transition-colors"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        className={`mt-1 w-2 h-2 rounded-full ${loc.category === "Personal" ? "bg-emerald-400" : loc.category === "Office" ? "bg-blue-400" : "bg-indigo-400"}`}
                      ></div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-700 break-words">{loc.name}</h4>
                        <p className="text-sm text-slate-500 break-words">
                          {loc.address}, {loc.city}, {loc.postcode}
                        </p>
                        <span className="inline-block mt-1 text-[10px] uppercase font-bold text-slate-400 tracking-wider border border-slate-200 px-1.5 rounded">
                          {loc.category}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteLocation(loc.id)}
                      className="opacity-100 md:opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all p-2 shrink-0"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* SECTION 2: ROUTES */}
      <div className={`border-t border-slate-200 pt-6 sm:pt-8 ${mobileTab.includes("route") ? "block" : "hidden md:block"}`}>
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 hidden md:flex">
          <Route className="w-6 h-6 text-indigo-600" />
          Manage Saved Distances
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className={`lg:col-span-1 ${mobileTab === "add-route" ? "block" : "hidden md:block"}`}>
            <Card
              className={`p-4 sm:p-6 bg-slate-50 border ${editingRouteId ? "border-orange-300 ring-4 ring-orange-50" : "border-indigo-100"}`}
            >
              <h3 className={`font-bold mb-3 ${editingRouteId ? "text-orange-600" : "text-slate-700"}`}>
                {editingRouteId ? "Edit Saved Route" : "Add Known Distance"}
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Routes are bidirectional. Adding "Home to Office" also covers "Office to Home".
              </p>
              <form onSubmit={handleRouteSubmit} className="space-y-4">
                <Select
                  label="From"
                  options={locationOptions}
                  value={newRoute.from}
                  onChange={(e) => setNewRoute({ ...newRoute, from: e.target.value })}
                />
                <Select
                  label="To"
                  options={locationOptions}
                  value={newRoute.to}
                  onChange={(e) => setNewRoute({ ...newRoute, to: e.target.value })}
                />
                <Input
                  label="Distance (Miles)"
                  type="number"
                  placeholder="e.g. 26"
                  value={newRoute.distance}
                  onChange={(e) => setNewRoute({ ...newRoute, distance: e.target.value })}
                />
                <div className="flex gap-2">
                  {editingRouteId && (
                    <Button variant="secondary" onClick={handleCancelRouteEdit} className="flex-1">
                      Cancel
                    </Button>
                  )}
                  <Button variant="secondary" type="submit" className="flex-1" disabled={!user}>
                    {editingRouteId ? "Update Distance" : "Save Distance"}
                  </Button>
                </div>
              </form>
            </Card>
          </div>
          <div className={`lg:col-span-2 ${mobileTab === "view-routes" ? "block" : "hidden md:block"}`}>
            <Card>
              <div className="bg-slate-100 px-4 sm:px-6 py-3 border-b border-slate-200">
                <h3 className="font-bold text-slate-600 text-sm uppercase">Your Saved Routes</h3>
              </div>
              <div className="divide-y divide-slate-100 md:max-h-[500px] md:overflow-y-auto">
                {sortedRoutes.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
                      <div className="rounded-full bg-indigo-50 p-3">
                        <Route className="h-5 w-5 text-indigo-500" />
                      </div>
                      <p className="font-semibold text-slate-700">No saved routes yet</p>
                      <p className="text-sm text-slate-500">
                        Save common distances (for example Office to Home) so trip totals auto-fill.
                      </p>
                      <Button variant="secondary" onClick={() => setMobileTab("add-route")}>
                        Add First Distance
                      </Button>
                    </div>
                  </div>
                ) : (
                  sortedRoutes.map((route) => (
                    <div
                      key={route.id}
                      className={`group transition-colors ${editingRouteId === route.id ? "bg-orange-50" : "hover:bg-slate-50"}`}
                    >
                      <div className="p-3 md:hidden space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="flex-1 font-bold text-slate-700 break-words leading-tight">{route.displayFrom}</span>
                          <ArrowLeftRight className="w-4 h-4 text-slate-300 shrink-0" />
                          <span className="flex-1 font-bold text-slate-700 text-right break-words leading-tight">{route.displayTo}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                            {route.distance} mi
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditRouteClick(route)}
                              className="text-slate-400 hover:text-indigo-600 p-2"
                              title="Edit Route"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onDeleteRoute(route.id)}
                              className="text-slate-400 hover:text-red-500 p-2"
                              title="Delete Route"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="hidden md:flex p-3 items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span className="font-bold text-slate-700 truncate max-w-[42%] sm:max-w-none">{route.displayFrom}</span>
                          <ArrowLeftRight className="w-4 h-4 text-slate-300" />
                          <span className="font-bold text-slate-700 truncate max-w-[42%] sm:max-w-none">{route.displayTo}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded mr-2">
                            {route.distance} mi
                          </span>
                          <button
                            onClick={() => handleEditRouteClick(route)}
                            className="text-slate-400 hover:text-indigo-600 p-1"
                            title="Edit Route"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteRoute(route.id)}
                            className="text-slate-400 hover:text-red-500 p-1"
                            title="Delete Route"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
