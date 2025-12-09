"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import {
  Plus,
  MapPin,
  Car,
  Download,
  Trash2,
  Save,
  FileText,
  DollarSign,
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
} from "lucide-react"
import { seedInitialData } from "@/app/actions/seed-data"

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

// --- Constants ---
const DEFAULT_CLAIM_RATE = "0.14"
const DEFAULT_CHARGE_RATE = "0.25"

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
    "px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
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

    supabase.auth.getUser().then(({ data: { user } }) => {
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
        supabase.from("locations").select("*").order("name"),
        supabase.from("saved_routes").select("*").order("from", { ascending: true }),
        supabase
          .from("entries")
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
      .on("postgres_changes", { event: "*", schema: "public", table: "locations" }, (payload) => {
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
      .on("postgres_changes", { event: "*", schema: "public", table: "saved_routes" }, (payload) => {
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
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, (payload) => {
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
      const { data, error } = await supabase.from("entries").select("id").limit(1)

      if (!data || data.length === 0) {
        const result = await seedInitialData()
        if (result.success) {
          // Refresh data after seeding
          const [locationsRes, routesRes, entriesRes] = await Promise.all([
            supabase.from("locations").select("*").order("name"),
            supabase.from("saved_routes").select("*").order("from", { ascending: true }),
            supabase
              .from("entries")
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
      .from("locations")
      .insert({ ...newLoc, userid: user.id })
      .select()
    if (error) throw error
    if (data) {
      setLocations((prev) => [...prev, data[0] as Location].sort((a, b) => a.name.localeCompare(b.name)))
    }
  }

  const handleDeleteLocation = async (id: string) => {
    const { error } = await supabase.from("locations").delete().eq("id", id)
    if (error) throw error
    setLocations((prev) => prev.filter((loc) => loc.id !== id))
  }

  // Updated handleAddRoute
  const handleAddRoute = async (newRoute: { from: string; to: string; distance: string }) => {
    if (!user) return
    const { data, error } = await supabase
      .from("saved_routes")
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
      .from("saved_routes")
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
    const { error } = await supabase.from("saved_routes").delete().eq("id", id)
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

    const { data, error } = await supabase.from("entries").insert([dataToInsert]).select()

    console.log("[v0] Insert result - data:", data, "error:", error)

    if (error) {
      console.error("[v0] Database error:", error)
      throw error
    }

    console.log("[v0] Entry added successfully:", data)

    if (data && data.length > 0) {
      const { data: freshEntries } = await supabase
        .from("entries")
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
      .from("entries")
      .update({ ...updatedData, updatedat: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error
  }

  const handleDeleteEntry = async (id: string) => {
    console.log("[v0] handleDeleteEntry called with id:", id)
    try {
      const { data, error } = await supabase.from("entries").delete().eq("id", id)
      console.log("[v0] Delete result - data:", data, "error:", error)
      if (error) {
        console.error("[v0] Delete error:", error)
        alert(`Failed to delete entry: ${error.message}`)
      }
    } catch (err) {
      console.error("[v0] Delete exception:", err)
      alert("Failed to delete entry. Please try again.")
    }
  }

  const handleRefreshEntries = async () => {
    const { data } = await supabase
      .from("entries")
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
    link.setAttribute("download", `mileage_tracker_export_${new Date().toISOString().slice(0, 10)}.csv`)
    link.style.visibility = "hidden"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="bg-indigo-900 text-white shadow-lg pt-safe-or-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 py-4 sm:h-20">
            <div className="flex items-center gap-3">
              <div className="bg-white/10 p-2 rounded-lg">
                <Car className="w-6 h-6 text-indigo-100" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Mileage Tracker Pro</h1>
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

            <div className="flex gap-2 items-center">
              <button
                onClick={() => setActiveTab("tracker")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "tracker" ? "bg-white text-indigo-900 shadow-sm" : "text-indigo-200 hover:bg-white/10"}`}
              >
                My Trips
              </button>
              <button
                onClick={() => setActiveTab("locations")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "locations" ? "bg-white text-indigo-900 shadow-sm" : "text-indigo-200 hover:bg-white/10"}`}
              >
                Locations & Routes
              </button>
              <button
                onClick={handleSignOut}
                className="ml-4 px-3 py-2 rounded-lg text-sm font-medium text-indigo-200 hover:bg-white/10 transition-colors flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-6">
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
            onExport={exportToCSV}
            onRefresh={handleRefreshEntries}
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

// --- Editable Comment Component ---
const EditableComment = ({
  id,
  initialValue,
  onSave,
}: {
  id: string
  initialValue: string
  onSave: (id: string, value: string) => Promise<void>
}) => {
  const [value, setValue] = useState(initialValue)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")

  // Sync with external changes (e.g. realtime updates)
  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  const handleSave = async () => {
    if (value !== initialValue) {
      setIsSaving(true)
      setSaveStatus("idle")
      try {
        await onSave(id, value)
        setSaveStatus("success")
        setTimeout(() => setSaveStatus("idle"), 2000)
      } catch (error) {
        console.error("Failed to save comment", error)
        setSaveStatus("error")
        alert("Failed to save comment. Please try again.")
      } finally {
        setIsSaving(false)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur()
    }
  }

  return (
    <div className="relative group">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none italic transition-colors px-1 py-0.5 ${saveStatus === "error" ? "text-red-500" : "text-slate-500"
          }`}
      />
      <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none">
        {isSaving ? (
          <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
        ) : saveStatus === "success" ? (
          <div className="w-2 h-2 rounded-full bg-emerald-500" title="Saved" />
        ) : null}
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
  onExport,
  onRefresh,
}: {
  user: { id: string } | null
  locations: Location[]
  savedRoutes: SavedRoute[]
  entries: Entry[]
  onAddEntry: (entry: Omit<Entry, "id" | "createdat">) => Promise<void> // Changed from created_at to createdat
  onUpdateEntry: (id: string, data: Partial<Entry>) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
  onExport: () => void
  onRefresh: () => Promise<void>
}) => {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0, 10),
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
    comments: "",
  })

  const [legDistances, setLegDistances] = useState<Record<string, string>>({})

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().slice(0, 10),
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
      comments: "",
    })
    setLegDistances({})
    setEditingId(null)
    setIsFormOpen(false)
  }

  const handleEditClick = (entry: Entry) => {
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
      comments: entry.comments || "",
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log("[v0] ========== FORM SUBMIT START ==========")
    console.log("[v0] User:", user)
    console.log("[v0] Form Data:", formData)
    console.log("[v0] Total Claim:", totalClaim, "Total Charge:", totalCharge)

    if (!user) {
      console.log("[v0] No user - showing alert")
      alert("You are not connected to the database. Please wait for the 'Cloud Connected' status in the top right.")
      return
    }

    if (!formData.startPoint || !formData.finishPoint || !formData.date || !formData.totalMiles) {
      alert("Please fill in all required fields: Date, Starting Point, Finish Point, and Total Miles")
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
      console.log("[v0] ========== FORM SUBMIT SUCCESS ==========")
    } catch (err: any) {
      console.error("[v0] ========== FORM SUBMIT ERROR ==========")
      console.error("[v0] Error object:", err)
      console.error("[v0] Error message:", err.message)
      console.error("[v0] Error stack:", err.stack)
      alert(`Failed to save trip: ${err.message}. Please check the console for details.`)
    } finally {
      setIsSaving(false)
    }
  }

  const locationOptions = locations.map((l) => ({ value: l.name, label: l.name }))

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <Card className="p-4 flex items-center justify-between bg-white">
          <div>
            <p className="text-slate-500 text-sm font-medium">Total Miles</p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-800">
              {entries.reduce((acc, curr) => acc + (Number.parseFloat(curr.totalMiles) || 0), 0).toFixed(1)}
            </p>
          </div>
          <Navigation className="w-8 h-8 text-indigo-500 opacity-20" />
        </Card>
        <Card className="p-4 flex items-center justify-between bg-white border-emerald-200 border-l-4">
          <div>
            <p className="text-emerald-700 text-sm font-medium">Total Claimable</p>
            <p className="text-2xl sm:text-3xl font-bold text-emerald-600">
              £{entries.reduce((acc, curr) => acc + (Number.parseFloat(curr.totalClaim) || 0), 0).toFixed(2)}
            </p>
          </div>
          <PoundSterling className="w-8 h-8 text-emerald-500 opacity-20" />
        </Card>
        <Card className="p-4 flex items-center justify-between bg-white border-blue-200 border-l-4">
          <div>
            <p className="text-blue-700 text-sm font-medium">Total Chargeable</p>
            <p className="text-2xl sm:text-3xl font-bold text-blue-600">
              £{entries.reduce((acc, curr) => acc + (Number.parseFloat(curr.totalCharge) || 0), 0).toFixed(2)}
            </p>
          </div>
          <FileText className="w-8 h-8 text-blue-500 opacity-20" />
        </Card>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h2 className="text-lg font-bold text-slate-800">Recent Entries</h2>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button variant="secondary" onClick={onRefresh}>
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
          <Button variant="secondary" onClick={onExport}>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
          <Button
            onClick={() => {
              resetForm()
              setIsFormOpen(!isFormOpen)
            }}
            disabled={!user}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add New Trip</span>
          </Button>
        </div>
      </div>

      {/* Entry Form */}
      {isFormOpen && (
        <Card
          className={`p-6 bg-white border-2 shadow-lg ring-4 animate-in slide-in-from-top-4 duration-300 ${editingId ? "border-orange-200 ring-orange-50" : "border-indigo-100 ring-indigo-50"}`}
        >
          <form onSubmit={handleSubmit} className="space-y-6">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Description"
                placeholder="Meeting purpose etc."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
              <Input
                label="Comments"
                placeholder="Traffic notes, parking etc."
                value={formData.comments}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
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
                  label="Claim Rate (£)"
                  value={formData.claimRate}
                  onChange={(e) => setFormData({ ...formData, claimRate: e.target.value })}
                />
              </div>
              <div className="md:col-span-2 pb-2">
                <div className="text-xl font-bold text-emerald-600">£{totalClaim}</div>
                <div className="text-[10px] text-emerald-700 uppercase font-bold">Claimable</div>
              </div>
              <div className="md:col-span-2">
                <Input
                  type="number"
                  label="Charge Rate (£)"
                  value={formData.chargeRate}
                  onChange={(e) => setFormData({ ...formData, chargeRate: e.target.value })}
                />
              </div>
              <div className="md:col-span-2 pb-2">
                <div className="text-xl font-bold text-blue-600">£{totalCharge}</div>
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
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-indigo-900 text-white uppercase text-xs font-semibold">
              <tr>
                <th className="px-4 py-3 whitespace-nowrap">Date</th>
                <th className="px-4 py-3 whitespace-nowrap">Route</th>
                <th className="px-4 py-3 whitespace-nowrap">Clients</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Miles</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Claim (£)</th>
                <th className="px-4 py-3 whitespace-nowrap text-right">Charge (£)</th>
                <th className="px-4 py-3 whitespace-nowrap">Comments</th>
                <th className="px-4 py-3 whitespace-nowrap w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No trips recorded yet. Add your first trip above!
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{entry.date}</td>
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
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">£{entry.totalClaim}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">£{entry.totalCharge}</td>
                    <td className="px-4 py-3 text-slate-500 italic truncate max-w-[150px]">
                      <EditableComment
                        id={entry.id}
                        initialValue={entry.comments || ""}
                        onSave={async (id, value) => {
                          await onUpdateEntry(id, { comments: value })
                        }}
                      />
                    </td>
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
                          onClick={() => onDeleteEntry(entry.id)}
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
            <div className="px-4 py-8 text-center text-slate-500">
              No trips recorded yet. Add your first trip above!
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="p-4 space-y-3">
                {/* Date and Actions */}
                <div className="flex items-center justify-between">
                  <div className="font-bold text-slate-700">{entry.date}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditClick(entry)}
                      className="text-slate-400 hover:text-indigo-600 transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title="Edit Entry"
                      type="button"
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => onDeleteEntry(entry.id)}
                      className="text-slate-400 hover:text-red-500 transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      title="Delete Entry"
                      type="button"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Route */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"></div>
                    <span className="font-medium text-slate-700">{entry.startPoint}</span>
                  </div>
                  {(entry.stop1 || entry.stop2) && (
                    <div className="pl-4 border-l-2 border-slate-200 ml-1 space-y-1 py-1">
                      {entry.stop1 && <div className="text-xs text-slate-500">• {entry.stop1}</div>}
                      {entry.stop2 && <div className="text-xs text-slate-500">• {entry.stop2}</div>}
                      {(entry.stop3 || entry.stop4) && (
                        <div className="text-xs text-slate-400 italic">+ more stops</div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></div>
                    <span className="font-medium text-slate-700">{entry.finishPoint}</span>
                  </div>
                </div>

                {/* Client */}
                {entry.clientsVisited && (
                  <div className="text-sm">
                    <span className="text-slate-500">Client: </span>
                    <span className="font-medium text-slate-700">{entry.clientsVisited}</span>
                  </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="text-center p-2 bg-slate-50 rounded-lg">
                    <div className="text-xs text-slate-500 mb-1">Miles</div>
                    <div className="font-bold text-slate-700">
                      {Number.parseFloat(entry.totalMiles || "0").toFixed(1)}
                    </div>
                  </div>
                  <div className="text-center p-2 bg-emerald-50 rounded-lg">
                    <div className="text-xs text-emerald-700 mb-1">Claim</div>
                    <div className="font-bold text-emerald-600">£{entry.totalClaim}</div>
                  </div>
                  <div className="text-center p-2 bg-blue-50 rounded-lg">
                    <div className="text-xs text-blue-700 mb-1">Charge</div>
                    <div className="font-bold text-blue-600">£{entry.totalCharge}</div>
                  </div>
                </div>

                {/* Comments */}
                {entry.comments && (
                  <div className="text-sm text-slate-500 italic pt-2 border-t border-slate-100">{entry.comments}</div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
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
      alert("Wait for connection...")
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
        alert(
          `A route between ${existing.from} and ${existing.to} already exists (${existing.distance} mi). Saved routes are reversible!`,
        )
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
    <div className="space-y-6">
      {/* Mobile Navigation Tabs */}
      <div className="md:hidden grid grid-cols-4 gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm mb-6 sticky top-20 z-40">
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
      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${mobileTab.includes("location") ? "block" : "hidden md:grid"}`}>
        <div className={`lg:col-span-1 ${mobileTab === "add-location" ? "block" : "hidden md:block"}`}>
          <Card className="p-6 sticky top-6">
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
              <div className="grid grid-cols-2 gap-2">
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
            <div className="bg-indigo-900 text-white px-6 py-4 flex justify-between items-center">
              <h3 className="font-bold">Saved Locations</h3>
              <span className="text-indigo-200 text-sm bg-indigo-800 px-2 py-1 rounded-full">
                {locations.length} locations
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {locations.length === 0 ? (
                <div className="p-8 text-center text-slate-500">No locations added yet.</div>
              ) : (
                locations.map((loc) => (
                  <div
                    key={loc.id}
                    className="p-4 flex items-center justify-between hover:bg-slate-50 group transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-1 w-2 h-2 rounded-full ${loc.category === "Personal" ? "bg-emerald-400" : loc.category === "Office" ? "bg-blue-400" : "bg-indigo-400"}`}
                      ></div>
                      <div>
                        <h4 className="font-bold text-slate-700">{loc.name}</h4>
                        <p className="text-sm text-slate-500">
                          {loc.address}, {loc.city}, {loc.postcode}
                        </p>
                        <span className="inline-block mt-1 text-[10px] uppercase font-bold text-slate-400 tracking-wider border border-slate-200 px-1.5 rounded">
                          {loc.category}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteLocation(loc.id)}
                      className="opacity-100 md:opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all p-2"
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
      <div className={`border-t border-slate-200 pt-8 ${mobileTab.includes("route") ? "block" : "hidden md:block"}`}>
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2 hidden md:flex">
          <Route className="w-6 h-6 text-indigo-600" />
          Manage Saved Distances
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`lg:col-span-1 ${mobileTab === "add-route" ? "block" : "hidden md:block"}`}>
            <Card
              className={`p-6 bg-slate-50 border ${editingRouteId ? "border-orange-300 ring-4 ring-orange-50" : "border-indigo-100"}`}
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
              <div className="bg-slate-100 px-6 py-3 border-b border-slate-200">
                <h3 className="font-bold text-slate-600 text-sm uppercase">Your Saved Routes</h3>
              </div>
              <div className="divide-y divide-slate-100 min-h-[calc(100vh-250px)] md:min-h-0 md:max-h-[500px] md:overflow-y-auto">
                {sortedRoutes.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    No saved routes. Add distances (e.g., Office to Home) to auto-fill your trips.
                  </div>
                ) : (
                  sortedRoutes.map((route) => (
                    <div
                      key={route.id}
                      className={`p-3 flex items-center justify-between group transition-colors ${editingRouteId === route.id ? "bg-orange-50" : "hover:bg-slate-50"}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-700">{route.displayFrom}</span>
                        <ArrowLeftRight className="w-4 h-4 text-slate-300" />
                        <span className="font-bold text-slate-700">{route.displayTo}</span>
                      </div>
                      <div className="flex items-center gap-2">
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
