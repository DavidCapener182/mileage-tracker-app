import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // Invalid/expired session (e.g. refresh token not found) → send to login
  if (error || !user) {
    redirect("/auth/login")
  }
  redirect("/tracker")
}
