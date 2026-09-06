"use client"

import type React from "react"

import { useState, useEffect, useMemo, useRef } from "react"
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/client"
import { downloadMileageExcelWorkbook } from "@/lib/mileage/excel-export"
import { KpiSummary } from "@/components/tracker/kpi-summary"
import { ClaimPeriodSwitcher } from "@/components/tracker/claim-period-switcher"
import { StatusBadge } from "@/components/tracker/status-badge"
import { EmptyState } from "@/components/tracker/empty-state"
import { LoadingSkeleton } from "@/components/tracker/loading-skeleton"
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
  startPostcode?: string
  stop1?: string
  stop1Postcode?: string
  stop2?: string
  stop2Postcode?: string
  stop3?: string
  stop3Postcode?: string
  stop4?: string
  stop4Postcode?: string
  finishPoint: string // Changed from finish_point
  finishPostcode?: string
  clientsVisited?: string // Changed from clients_visited
  description?: string
  totalMiles: string // Changed from total_miles
  claimRate: string // Changed from claim_rate
  chargeRate: string // Changed from charge_rate
  totalClaim: string
  totalCharge: string
  comments?: string
  status?: EntryStatus
  createdat: string // Changed from created_at to match database column
}

type EntryStatus = "draft" | "submitted" | "paid"
type VisitFilter = "all" | "footasylum" | "tfs"

interface QuickTripDraft {
  trip: {
    date: string
    startPoint: string
    startPostcode?: string
    stop1: string
    stop1Postcode?: string
    stop2: string
    stop2Postcode?: string
    stop3: string
    stop3Postcode?: string
    stop4: string
    stop4Postcode?: string
    finishPoint: string
    finishPostcode?: string
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
const DEFAULT_ENTRY_STATUS: EntryStatus = "draft"
const QUICK_ADD_TEMPORARY_AI_MESSAGE =
  "AI trip parsing is temporarily unavailable. Please try again in a moment."

const ENTRY_STATUS_OPTIONS: Array<{ value: EntryStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "paid", label: "Paid" },
]

const VISIT_FILTER_OPTIONS: Array<{ value: VisitFilter; label: string }> = [
  { value: "all", label: "All visits" },
  { value: "footasylum", label: "Footasylum" },
  { value: "tfs", label: "TFS" },
]

const ENTRY_STATUS_CLASSES: Record<EntryStatus, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  submitted: "bg-indigo-50 text-indigo-700 border-indigo-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

const normalizeLocationName = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
const normalizePostcode = (value: string | undefined) => (value || "").trim().toUpperCase()
const UK_POSTCODE_REGEX = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i
const extractUKPostcode = (value: string | undefined) => normalizePostcode(value?.match(UK_POSTCODE_REGEX)?.[0])

const normalizeEntry = (entry: any): Entry => ({
  ...entry,
  startPostcode: normalizePostcode(entry.startPostcode ?? entry.start_postcode),
  stop1Postcode: normalizePostcode(entry.stop1Postcode ?? entry.stop1_postcode),
  stop2Postcode: normalizePostcode(entry.stop2Postcode ?? entry.stop2_postcode),
  stop3Postcode: normalizePostcode(entry.stop3Postcode ?? entry.stop3_postcode),
  stop4Postcode: normalizePostcode(entry.stop4Postcode ?? entry.stop4_postcode),
  finishPostcode: normalizePostcode(entry.finishPostcode ?? entry.finish_postcode),
  status: (entry.status || DEFAULT_ENTRY_STATUS) as EntryStatus,
})

const entryToDatabasePayload = (entry: Partial<Entry>) => {
  const {
    startPostcode,
    stop1Postcode,
    stop2Postcode,
    stop3Postcode,
    stop4Postcode,
    finishPostcode,
    ...rest
  } = entry

  const payload: Record<string, unknown> = {
    ...rest,
  }

  if ("startPostcode" in entry) payload.start_postcode = normalizePostcode(startPostcode) || null
  if ("stop1Postcode" in entry) payload.stop1_postcode = normalizePostcode(stop1Postcode) || null
  if ("stop2Postcode" in entry) payload.stop2_postcode = normalizePostcode(stop2Postcode) || null
  if ("stop3Postcode" in entry) payload.stop3_postcode = normalizePostcode(stop3Postcode) || null
  if ("stop4Postcode" in entry) payload.stop4_postcode = normalizePostcode(stop4Postcode) || null
  if ("finishPostcode" in entry) payload.finish_postcode = normalizePostcode(finishPostcode) || null
  if ("status" in entry) payload.status = entry.status || DEFAULT_ENTRY_STATUS

  return payload
}

const getMonthLabel = (monthKey: string) => {
  const parsed = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return monthKey
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(parsed)
}

const getClaimMonthDateRange = (monthKey: string) => {
  const parsed = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null

  const year = parsed.getFullYear()
  const monthIndex = parsed.getMonth()
  // Claim month runs from the 21st of the previous calendar month to the 21st of this month.
  const start = new Date(year, monthIndex - 1, 21)
  const end = new Date(year, monthIndex, 21)

  const toDateKey = (value: Date) => {
    const month = `${value.getMonth() + 1}`.padStart(2, "0")
    const day = `${value.getDate()}`.padStart(2, "0")
    return `${value.getFullYear()}-${month}-${day}`
  }

  return {
    start: toDateKey(start),
    end: toDateKey(end),
  }
}

const isDateInClaimMonth = (dateValue: string | undefined, monthKey: string) => {
  if (!dateValue) return false
  const range = getClaimMonthDateRange(monthKey)
  if (!range) return false
  return dateValue >= range.start && dateValue <= range.end
}

const getClaimMonthRangeLabel = (monthKey: string) => {
  const range = getClaimMonthDateRange(monthKey)
  if (!range) return ""
  const start = new Date(`${range.start}T00:00:00`)
  const end = new Date(`${range.end}T00:00:00`)
  const formatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })
  return `${formatter.format(start)} - ${formatter.format(end)}`
}

const getLocalMonthKey = (value: Date) => {
  const year = value.getFullYear()
  const month = `${value.getMonth() + 1}`.padStart(2, "0")
  return `${year}-${month}`
}

const getClaimMonthKeyForDate = (dateValue: string) => {
  const parsed = new Date(`${dateValue}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateValue.slice(0, 7)
  if (parsed.getDate() > 21) {
    parsed.setMonth(parsed.getMonth() + 1)
  }
  return getLocalMonthKey(parsed)
}

const shiftMonth = (monthKey: string, offset: number) => {
  const parsed = new Date(`${monthKey}-01T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return monthKey
  parsed.setMonth(parsed.getMonth() + offset)
  return getLocalMonthKey(parsed)
}

const getEntryRoutePostcodes = (entry: Entry) => [
  { point: entry.startPoint, postcode: entry.startPostcode },
  { point: entry.stop1, postcode: entry.stop1Postcode },
  { point: entry.stop2, postcode: entry.stop2Postcode },
  { point: entry.stop3, postcode: entry.stop3Postcode },
  { point: entry.stop4, postcode: entry.stop4Postcode },
  { point: entry.finishPoint, postcode: entry.finishPostcode },
]

const getMissingPostcodeCount = (entry: Entry) =>
  getEntryRoutePostcodes(entry).filter((item) => item.point && !item.postcode?.trim()).length

const getEntrySearchText = (entry: Entry) =>
  [
    entry.startPoint,
    entry.stop1,
    entry.stop2,
    entry.stop3,
    entry.stop4,
    entry.finishPoint,
    entry.clientsVisited,
    entry.description,
    entry.comments,
  ]
    .filter(Boolean)
    .join(" ")

const entryMatchesVisitFilter = (entry: Entry, filter: VisitFilter) => {
  if (filter === "all") return true
  const searchText = getEntrySearchText(entry)
  const normalized = normalizeLocationName(searchText)

  if (filter === "footasylum") {
    return normalized.includes("footasylum")
  }

  return /\bTFS\b/i.test(searchText) || normalized.includes("thefragranceshop")
}

const getTodayLocalDate = () => {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

const getCurrentClaimMonthKey = () => getClaimMonthKeyForDate(getTodayLocalDate())

const getQuickAddErrorMessage = (status: number, data: QuickTripErrorResponse) => {
  if (data.code === "AI_TEMPORARILY_UNAVAILABLE" || status === 503) {
    return QUICK_ADD_TEMPORARY_AI_MESSAGE
  }

  return data.error || "Could not parse trip note."
}

const milesForClaimAmount = (claimAmount: string, claimRate: string) => {
  const parsedClaim = Number.parseFloat(claimAmount)
  const parsedRate = Number.parseFloat(claimRate)

  if (!Number.isFinite(parsedClaim) || parsedClaim < 0 || !Number.isFinite(parsedRate) || parsedRate <= 0) {
    return null
  }

  return (parsedClaim / parsedRate).toFixed(2)
}

const getResolvedLocationAddressParts = (name: string, resolvedAddress: string | undefined, postcode: string) => {
  const cleanedAddress = (resolvedAddress || "").replace(/,\s*UK$/i, "").trim()
  const addressWithoutPostcode = cleanedAddress
    .replace(UK_POSTCODE_REGEX, "")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*$/, "")
    .trim()

  const parts = addressWithoutPostcode
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length >= 2) {
    return {
      address: parts.slice(0, -1).join(", "),
      city: parts[parts.length - 1],
    }
  }

  return {
    address: parts[0] || name,
    city: postcode ? "" : parts[1] || "",
  }
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
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      const currentUser = session?.user || null
      // Only update user if the ID has changed to prevent unnecessary re-renders/fetches
      setUser((prevUser: User | null) => {
        if (prevUser?.id === currentUser?.id) return prevUser
        return currentUser
      })
      if (!currentUser) {
        router.push("/auth/login")
      }
    })

    supabase.auth.getUser().then(({ data: { user }, error }: { data: { user: User | null }; error: Error | null }) => {
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
        setUser((prevUser: User | null) => {
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
      if (entriesRes.data) setEntries(entriesRes.data.map(normalizeEntry))

      setIsLoading(false)
    }

    fetchData()

    const channel = supabase
      .channel("db_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "mt_locations" }, (payload: { eventType: "INSERT" | "UPDATE" | "DELETE"; new: any; old: any }) => {
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
      .on("postgres_changes", { event: "*", schema: "public", table: "mt_saved_routes" }, (payload: { eventType: "INSERT" | "UPDATE" | "DELETE"; new: any; old: any }) => {
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
      .on("postgres_changes", { event: "*", schema: "public", table: "mt_entries" }, (payload: { eventType: "INSERT" | "UPDATE" | "DELETE"; new: any; old: any }) => {
        if (payload.eventType === "INSERT") {
          setEntries((prev) => {
            if (prev.some((entry) => entry.id === payload.new.id)) return prev
            const newEntry = normalizeEntry(payload.new)
            return [newEntry, ...prev]
          })
        } else if (payload.eventType === "DELETE") {
          setEntries((prev) => prev.filter((entry) => entry.id !== payload.old.id))
        } else if (payload.eventType === "UPDATE") {
          setEntries((prev) => prev.map((entry) => (entry.id === payload.new.id ? normalizeEntry(payload.new) : entry)))
        }
      })
      .subscribe(() => {})

    return () => {
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
          if (entriesRes.data) setEntries(entriesRes.data.map(normalizeEntry))
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

    const dataToInsert = {
      ...entryToDatabasePayload(entry),
      userid: user!.id,
    }

    const { data, error } = await supabase.from("mt_entries").insert([dataToInsert]).select()


    if (error) {
      throw error
    }


    if (data && data.length > 0) {
      const { data: freshEntries } = await supabase
        .from("mt_entries")
        .select("*")
        .order("date", { ascending: false })
        .order("createdat", { ascending: false })

      if (freshEntries) {
        setEntries(freshEntries.map(normalizeEntry))
      }
    }
  }

  // Updated handleUpdateEntry
  const handleUpdateEntry = async (id: string, updatedData: Partial<Entry>) => {
    const { error } = await supabase
      .from("mt_entries")
      .update({ ...entryToDatabasePayload(updatedData), updatedat: new Date().toISOString() })
      .eq("id", id)
    if (error) throw error
  }

  const handleDeleteEntry = async (id: string) => {

    try {
      // Optimistically update the UI immediately
      setEntries((prev) => prev.filter((entry) => entry.id !== id))

      const { data, error } = await supabase.from("mt_entries").delete().eq("id", id)
      if (error) {
        // Revert the optimistic update on error
        const { data: freshEntries } = await supabase
          .from("mt_entries")
          .select("*")
          .order("date", { ascending: false })
          .order("createdat", { ascending: false })
        if (freshEntries) {
          setEntries(freshEntries.map(normalizeEntry))
        }
        throw new Error(error.message)
      }
    } catch (err) {
      // Revert the optimistic update on error
      const { data: freshEntries } = await supabase
        .from("mt_entries")
        .select("*")
        .order("date", { ascending: false })
        .order("createdat", { ascending: false })
      if (freshEntries) {
        setEntries(freshEntries.map(normalizeEntry))
      }
      throw new Error(err instanceof Error ? err.message : "Failed to delete entry. Please try again.")
    }
  }

  const handleDeleteAllEntries = async () => {

    if (!user) {
      throw new Error("You must be logged in to delete entries.")
    }

    try {
      // Optimistically update the UI immediately
      setEntries([])

      const { error } = await supabase.from("mt_entries").delete().eq("userid", user.id)
      if (error) {
        // Revert the optimistic update on error
        const { data: freshEntries } = await supabase
          .from("mt_entries")
          .select("*")
          .order("date", { ascending: false })
          .order("createdat", { ascending: false })
        if (freshEntries) {
          setEntries(freshEntries.map(normalizeEntry))
        }
        throw new Error(error.message)
      }
    } catch (err) {
      // Revert the optimistic update on error
      const { data: freshEntries } = await supabase
        .from("mt_entries")
        .select("*")
        .order("date", { ascending: false })
        .order("createdat", { ascending: false })
      if (freshEntries) {
        setEntries(freshEntries.map(normalizeEntry))
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
      setEntries(data.map(normalizeEntry))
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="tracker-header sticky top-0 z-50 bg-indigo-900 text-white shadow-lg pt-safe-or-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pl-safe pr-safe">
          <div className="pb-3 sm:py-4">
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
              <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
                <button
                  onClick={() => setActiveTab("tracker")}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === "tracker" ? "bg-white text-indigo-900 shadow-sm" : "text-indigo-200 hover:bg-white/10"}`}
                >
                  My Trips
                </button>
                <button
                  onClick={() => setActiveTab("vehicle")}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === "vehicle" ? "bg-white text-indigo-900 shadow-sm" : "text-indigo-200 hover:bg-white/10"}`}
                >
                  Vehicle
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
          <LoadingSkeleton />
        ) : activeTab === "tracker" ? (
          <TrackerView
            user={user}
            locations={locations}
            savedRoutes={savedRoutes}
            entries={entries}
            onAddLocation={handleAddLocation}
            onAddEntry={handleAddEntry}
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onDeleteAll={handleDeleteAllEntries}
            onRefresh={handleRefreshEntries}
            onOpenLocationsTab={() => setActiveTab("locations")}
          />
        ) : activeTab === "vehicle" ? (
          <VehicleMileageView user={user} entries={entries} />
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

// --- Vehicle Mileage View ---
const VehicleMileageView = ({ user, entries }: { user: { id: string } | null; entries: Entry[] }) => {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentClaimMonthKey)
  const [monthlyStartMileage, setMonthlyStartMileage] = useState("")
  const [currentMileage, setCurrentMileage] = useState("")
  const [monthlyVehicleCost, setMonthlyVehicleCost] = useState("")
  const locale = useMemo(() => (typeof navigator !== "undefined" ? navigator.language : "en-GB"), [])
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: DEFAULT_CURRENCY,
        maximumFractionDigits: 2,
      }),
    [locale],
  )
  const formatCurrency = (value: number | string) => {
    const parsed = typeof value === "number" ? value : Number.parseFloat(value || "0")
    return currencyFormatter.format(Number.isNaN(parsed) ? 0 : parsed)
  }

  const monthEntries = useMemo(
    () => entries.filter((entry) => isDateInClaimMonth(entry.date, selectedMonth)),
    [entries, selectedMonth],
  )
  const monthlyBusinessMiles = useMemo(
    () => monthEntries.reduce((acc, entry) => acc + (Number.parseFloat(entry.totalMiles) || 0), 0),
    [monthEntries],
  )
  const monthlyClaimable = useMemo(
    () => monthEntries.reduce((acc, entry) => acc + (Number.parseFloat(entry.totalClaim) || 0), 0),
    [monthEntries],
  )
  const totalVehicleMiles = Math.max(0, (Number.parseFloat(currentMileage) || 0) - (Number.parseFloat(monthlyStartMileage) || 0))
  const personalMiles = Math.max(0, totalVehicleMiles - monthlyBusinessMiles)
  const businessCostShare =
    totalVehicleMiles > 0 ? ((Number.parseFloat(monthlyVehicleCost) || 0) * monthlyBusinessMiles) / totalVehicleMiles : 0
  const claimVsBusinessCost = monthlyClaimable - businessCostShare

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return
    const raw = window.localStorage.getItem(`mileage-insights:${user.id}:${selectedMonth}`)
    if (!raw) {
      setMonthlyStartMileage("")
      setCurrentMileage("")
      setMonthlyVehicleCost("")
      return
    }

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
      setMonthlyStartMileage("")
      setCurrentMileage("")
      setMonthlyVehicleCost("")
    }
  }, [user?.id, selectedMonth])

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return
    window.localStorage.setItem(
      `mileage-insights:${user.id}:${selectedMonth}`,
      JSON.stringify({ monthlyStartMileage, currentMileage, monthlyVehicleCost }),
    )
  }, [user?.id, selectedMonth, monthlyStartMileage, currentMileage, monthlyVehicleCost])

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 p-5 text-white shadow-xl shadow-indigo-100">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
              <Car className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">Vehicle Cost Check</p>
              <h2 className="text-2xl font-bold">{getMonthLabel(selectedMonth)}</h2>
              <p className="text-sm text-indigo-100">
                Claim period: {getClaimMonthRangeLabel(selectedMonth)}. Compare odometer miles against claim miles.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <Button variant="secondary" onClick={() => setSelectedMonth((month) => shiftMonth(month, -1))} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
              Prev
            </Button>
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="min-h-[44px] rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white [color-scheme:dark]"
            />
            <Button variant="secondary" onClick={() => setSelectedMonth((month) => shiftMonth(month, 1))} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
              Next
            </Button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
            <p className="text-[11px] font-semibold uppercase text-indigo-200">Business Miles</p>
            <p className="mt-1 text-2xl font-bold">{monthlyBusinessMiles.toFixed(1)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
            <p className="text-[11px] font-semibold uppercase text-indigo-200">Claim Value</p>
            <p className="mt-1 text-2xl font-bold text-emerald-200">{formatCurrency(monthlyClaimable)}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
            <p className="text-[11px] font-semibold uppercase text-indigo-200">Trips</p>
            <p className="mt-1 text-2xl font-bold">{monthEntries.length}</p>
          </div>
          <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
            <p className="text-[11px] font-semibold uppercase text-indigo-200">Personal Miles</p>
            <p className="mt-1 text-2xl font-bold text-amber-200">{personalMiles.toFixed(1)}</p>
          </div>
        </div>
      </div>

      <Card className="p-4 sm:p-6 space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ["Total Vehicle Miles", totalVehicleMiles.toFixed(1), "text-slate-800"],
            ["Business Miles", monthlyBusinessMiles.toFixed(1), "text-indigo-700"],
            ["Personal Miles", personalMiles.toFixed(1), "text-amber-600"],
            ["Business Cost Share", formatCurrency(businessCostShare), "text-slate-800"],
            ["Claim vs Cost", formatCurrency(claimVsBusinessCost), claimVsBusinessCost >= 0 ? "text-emerald-600" : "text-red-600"],
          ].map(([label, value, colour]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
              <p className={`mt-1 text-xl font-black ${colour}`}>{value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

// --- Tracker View ---
const TrackerView = ({
  user,
  locations,
  savedRoutes,
  entries,
  onAddLocation,
  onAddEntry,
  onUpdateEntry,
  onDeleteEntry,
  onDeleteAll,
  onRefresh,
  onOpenLocationsTab,
}: {
  user: { id: string } | null
  locations: Location[]
  savedRoutes: SavedRoute[]
  entries: Entry[]
  onAddLocation: (loc: Omit<Location, "id">) => Promise<void>
  onAddEntry: (entry: Omit<Entry, "id" | "createdat">) => Promise<void> // Changed from created_at to createdat
  onUpdateEntry: (id: string, data: Partial<Entry>) => Promise<void>
  onDeleteEntry: (id: string) => Promise<void>
  onDeleteAll: () => Promise<void>
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
  const [selectedMonth, setSelectedMonth] = useState(getCurrentClaimMonthKey)
  const [visitFilter, setVisitFilter] = useState<VisitFilter>("all")
  const [statusFilter, setStatusFilter] = useState<EntryStatus | "all">("all")
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false)
  const [defaultClaimRate, setDefaultClaimRate] = useState(DEFAULT_CLAIM_RATE)
  const [defaultChargeRate, setDefaultChargeRate] = useState(DEFAULT_CHARGE_RATE)
  const previousEntryIdsRef = useRef<Set<string>>(new Set())
  const savedParsedLocationNamesRef = useRef<Set<string>>(new Set())
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

  const [formData, setFormData] = useState<{ date: string; startPoint: string; stop1: string; stop2: string; stop3: string; stop4: string; finishPoint: string; startPostcode: string; stop1Postcode: string; stop2Postcode: string; stop3Postcode: string; stop4Postcode: string; finishPostcode: string; clientsVisited: string; description: string; totalMiles: string; claimRate: string; chargeRate: string; status: EntryStatus }>({
    date: getTodayLocalDate(),
    startPoint: "",
    stop1: "",
    stop2: "",
    stop3: "",
    stop4: "",
    finishPoint: "",
    startPostcode: "",
    stop1Postcode: "",
    stop2Postcode: "",
    stop3Postcode: "",
    stop4Postcode: "",
    finishPostcode: "",
    clientsVisited: "",
    description: "",
    totalMiles: "",
    claimRate: DEFAULT_CLAIM_RATE,
    chargeRate: DEFAULT_CHARGE_RATE,
    status: DEFAULT_ENTRY_STATUS,
  })

  const [legDistances, setLegDistances] = useState<Record<string, string>>({})
  const [claimAmountDraft, setClaimAmountDraft] = useState<string | null>(null)

  const resetForm = () => {
    setFormData({
      date: getTodayLocalDate(),
      startPoint: "",
      stop1: "",
      stop2: "",
      stop3: "",
      stop4: "",
      finishPoint: "",
      startPostcode: "",
      stop1Postcode: "",
      stop2Postcode: "",
      stop3Postcode: "",
      stop4Postcode: "",
      finishPostcode: "",
      clientsVisited: "",
      description: "",
      totalMiles: "",
      claimRate: defaultClaimRate,
      chargeRate: defaultChargeRate,
      status: DEFAULT_ENTRY_STATUS,
    })
    setLegDistances({})
    setClaimAmountDraft(null)
    setDraftAdhocNames([])
    setEditingId(null)
    setIsFormOpen(false)
  }

  const handleEditClick = (entry: Entry) => {
    setMobileDetailsEntryId(null)
    setClaimAmountDraft(null)
    setFormData({
      date: entry.date,
      startPoint: entry.startPoint,
      stop1: entry.stop1 || "",
      stop2: entry.stop2 || "",
      stop3: entry.stop3 || "",
      stop4: entry.stop4 || "",
      finishPoint: entry.finishPoint,
      startPostcode: entry.startPostcode || "",
      stop1Postcode: entry.stop1Postcode || "",
      stop2Postcode: entry.stop2Postcode || "",
      stop3Postcode: entry.stop3Postcode || "",
      stop4Postcode: entry.stop4Postcode || "",
      finishPostcode: entry.finishPostcode || "",
      clientsVisited: entry.clientsVisited || "",
      description: entry.description || "",
      totalMiles: entry.totalMiles,
      claimRate: entry.claimRate || DEFAULT_CLAIM_RATE,
      chargeRate: entry.chargeRate || DEFAULT_CHARGE_RATE,
      status: entry.status || DEFAULT_ENTRY_STATUS,
    })
    setEditingId(entry.id)
    setIsFormOpen(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const locationByName = useMemo(
    () => new Map(locations.map((location) => [normalizeLocationName(location.name), location])),
    [locations],
  )
  const getPostcodeForLocation = (name: string) =>
    normalizePostcode(locationByName.get(normalizeLocationName(name))?.postcode)
  const updateRoutePoint = (
    pointField: "startPoint" | "stop1" | "stop2" | "stop3" | "stop4" | "finishPoint",
    postcodeField:
      | "startPostcode"
      | "stop1Postcode"
      | "stop2Postcode"
      | "stop3Postcode"
      | "stop4Postcode"
      | "finishPostcode",
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [pointField]: value,
      [postcodeField]: getPostcodeForLocation(value),
    }))
  }
  const updateManualRoutePoint = (
    pointField: "startPoint" | "stop1" | "stop2" | "stop3" | "stop4" | "finishPoint",
    postcodeField:
      | "startPostcode"
      | "stop1Postcode"
      | "stop2Postcode"
      | "stop3Postcode"
      | "stop4Postcode"
      | "finishPostcode",
    value: string,
  ) => {
    setFormData((prev) => ({
      ...prev,
      [pointField]: value,
      ...(value.trim() ? {} : { [postcodeField]: "" }),
    }))
  }

  const duplicateEntry = (entry: Entry) => {
    setMobileDetailsEntryId(null)
    setClaimAmountDraft(null)
    setFormData({
      date: getTodayLocalDate(),
      startPoint: entry.startPoint,
      stop1: entry.stop1 || "",
      stop2: entry.stop2 || "",
      stop3: entry.stop3 || "",
      stop4: entry.stop4 || "",
      finishPoint: entry.finishPoint,
      startPostcode: entry.startPostcode || getPostcodeForLocation(entry.startPoint),
      stop1Postcode: entry.stop1Postcode || getPostcodeForLocation(entry.stop1 || ""),
      stop2Postcode: entry.stop2Postcode || getPostcodeForLocation(entry.stop2 || ""),
      stop3Postcode: entry.stop3Postcode || getPostcodeForLocation(entry.stop3 || ""),
      stop4Postcode: entry.stop4Postcode || getPostcodeForLocation(entry.stop4 || ""),
      finishPostcode: entry.finishPostcode || getPostcodeForLocation(entry.finishPoint),
      clientsVisited: entry.clientsVisited || "",
      description: entry.description || "",
      totalMiles: entry.totalMiles,
      claimRate: defaultClaimRate,
      chargeRate: defaultChargeRate,
      status: DEFAULT_ENTRY_STATUS,
    })
    setLegDistances({})
    setEditingId(null)
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
  const shouldShowRouteBreakdown = !editingId && hasMultipleLegs

  useEffect(() => {
    if (editingId) return

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
      setClaimAmountDraft(null)
      setFormData((prev) => ({ ...prev, totalMiles: newTotal > 0 ? newTotal.toString() : "" }))
    } else {
      let currentTotal = 0
      legs.forEach((leg) => {
        if (newLegDistances[leg.id]) {
          currentTotal += Number.parseFloat(newLegDistances[leg.id]) || 0
        }
      })

      if (currentTotal.toString() !== formData.totalMiles && currentTotal > 0) {
        setClaimAmountDraft(null)
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
    editingId,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ])

  const handleLegChange = (id: string, value: string) => {
    setClaimAmountDraft(null)
    const newLegs = { ...legDistances, [id]: value }
    setLegDistances(newLegs)
    let total = 0
    legs.forEach((leg) => {
      const val = leg.id === id ? value : newLegs[leg.id]
      total += Number.parseFloat(val) || 0
    })
    setFormData((prev) => ({ ...prev, totalMiles: total > 0 ? total.toString() : "" }))
  }

  const handleTotalMilesChange = (value: string) => {
    setClaimAmountDraft(null)
    setFormData((prev) => ({ ...prev, totalMiles: value }))
  }

  const handleClaimRateChange = (value: string) => {
    setFormData((prev) => {
      const next = { ...prev, claimRate: value }
      if (claimAmountDraft !== null) {
        const adjustedMiles = milesForClaimAmount(claimAmountDraft, value)
        if (adjustedMiles !== null) {
          next.totalMiles = adjustedMiles
        }
      }
      return next
    })
  }

  const handleClaimAmountChange = (value: string) => {
    setClaimAmountDraft(value)
    const adjustedMiles = milesForClaimAmount(value, formData.claimRate)

    if (adjustedMiles !== null) {
      setFormData((prev) => ({ ...prev, totalMiles: adjustedMiles }))
    }
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
  const monthEntries = useMemo(
    () => entries.filter((entry) => isDateInClaimMonth(entry.date, selectedMonth)),
    [entries, selectedMonth],
  )
  const statusFilteredMonthEntries = useMemo(
    () => monthEntries.filter((entry) => statusFilter === "all" || (entry.status || DEFAULT_ENTRY_STATUS) === statusFilter),
    [monthEntries, statusFilter],
  )
  const visitCounts = useMemo(
    () =>
      VISIT_FILTER_OPTIONS.reduce(
        (acc, option) => {
          acc[option.value] = monthEntries.filter((entry) => entryMatchesVisitFilter(entry, option.value)).length
          return acc
        },
        {} as Record<VisitFilter, number>,
      ),
    [monthEntries],
  )
  const visitFilteredEntries = useMemo(
    () => monthEntries.filter((entry) => entryMatchesVisitFilter(entry, visitFilter)),
    [monthEntries, visitFilter],
  )
  const filteredEntries = useMemo(
    () => visitFilteredEntries.filter((entry) => statusFilter === "all" || (entry.status || DEFAULT_ENTRY_STATUS) === statusFilter),
    [visitFilteredEntries, statusFilter],
  )
  const activeVisitFilterLabel = VISIT_FILTER_OPTIONS.find((item) => item.value === visitFilter)?.label || "All visits"
  const activeStatusFilterLabel =
    statusFilter === "all" ? "All statuses" : ENTRY_STATUS_OPTIONS.find((item) => item.value === statusFilter)?.label || statusFilter
  const exportLabel = [selectedMonth, statusFilter !== "all" ? statusFilter : ""]
    .filter(Boolean)
    .join("-")
  const exportVisitCounts = useMemo(
    () =>
      VISIT_FILTER_OPTIONS.reduce(
        (acc, option) => {
          acc[option.value] = statusFilteredMonthEntries.filter((entry) => entryMatchesVisitFilter(entry, option.value)).length
          return acc
        },
        {} as Record<VisitFilter, number>,
      ),
    [statusFilteredMonthEntries],
  )
  const exportTotals = useMemo(
    () =>
      statusFilteredMonthEntries.reduce(
        (acc, curr) => {
          acc.miles += Number.parseFloat(curr.totalMiles) || 0
          acc.claim += Number.parseFloat(curr.totalClaim) || 0
          acc.charge += Number.parseFloat(curr.totalCharge) || 0
          return acc
        },
        { miles: 0, claim: 0, charge: 0 },
      ),
    [statusFilteredMonthEntries],
  )
  const handleExportExcel = () => {
    downloadMileageExcelWorkbook({
      title: `${getMonthLabel(selectedMonth)} Mileage Claim`,
      claimPeriodLabel: getClaimMonthRangeLabel(selectedMonth),
      fileName: `mileage_tracker_export_${exportLabel}.xlsx`,
      sheets: VISIT_FILTER_OPTIONS.map((option) => ({
        name: option.label,
        entries: statusFilteredMonthEntries.filter((entry) => entryMatchesVisitFilter(entry, option.value)),
      })),
    })
    toast({
      title: "Export ready",
      description: "Your Excel workbook has been downloaded with All visits, Footasylum, and TFS tabs.",
    })
  }
  const totals = useMemo(
    () =>
      filteredEntries.reduce(
        (acc, curr) => {
          acc.miles += Number.parseFloat(curr.totalMiles) || 0
          acc.claim += Number.parseFloat(curr.totalClaim) || 0
          acc.charge += Number.parseFloat(curr.totalCharge) || 0
          return acc
        },
        { miles: 0, claim: 0, charge: 0 },
      ),
    [filteredEntries],
  )
  const missingPostcodeTrips = useMemo(
    () => filteredEntries.filter((entry) => getMissingPostcodeCount(entry) > 0).length,
    [filteredEntries],
  )
  const exportMissingPostcodeTrips = useMemo(
    () => statusFilteredMonthEntries.filter((entry) => getMissingPostcodeCount(entry) > 0).length,
    [statusFilteredMonthEntries],
  )
  const recentTemplates = useMemo(() => {
    const seen = new Set<string>()
    return filteredEntries
      .filter((entry) => entry.startPoint && entry.finishPoint)
      .filter((entry) => {
        const key = [entry.startPoint, entry.stop1, entry.stop2, entry.stop3, entry.stop4, entry.finishPoint].filter(Boolean).join("|")
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, 4)
  }, [filteredEntries])

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return
    const raw = window.localStorage.getItem(`mileage-settings:${user.id}`)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as {
        defaultClaimRate?: string
        defaultChargeRate?: string
      }
      if (parsed.defaultClaimRate) setDefaultClaimRate(parsed.defaultClaimRate)
      if (parsed.defaultChargeRate) setDefaultChargeRate(parsed.defaultChargeRate)
    } catch {
      // Ignore malformed localStorage and keep built-in defaults.
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id || typeof window === "undefined") return
    window.localStorage.setItem(
      `mileage-settings:${user.id}`,
      JSON.stringify({ defaultClaimRate, defaultChargeRate }),
    )
  }, [user?.id, defaultClaimRate, defaultChargeRate])

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

    if (!user) {
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

    try {
      const savedLocationCount =
        !editingId && quickDraft ? await saveParsedAdhocLocations(quickDraft, getCurrentFormRoutePointNames()) : 0
      const entryData = { ...formData, totalClaim, totalCharge }

      if (editingId) {
        await onUpdateEntry(editingId, entryData)
      } else {
        await onAddEntry(entryData as any)
      }

      if (entryData.date?.length >= 7) {
        setSelectedMonth(getClaimMonthKeyForDate(entryData.date))
      }
      resetForm()
      toast({
        title: editingId ? "Trip updated" : "Trip saved",
        description:
          savedLocationCount > 0
            ? `Your trip was saved, and ${savedLocationCount} parsed location${savedLocationCount === 1 ? "" : "s"} added.`
            : "Your mileage entry is now in your recent trips list.",
      })
    } catch (err: any) {
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

      setQuickDraft(data as QuickTripDraft)
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

  const getQuickDraftRoutePoints = (trip: QuickTripDraft["trip"]) =>
    [
      { name: trip.startPoint, postcode: trip.startPostcode },
      { name: trip.stop1, postcode: trip.stop1Postcode },
      { name: trip.stop2, postcode: trip.stop2Postcode },
      { name: trip.stop3, postcode: trip.stop3Postcode },
      { name: trip.stop4, postcode: trip.stop4Postcode },
      { name: trip.finishPoint, postcode: trip.finishPostcode },
    ]
      .map((point) => ({
        name: (point.name || "").trim(),
        postcode: normalizePostcode(point.postcode),
      }))
      .filter((point) => point.name)

  const getCurrentFormRoutePointNames = () =>
    [formData.startPoint, formData.stop1, formData.stop2, formData.stop3, formData.stop4, formData.finishPoint]
      .map((name) => name.trim())
      .filter(Boolean)

  const getResolvedAddressForDraftLocation = (draft: QuickTripDraft, name: string) => {
    const resolvedAddresses = draft.metadata.resolvedAddresses || {}
    const exact = resolvedAddresses[name]
    if (exact) return exact

    const normalizedName = normalizeLocationName(name)
    const matchedKey = Object.keys(resolvedAddresses).find((key) => normalizeLocationName(key) === normalizedName)
    return matchedKey ? resolvedAddresses[matchedKey] : undefined
  }

  const saveParsedAdhocLocations = async (draft: QuickTripDraft, activePointNames?: string[]) => {
    if (!user) throw new Error("Not authenticated")

    const activeNames = activePointNames
      ? new Set(activePointNames.map((name) => normalizeLocationName(name)).filter(Boolean))
      : null
    const routePoints = getQuickDraftRoutePoints(draft.trip)
    const existingNames = new Set([
      ...locations.map((location) => normalizeLocationName(location.name)).filter(Boolean),
      ...Array.from(savedParsedLocationNamesRef.current),
    ])
    const rowsToSave: Array<Omit<Location, "id"> & { normalizedName: string }> = []

    for (const rawName of draft.adhocLocations || []) {
      const name = rawName.trim()
      const normalizedName = normalizeLocationName(name)
      if (!name || !normalizedName || existingNames.has(normalizedName)) continue
      if (activeNames && !activeNames.has(normalizedName)) continue

      const routePoint = routePoints.find((point) => normalizeLocationName(point.name) === normalizedName)
      const resolvedAddress = getResolvedAddressForDraftLocation(draft, name)
      const postcode = routePoint?.postcode || extractUKPostcode(resolvedAddress)
      if (!postcode) continue

      const { address, city } = getResolvedLocationAddressParts(name, resolvedAddress, postcode)
      rowsToSave.push({
        name,
        address,
        city,
        postcode,
        category: "Venue",
        normalizedName,
      })
      existingNames.add(normalizedName)
    }

    for (const { normalizedName, ...row } of rowsToSave) {
      await onAddLocation(row)
      savedParsedLocationNamesRef.current.add(normalizedName)
    }

    return rowsToSave.length
  }

  const applyQuickDraftToForm = async () => {
    if (!quickDraft) return
    const trip = quickDraft.trip

    try {
      const savedCount = await saveParsedAdhocLocations(quickDraft)
      if (savedCount > 0) {
        toast({
          title: "Parsed locations saved",
          description: `${savedCount} location${savedCount === 1 ? "" : "s"} added to saved locations.`,
        })
      }
    } catch (error) {
      toast({
        title: "Could not save parsed locations",
        description: error instanceof Error ? error.message : "The draft can still be reviewed.",
        variant: "destructive",
      })
    }

    setDraftAdhocNames(quickDraft.adhocLocations || [])
    setFormData({
      date: trip.date || getTodayLocalDate(),
      startPoint: trip.startPoint || "",
      stop1: trip.stop1 || "",
      stop2: trip.stop2 || "",
      stop3: trip.stop3 || "",
      stop4: trip.stop4 || "",
      finishPoint: trip.finishPoint || "",
      startPostcode: trip.startPostcode || getPostcodeForLocation(trip.startPoint || ""),
      stop1Postcode: trip.stop1Postcode || getPostcodeForLocation(trip.stop1 || ""),
      stop2Postcode: trip.stop2Postcode || getPostcodeForLocation(trip.stop2 || ""),
      stop3Postcode: trip.stop3Postcode || getPostcodeForLocation(trip.stop3 || ""),
      stop4Postcode: trip.stop4Postcode || getPostcodeForLocation(trip.stop4 || ""),
      finishPostcode: trip.finishPostcode || getPostcodeForLocation(trip.finishPoint || ""),
      clientsVisited: trip.clientsVisited || "",
      description: trip.description || "",
      totalMiles: quickDraft.distance.totalMiles || "",
      claimRate: defaultClaimRate,
      chargeRate: defaultChargeRate,
      status: DEFAULT_ENTRY_STATUS,
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

    const claimRate = defaultClaimRate
    const chargeRate = defaultChargeRate
    const totalClaim = (Number.parseFloat(totalMiles) * Number.parseFloat(claimRate)).toFixed(2)
    const totalCharge = (Number.parseFloat(totalMiles) * Number.parseFloat(chargeRate)).toFixed(2)

    try {
      const savedLocationCount = await saveParsedAdhocLocations(quickDraft)
      await onAddEntry({
        date: trip.date,
        startPoint: trip.startPoint,
        stop1: trip.stop1 || "",
        stop2: trip.stop2 || "",
        stop3: trip.stop3 || "",
        stop4: trip.stop4 || "",
        finishPoint: trip.finishPoint,
        startPostcode: trip.startPostcode || getPostcodeForLocation(trip.startPoint),
        stop1Postcode: trip.stop1Postcode || getPostcodeForLocation(trip.stop1 || ""),
        stop2Postcode: trip.stop2Postcode || getPostcodeForLocation(trip.stop2 || ""),
        stop3Postcode: trip.stop3Postcode || getPostcodeForLocation(trip.stop3 || ""),
        stop4Postcode: trip.stop4Postcode || getPostcodeForLocation(trip.stop4 || ""),
        finishPostcode: trip.finishPostcode || getPostcodeForLocation(trip.finishPoint),
        clientsVisited: trip.clientsVisited || "",
        description: trip.description || "",
        totalMiles,
        claimRate,
        chargeRate,
        totalClaim,
        totalCharge,
        status: DEFAULT_ENTRY_STATUS,
      })
      if (trip.date?.length >= 7) {
        setSelectedMonth(getClaimMonthKeyForDate(trip.date))
      }
      setQuickDraft(null)
      setQuickAddText("")
      toast({
        title: "Trip added",
        description:
          savedLocationCount > 0
            ? `AI draft was added, and ${savedLocationCount} parsed location${savedLocationCount === 1 ? "" : "s"} saved.`
            : "AI draft was added directly to your entries.",
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
    const savedOpts = locations.map((l) => ({ value: l.name, label: l.postcode ? `${l.name} - ${l.postcode}` : l.name }))
    const savedNames = new Set(locations.map((l) => l.name))
    const adhocOpts = draftAdhocNames
      .filter((name) => !savedNames.has(name))
      .map((name) => ({ value: name, label: `${name} (ad-hoc)` }))
    return [...savedOpts, ...adhocOpts]
  }, [locations, draftAdhocNames])

  const getEntryRouteLegs = (entry: Entry) => {
    const route = [entry.startPoint, entry.stop1, entry.stop2, entry.stop3, entry.stop4, entry.finishPoint].filter(Boolean)
    return route.slice(0, -1).map((from, index) => ({ from, to: route[index + 1] }))
  }

  const usesOnlySavedRoutes = (entry: Entry) => {
    const routeLegs = getEntryRouteLegs(entry)
    if (routeLegs.length === 0) return false
    return routeLegs.every((leg) =>
      savedRoutes.some(
        (route) =>
          (route.from === leg.from && route.to === leg.to) ||
          (route.from === leg.to && route.to === leg.from),
      ),
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 md:pb-0">
      <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/50 p-4 sm:p-5 md:p-6 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">Claim Mode</p>
            <h2 className="text-2xl font-black tracking-tight text-slate-900">{getMonthLabel(selectedMonth)}</h2>
            <p className="text-sm text-slate-500">
              Claim period: {getClaimMonthRangeLabel(selectedMonth)}. Everything below is filtered to this period, visit tab, and status.
            </p>
          </div>
          <ClaimPeriodSwitcher label={getClaimMonthRangeLabel(selectedMonth)} onPrev={() => setSelectedMonth((month) => shiftMonth(month, -1))} onCurrent={() => setSelectedMonth(getCurrentClaimMonthKey())} onNext={() => setSelectedMonth((month) => shiftMonth(month, 1))} />
        </div>
        <div className="xl:hidden rounded-3xl bg-indigo-900 p-4 text-white shadow-lg shadow-indigo-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">Monthly Claim</p>
              <p className="mt-1 text-2xl font-black">{getMonthLabel(selectedMonth)}</p>
              <p className="mt-1 text-sm text-indigo-100">
                {filteredEntries.length} trips · {totals.miles.toFixed(1)} miles
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2 text-right ring-1 ring-white/10">
              <p className="text-[11px] font-semibold text-indigo-200">Claim</p>
              <p className="text-lg font-black text-emerald-200">{formatCurrency(totals.claim)}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
              <p className="text-[11px] font-semibold text-indigo-200">Missing postcodes</p>
              <p className="text-lg font-black">{missingPostcodeTrips}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/10">
              <p className="text-[11px] font-semibold text-indigo-200">Filter</p>
              <p className="text-lg font-black">{activeVisitFilterLabel}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {VISIT_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setVisitFilter(option.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                visitFilter === option.value
                  ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 bg-white text-slate-500"
              }`}
            >
              {option.label}
              <span className="ml-1 text-[10px] opacity-70">{visitCounts[option.value] || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusFilter === "all" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-500"}`}
          >
            All
          </button>
          {ENTRY_STATUS_OPTIONS.map((status) => (
            <button
              key={status.value}
              type="button"
              onClick={() => setStatusFilter(status.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusFilter === status.value ? ENTRY_STATUS_CLASSES[status.value] : "border-slate-200 bg-white text-slate-500"}`}
            >
              {status.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Stats Bar */}
      <KpiSummary miles={totals.miles.toFixed(1)} reimbursement={formatCurrency(totals.claim)} chargeOut={formatCurrency(totals.charge)} trips={String(filteredEntries.length)} />
      <div className="hidden grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        <Card className="p-4 flex items-center justify-between bg-white">
          <div>
            <p className="text-slate-500 text-xs sm:text-sm font-medium">{getMonthLabel(selectedMonth)} Miles</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-800">{totals.miles.toFixed(1)}</p>
          </div>
          <Navigation className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-500 opacity-20" />
        </Card>
        <Card className="p-4 flex items-center justify-between bg-white border-emerald-200 border-l-4">
          <div>
            <p className="text-emerald-700 text-xs sm:text-sm font-medium">Claim Value</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-emerald-600">{formatCurrency(totals.claim)}</p>
          </div>
          <PoundSterling className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-500 opacity-20" />
        </Card>
        <Card className="p-4 flex items-center justify-between bg-white border-blue-200 border-l-4">
          <div>
            <p className="text-blue-700 text-xs sm:text-sm font-medium">Trips Logged</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-blue-600">{filteredEntries.length}</p>
          </div>
          <FileText className="w-7 h-7 sm:w-8 sm:h-8 text-blue-500 opacity-20" />
        </Card>
        <Card className="p-4 flex items-center justify-between bg-white border-amber-200 border-l-4">
          <div>
            <p className="text-amber-700 text-xs sm:text-sm font-medium">Missing Postcodes</p>
            <p className="text-xl sm:text-2xl md:text-3xl font-bold text-amber-600">{missingPostcodeTrips}</p>
          </div>
          <MapPin className="w-7 h-7 sm:w-8 sm:h-8 text-amber-500 opacity-20" />
        </Card>
      </div>

      <Card className="p-3 sm:p-4 md:p-5 space-y-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Default Rates</p>
          <p className="text-xs text-slate-500">New trips and AI drafts use these rates. Existing trips keep their saved rates.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            label={`Default Claim Rate (${DEFAULT_CURRENCY})`}
            type="number"
            value={defaultClaimRate}
            onChange={(e) => setDefaultClaimRate(e.target.value)}
            placeholder="0.45"
          />
          <Input
            label={`Default Charge Rate (${DEFAULT_CURRENCY})`}
            type="number"
            value={defaultChargeRate}
            onChange={(e) => setDefaultChargeRate(e.target.value)}
            placeholder="0.25"
          />
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
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-800">{getMonthLabel(selectedMonth)} Entries</h2>
          <p className="text-xs text-slate-500">
            Showing {filteredEntries.length} of {monthEntries.length} trips · {activeVisitFilterLabel} · {activeStatusFilterLabel}
          </p>
        </div>
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
          <Button
            variant="secondary"
            onClick={() => setIsExportPreviewOpen(true)}
            className="hidden md:flex w-full sm:w-auto"
            disabled={statusFilteredMonthEntries.length === 0}
          >
            <Download className="w-4 h-4" />
            Export Excel
          </Button>
          {entries.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => setIsDeleteAllOpen(true)}
              className="w-full sm:w-auto text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete All</span>
            </Button>
          )}
          <Button onClick={openTripForm} disabled={!user} className="hidden md:flex w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Add New Trip
          </Button>
        </div>
      </div>

      {recentTemplates.length > 0 && (
        <Card className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Quick Templates</p>
              <p className="text-xs text-slate-500">Duplicate a recent route and change the date/details.</p>
            </div>
            {entries[0] && (
              <Button variant="secondary" onClick={() => duplicateEntry(entries[0])} className="w-full sm:w-auto">
                Duplicate Last Trip
              </Button>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {recentTemplates.map((entry) => (
              <button
                key={`template-${entry.id}`}
                type="button"
                onClick={() => duplicateEntry(entry)}
                className="min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs hover:border-indigo-200 hover:bg-indigo-50"
              >
                <div className="font-semibold text-slate-700 truncate">
                  {entry.startPoint} {"->"} {entry.finishPoint}
                </div>
                <div className="mt-1 text-slate-500">
                  {Number.parseFloat(entry.totalMiles || "0").toFixed(1)} mi · {formatCurrency(entry.totalClaim)}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-40 rounded-3xl border border-slate-200 bg-white/95 shadow-2xl shadow-slate-300/40 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-3 gap-2 px-2 py-2">
          <button
            type="button"
            onClick={() => setIsExportPreviewOpen(true)}
            disabled={statusFilteredMonthEntries.length === 0}
            className="flex min-h-[56px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 disabled:opacity-50"
          >
            <Download className="mb-0.5 h-4 w-4" />
            Excel
          </button>
          <button
            type="button"
            onClick={openTripForm}
            disabled={!user}
            className="flex min-h-[56px] flex-col items-center justify-center rounded-2xl bg-indigo-600 text-xs font-bold text-white shadow-lg shadow-indigo-200 disabled:opacity-50"
          >
            <Plus className="mb-0.5 h-5 w-5" />
            Trip
          </button>
          <button
            type="button"
            onClick={onOpenLocationsTab}
            className="flex min-h-[56px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600"
          >
            <MapPin className="mb-0.5 h-4 w-4" />
            Places
          </button>
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
                  "Journey Builder"
                )}
              </h3>
              <button type="button" onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                Close
              </button>
            </div>

            <div className="rounded-3xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-black text-white">1</span>
                <div>
                  <p className="font-bold text-slate-800">Journey</p>
                  <p className="text-xs text-slate-500">
                    {editingId
                      ? "Edit the parsed route text and postcode snapshots."
                      : "Pick the route points; postcodes fill automatically from saved locations."}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input
                  type="date"
                  label="Date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
                {editingId ? (
                  <Input
                    label="Start"
                    value={formData.startPoint}
                    onChange={(e) => updateManualRoutePoint("startPoint", "startPostcode", e.target.value)}
                  />
                ) : (
                  <Select
                    label="Start"
                    options={locationOptions}
                    value={formData.startPoint}
                    onChange={(e) => updateRoutePoint("startPoint", "startPostcode", e.target.value)}
                  />
                )}
                {editingId ? (
                  <Input
                    label="Finish"
                    value={formData.finishPoint}
                    onChange={(e) => updateManualRoutePoint("finishPoint", "finishPostcode", e.target.value)}
                  />
                ) : (
                  <Select
                    label="Finish"
                    options={locationOptions}
                    value={formData.finishPoint}
                    onChange={(e) => updateRoutePoint("finishPoint", "finishPostcode", e.target.value)}
                  />
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Start Postcode"
                  placeholder="e.g. L36 7XA"
                  value={formData.startPostcode}
                  onChange={(e) => setFormData({ ...formData, startPostcode: e.target.value.toUpperCase() })}
                />
                <Input
                  label="Finish Postcode"
                  placeholder="e.g. M17 1AB"
                  value={formData.finishPostcode}
                  onChange={(e) => setFormData({ ...formData, finishPostcode: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-sm font-black text-white">2</span>
                <div>
                  <p className="font-bold text-slate-800">Stops</p>
                  <p className="text-xs text-slate-500">Add client, venue, or event stops in travel order.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {editingId ? (
                  <Input
                    label="1st Stop"
                    placeholder="None"
                    value={formData.stop1}
                    onChange={(e) => updateManualRoutePoint("stop1", "stop1Postcode", e.target.value)}
                  />
                ) : (
                  <Select
                    label="1st Stop"
                    placeholder="None"
                    options={locationOptions}
                    value={formData.stop1}
                    onChange={(e) => updateRoutePoint("stop1", "stop1Postcode", e.target.value)}
                  />
                )}
                {editingId ? (
                  <Input
                    label="2nd Stop"
                    placeholder="None"
                    value={formData.stop2}
                    onChange={(e) => updateManualRoutePoint("stop2", "stop2Postcode", e.target.value)}
                  />
                ) : (
                  <Select
                    label="2nd Stop"
                    placeholder="None"
                    options={locationOptions}
                    value={formData.stop2}
                    onChange={(e) => updateRoutePoint("stop2", "stop2Postcode", e.target.value)}
                  />
                )}
                {editingId ? (
                  <Input
                    label="3rd Stop"
                    placeholder="None"
                    value={formData.stop3}
                    onChange={(e) => updateManualRoutePoint("stop3", "stop3Postcode", e.target.value)}
                  />
                ) : (
                  <Select
                    label="3rd Stop"
                    placeholder="None"
                    options={locationOptions}
                    value={formData.stop3}
                    onChange={(e) => updateRoutePoint("stop3", "stop3Postcode", e.target.value)}
                  />
                )}
                {editingId ? (
                  <Input
                    label="4th Stop"
                    placeholder="None"
                    value={formData.stop4}
                    onChange={(e) => updateManualRoutePoint("stop4", "stop4Postcode", e.target.value)}
                  />
                ) : (
                  <Select
                    label="4th Stop"
                    placeholder="None"
                    options={locationOptions}
                    value={formData.stop4}
                    onChange={(e) => updateRoutePoint("stop4", "stop4Postcode", e.target.value)}
                  />
                )}
              </div>
              {(formData.stop1 || formData.stop2 || formData.stop3 || formData.stop4) && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                  {formData.stop1 && (
                    <Input
                      label="1st Stop Postcode"
                      value={formData.stop1Postcode}
                      onChange={(e) => setFormData({ ...formData, stop1Postcode: e.target.value.toUpperCase() })}
                    />
                  )}
                  {formData.stop2 && (
                    <Input
                      label="2nd Stop Postcode"
                      value={formData.stop2Postcode}
                      onChange={(e) => setFormData({ ...formData, stop2Postcode: e.target.value.toUpperCase() })}
                    />
                  )}
                  {formData.stop3 && (
                    <Input
                      label="3rd Stop Postcode"
                      value={formData.stop3Postcode}
                      onChange={(e) => setFormData({ ...formData, stop3Postcode: e.target.value.toUpperCase() })}
                    />
                  )}
                  {formData.stop4 && (
                    <Input
                      label="4th Stop Postcode"
                      value={formData.stop4Postcode}
                      onChange={(e) => setFormData({ ...formData, stop4Postcode: e.target.value.toUpperCase() })}
                    />
                  )}
                </div>
              )}
            </div>

            {shouldShowRouteBreakdown && (
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

            <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white">3</span>
                <div>
                  <p className="font-bold text-slate-800">Purpose</p>
                  <p className="text-xs text-slate-500">What was the trip for?</p>
                </div>
              </div>
              <Input
                label="Description"
                placeholder="Meeting purpose etc."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
              <Input
                label="Clients Visited"
                placeholder="e.g. John Doe"
                value={formData.clientsVisited}
                onChange={(e) => setFormData({ ...formData, clientsVisited: e.target.value })}
              />
            </div>

            <div className="bg-indigo-50 p-4 rounded-3xl border border-indigo-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-12 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-sm font-black text-white">4</span>
                <div>
                  <p className="font-bold text-slate-800">Mileage & Claim</p>
                  <p className="text-xs text-slate-500">
                    {editingId
                      ? "Adjust the parsed miles directly, or enter a claim amount to back-calculate miles."
                      : "Saved routes auto-fill miles; you can override any leg."}
                  </p>
                </div>
              </div>
              <div className="md:col-span-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Miles</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0.0"
                      value={formData.totalMiles}
                      onChange={(e) => handleTotalMilesChange(e.target.value)}
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
                  onChange={(e) => handleClaimRateChange(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Claim Amount</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={claimAmountDraft ?? totalClaim}
                    onChange={(e) => handleClaimAmountChange(e.target.value)}
                    onBlur={() => setClaimAmountDraft(null)}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg font-bold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
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
              <div className="md:col-span-1">
                <Select
                  label="Status"
                  options={ENTRY_STATUS_OPTIONS}
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as EntryStatus })}
                />
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
        <div className="hidden xl:block overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[1080px] table-fixed text-sm text-left">
            <colgroup>
              <col className="w-[96px]" />
              <col className="w-[360px]" />
              <col className="w-[220px]" />
              <col className="w-[72px]" />
              <col className="w-[88px]" />
              <col className="w-[88px]" />
              <col className="w-[108px]" />
              <col className="w-[80px]" />
            </colgroup>
            <thead className="bg-indigo-900 text-white uppercase text-xs font-semibold">
              <tr>
                <th className="px-3 py-3 whitespace-nowrap">Date</th>
                <th className="px-3 py-3 whitespace-nowrap">Route</th>
                <th className="px-3 py-3 whitespace-nowrap">Purpose</th>
                <th className="px-3 py-3 whitespace-nowrap text-right">Miles</th>
                <th className="px-3 py-3 whitespace-nowrap text-right">Claim</th>
                <th className="px-3 py-3 whitespace-nowrap text-right">Charge</th>
                <th className="px-3 py-3 whitespace-nowrap">Status</th>
                <th className="px-3 py-3 whitespace-nowrap w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                      <div className="rounded-full bg-indigo-50 p-3">
                        <Navigation className="h-5 w-5 text-indigo-500" />
                      </div>
                      <EmptyState />
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
                filteredEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`hover:bg-slate-50 transition-colors ${newlyAddedEntryIds[entry.id] ? "animate-in fade-in-0 slide-in-from-top-1 duration-500 bg-emerald-50/50" : ""}`}
                  >
                    <td className="px-3 py-4 align-top font-medium text-slate-700">{formatDate(entry.date)}</td>
                    <td className="px-3 py-4 align-top">
                      <div className="space-y-2">
                        <div className="grid grid-cols-[14px_1fr_auto] items-start gap-2 text-xs">
                          <div className="mt-1.5 h-2 w-2 rounded-full bg-emerald-400"></div>
                          <div className="min-w-0">
                            <div className="font-semibold leading-snug text-slate-700 break-words">{entry.startPoint}</div>
                            <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Start</div>
                          </div>
                          <span
                            className={`rounded-md px-2 py-1 text-[11px] font-bold ${entry.startPostcode ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-700"}`}
                          >
                            {entry.startPostcode || "Missing"}
                          </span>
                        </div>

                        {[entry.stop1, entry.stop2, entry.stop3, entry.stop4].some(Boolean) && (
                          <div className="ml-[5px] space-y-1.5 border-l border-slate-200 pl-4">
                            {[
                              { name: entry.stop1, postcode: entry.stop1Postcode },
                              { name: entry.stop2, postcode: entry.stop2Postcode },
                              { name: entry.stop3, postcode: entry.stop3Postcode },
                              { name: entry.stop4, postcode: entry.stop4Postcode },
                            ]
                              .filter((stop) => stop.name)
                              .map((stop, index) => (
                                <div
                                  key={`${entry.id}-desktop-stop-${index}`}
                                  className="grid grid-cols-[1fr_auto] items-start gap-2 text-xs"
                                >
                                  <div className="min-w-0 leading-snug text-slate-500 break-words">
                                    Stop {index + 1}: <span className="font-medium text-slate-600">{stop.name}</span>
                                  </div>
                                  <span
                                    className={`rounded-md px-2 py-1 text-[11px] font-bold ${stop.postcode ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-700"}`}
                                  >
                                    {stop.postcode || "Missing"}
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}

                        <div className="grid grid-cols-[14px_1fr_auto] items-start gap-2 text-xs">
                          <div className="mt-1.5 h-2 w-2 rounded-full bg-red-400"></div>
                          <div className="min-w-0">
                            <div className="font-semibold leading-snug text-slate-700 break-words">{entry.finishPoint}</div>
                            <div className="text-[10px] font-bold uppercase tracking-wide text-red-500">Finish</div>
                          </div>
                          <span
                            className={`rounded-md px-2 py-1 text-[11px] font-bold ${entry.finishPostcode ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-700"}`}
                          >
                            {entry.finishPostcode || "Missing"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 pt-1">
                          <StatusBadge status={(entry.status || DEFAULT_ENTRY_STATUS) as EntryStatus} />
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${usesOnlySavedRoutes(entry) ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                            {usesOnlySavedRoutes(entry) ? "Saved route" : "Manual miles"}
                          </span>
                          {getMissingPostcodeCount(entry) === 0 ? (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Complete</span>
                          ) : (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Missing postcode</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4 align-top text-slate-600">
                      <div className="space-y-1">
                        <div className="whitespace-normal break-words leading-snug font-medium text-slate-700">
                          {entry.clientsVisited || "-"}
                        </div>
                        {entry.description && (
                          <div className="line-clamp-2 whitespace-normal break-words text-xs leading-snug text-slate-500">
                            {entry.description}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-4 align-top text-right font-medium text-slate-700">
                      {Number.parseFloat(entry.totalMiles || "0").toFixed(1)}
                    </td>
                    <td className="px-3 py-4 align-top text-right font-bold text-emerald-600">{formatCurrency(entry.totalClaim)}</td>
                    <td className="px-3 py-4 align-top text-right font-bold text-blue-600">{formatCurrency(entry.totalCharge)}</td>
                    <td className="px-3 py-4 align-top">
                      <select
                        value={entry.status || DEFAULT_ENTRY_STATUS}
                        onChange={(event) => void onUpdateEntry(entry.id, { status: event.target.value as EntryStatus })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
                      >
                        {ENTRY_STATUS_OPTIONS.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-4 align-top text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => duplicateEntry(entry)}
                          className="text-slate-400 hover:text-emerald-600 transition-colors p-1"
                          title="Duplicate Entry"
                          type="button"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
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
        <div className="xl:hidden space-y-3 bg-slate-50 p-3">
          {filteredEntries.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                <div className="rounded-full bg-indigo-50 p-3">
                  <Navigation className="h-5 w-5 text-indigo-500" />
                </div>
                <EmptyState />
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
            filteredEntries.map((entry) => {
              const stopCount = [entry.stop1, entry.stop2, entry.stop3, entry.stop4].filter(Boolean).length
              return (
                <div
                  key={entry.id}
                  className={`overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${newlyAddedEntryIds[entry.id] ? "animate-in fade-in-0 slide-in-from-top-1 duration-500 ring-2 ring-emerald-100" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => setMobileDetailsEntryId(entry.id)}
                    className="w-full p-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-500">{formatDate(entry.date)}</div>
                        <div className="mt-1 text-lg font-black leading-tight text-slate-900">
                          {formatCurrency(entry.totalClaim)}
                        </div>
                        <div className="text-xs font-semibold text-slate-400">Claim value</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <StatusBadge status={(entry.status || DEFAULT_ENTRY_STATUS) as EntryStatus} />
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${usesOnlySavedRoutes(entry) ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                          {usesOnlySavedRoutes(entry) ? "Saved route" : "Manual miles"}
                        </span>
                        {getMissingPostcodeCount(entry) === 0 ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">Complete</span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">Missing postcode</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="grid grid-cols-[18px_1fr_auto] items-start gap-2">
                        <div className="mt-1.5 h-3 w-3 rounded-full bg-emerald-400 ring-4 ring-emerald-50"></div>
                        <div className="min-w-0">
                          <div className="font-bold leading-snug text-slate-800 break-words">{entry.startPoint}</div>
                          <div className="text-xs font-semibold text-slate-500">{entry.startPostcode || "Postcode missing"}</div>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">Start</span>
                      </div>

                      {stopCount > 0 && (
                        <div className="ml-[5px] space-y-2 border-l-2 border-dashed border-slate-200 pl-4">
                          {[
                            { point: entry.stop1, postcode: entry.stop1Postcode },
                            { point: entry.stop2, postcode: entry.stop2Postcode },
                            { point: entry.stop3, postcode: entry.stop3Postcode },
                            { point: entry.stop4, postcode: entry.stop4Postcode },
                          ]
                            .filter((stop) => stop.point)
                            .map((stop, index) => (
                              <div key={`${entry.id}-mobile-stop-${index}`} className="rounded-2xl bg-slate-50 px-3 py-2">
                                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Stop {index + 1}</div>
                                <div className="text-sm font-semibold leading-snug text-slate-700 break-words">{stop.point}</div>
                                <div className="text-xs font-semibold text-slate-500">{stop.postcode || "Postcode missing"}</div>
                              </div>
                            ))}
                        </div>
                      )}

                      <div className="grid grid-cols-[18px_1fr_auto] items-start gap-2">
                        <div className="mt-1.5 h-3 w-3 rounded-full bg-red-400 ring-4 ring-red-50"></div>
                        <div className="min-w-0">
                          <div className="font-bold leading-snug text-slate-800 break-words">{entry.finishPoint}</div>
                          <div className="text-xs font-semibold text-slate-500">{entry.finishPostcode || "Postcode missing"}</div>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">Finish</span>
                      </div>
                    </div>

                    {entry.clientsVisited && (
                      <div className="mt-4 rounded-2xl bg-indigo-50 px-3 py-2 text-xs font-semibold leading-snug text-indigo-700">
                        Client: {entry.clientsVisited}
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl bg-slate-50 p-2 text-center">
                        <div className="text-[11px] font-semibold text-slate-500">Miles</div>
                        <div className="font-black text-slate-800">{Number.parseFloat(entry.totalMiles || "0").toFixed(1)}</div>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 p-2 text-center">
                        <div className="text-[11px] font-semibold text-emerald-700">Claim</div>
                        <div className="font-black text-emerald-700">{formatCurrency(entry.totalClaim)}</div>
                      </div>
                      <div className="rounded-2xl bg-blue-50 p-2 text-center">
                        <div className="text-[11px] font-semibold text-blue-700">Charge</div>
                        <div className="font-black text-blue-700">{formatCurrency(entry.totalCharge)}</div>
                      </div>
                    </div>
                  </button>

                  <div className="grid grid-cols-3 gap-2 border-t border-slate-100 bg-slate-50/70 p-3">
                    <Button variant="secondary" onClick={() => duplicateEntry(entry)} className="w-full text-xs">
                      Duplicate
                    </Button>
                    <Button variant="secondary" onClick={() => handleEditClick(entry)} className="w-full text-xs">
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setEntryIdToDelete(entry.id)}
                      className="w-full text-xs border-red-200 text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </Card>

      <Drawer open={Boolean(mobileDetailsEntryId)} onOpenChange={(open) => !open && setMobileDetailsEntryId(null)}>
        <DrawerContent className="xl:hidden max-h-[88vh]">
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
                    <div>
                      Start: {mobileDetailsEntry.startPoint}{" "}
                      <span className={mobileDetailsEntry.startPostcode ? "text-slate-500" : "text-amber-600"}>
                        {mobileDetailsEntry.startPostcode || "Postcode missing"}
                      </span>
                    </div>
                    {[
                      { point: mobileDetailsEntry.stop1, postcode: mobileDetailsEntry.stop1Postcode },
                      { point: mobileDetailsEntry.stop2, postcode: mobileDetailsEntry.stop2Postcode },
                      { point: mobileDetailsEntry.stop3, postcode: mobileDetailsEntry.stop3Postcode },
                      { point: mobileDetailsEntry.stop4, postcode: mobileDetailsEntry.stop4Postcode },
                    ]
                      .filter((stop) => stop.point)
                      .map((stop, index) => (
                        <div key={`${mobileDetailsEntry.id}-stop-${index}`}>
                          Stop {index + 1}: {stop.point}{" "}
                          <span className={stop.postcode ? "text-slate-500" : "text-amber-600"}>
                            {stop.postcode || "Postcode missing"}
                          </span>
                        </div>
                      ))}
                    <div>
                      Finish: {mobileDetailsEntry.finishPoint}{" "}
                      <span className={mobileDetailsEntry.finishPostcode ? "text-slate-500" : "text-amber-600"}>
                        {mobileDetailsEntry.finishPostcode || "Postcode missing"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500">Claim Status</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {ENTRY_STATUS_OPTIONS.map((status) => (
                      <button
                        key={`mobile-status-${status.value}`}
                        type="button"
                        onClick={() => void onUpdateEntry(mobileDetailsEntry.id, { status: status.value })}
                        className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                          (mobileDetailsEntry.status || DEFAULT_ENTRY_STATUS) === status.value
                            ? ENTRY_STATUS_CLASSES[status.value]
                            : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        {status.label}
                      </button>
                    ))}
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
                    onClick={() => duplicateEntry(mobileDetailsEntry)}
                    className="w-full"
                  >
                    Duplicate
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      handleEditClick(mobileDetailsEntry)
                    }}
                    className="w-full"
                  >
                    Edit Trip
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2">
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

      <Drawer open={isExportPreviewOpen} onOpenChange={setIsExportPreviewOpen}>
        <DrawerContent className="mx-auto max-h-[90vh] max-w-lg">
          <DrawerHeader className="text-left">
            <DrawerTitle>{getMonthLabel(selectedMonth)} Excel Preview</DrawerTitle>
            <DrawerDescription>Download one Excel workbook with All visits, Footasylum, and TFS tabs.</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 px-4 pb-4">
            <div className="rounded-3xl bg-indigo-900 p-4 text-white">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-200">Mileage Claim</p>
              <p className="mt-1 text-2xl font-black">{getMonthLabel(selectedMonth)}</p>
              <p className="mt-1 text-sm text-indigo-100">
                {statusFilteredMonthEntries.length} trips · {exportTotals.miles.toFixed(1)} miles · 3 Excel tabs
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">Trips</p>
                <p className="text-lg font-bold text-slate-800">{statusFilteredMonthEntries.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase text-slate-500">Miles</p>
                <p className="text-lg font-bold text-slate-800">{exportTotals.miles.toFixed(1)}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3">
                <p className="text-xs font-semibold uppercase text-emerald-700">Claim</p>
                <p className="text-lg font-bold text-emerald-700">{formatCurrency(exportTotals.claim)}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase text-amber-700">Missing Postcodes</p>
                <p className="text-lg font-bold text-amber-700">{exportMissingPostcodeTrips}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Workbook tabs</p>
              <p className="mt-1">
                All visits ({exportVisitCounts.all}) · Footasylum ({exportVisitCounts.footasylum}) · TFS ({exportVisitCounts.tfs})
              </p>
            </div>
          </div>
          <DrawerFooter className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <Button
              disabled={statusFilteredMonthEntries.length === 0}
              onClick={() => {
                handleExportExcel()
                setIsExportPreviewOpen(false)
              }}
              className="w-full"
            >
              <Download className="h-4 w-4" />
              Export Excel
            </Button>
            <DrawerClose asChild>
              <Button variant="secondary">Cancel</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
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
  const [locationSearch, setLocationSearch] = useState("")
  const [locationCategoryFilter, setLocationCategoryFilter] = useState("All")

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

  const locationCategories = ["All", ...Array.from(new Set(locations.map((location) => location.category).filter(Boolean))).sort()]
  const filteredLocations = locations.filter((location) => {
    const search = locationSearch.trim().toLowerCase()
    const matchesSearch =
      !search ||
      [location.name, location.address, location.city, location.postcode, location.category]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(search))
    const matchesCategory = locationCategoryFilter === "All" || location.category === locationCategoryFilter
    return matchesSearch && matchesCategory
  })

  const locationOptions = locations.map((l) => ({ value: l.name, label: l.postcode ? `${l.name} - ${l.postcode}` : l.name }))

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
                  { value: "Venue", label: "Venue" },
                  { value: "Event", label: "Event" },
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
          <Card className="overflow-hidden">
            <div className="bg-indigo-900 text-white px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
              <h3 className="font-bold">Saved Locations</h3>
              <span className="text-indigo-200 text-sm bg-indigo-800 px-2 py-1 rounded-full">
                {filteredLocations.length} / {locations.length} locations
              </span>
            </div>
            <div className="sticky top-0 z-10 space-y-3 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 md:bg-slate-50">
              <Input
                label="Search Locations"
                placeholder="Search name, city, postcode..."
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
              />
              <div className="flex gap-2 overflow-x-auto pb-1">
                {locationCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setLocationCategoryFilter(category)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      locationCategoryFilter === category
                        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 bg-slate-50 p-3 md:max-h-[500px] md:overflow-y-auto">
              {filteredLocations.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="mx-auto flex max-w-xs flex-col items-center gap-3">
                    <div className="rounded-full bg-indigo-50 p-3">
                      <MapPin className="h-5 w-5 text-indigo-500" />
                    </div>
                    <p className="font-semibold text-slate-700">{locations.length === 0 ? "No locations yet" : "No matching locations"}</p>
                    <p className="text-sm text-slate-500">
                      {locations.length === 0
                        ? "Add Home, Office, and client locations to speed up trip logging."
                        : "Try another search or category filter."}
                    </p>
                    <Button variant="secondary" onClick={() => setMobileTab("add-location")}>
                      Add Location
                    </Button>
                  </div>
                </div>
              ) : (
                filteredLocations.map((loc) => (
                  <div
                    key={loc.id}
                    className="group flex items-start justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-100 hover:bg-indigo-50/30"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div
                        className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${loc.category === "Personal" ? "bg-emerald-50 text-emerald-600" : loc.category === "Office" ? "bg-blue-50 text-blue-600" : "bg-indigo-50 text-indigo-600"}`}
                      >
                        <MapPin className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-black text-slate-800 break-words">{loc.name}</h4>
                        <p className="mt-0.5 text-sm text-slate-500 break-words">{[loc.address, loc.city].filter(Boolean).join(", ")}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="inline-block rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                            {loc.postcode || "No postcode"}
                          </span>
                          <span className="inline-block rounded-full border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            {loc.category}
                          </span>
                        </div>
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
