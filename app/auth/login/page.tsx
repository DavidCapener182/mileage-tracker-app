"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useState } from "react"
import { Loader2 } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log("[v0] Login attempt started", { email })

    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      console.log("[v0] Supabase client created")

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log("[v0] Sign in response:", { data, error })

      if (error) throw error

      console.log("[v0] Login successful, redirecting to /tracker")
      router.push("/tracker")
      router.refresh()
    } catch (error: unknown) {
      console.error("[v0] Login error:", error)
      setError(error instanceof Error ? error.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh w-full items-start justify-center bg-slate-50 px-4 pb-6 pt-safe-or-4 sm:items-center sm:p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="flex items-center justify-center gap-2 text-indigo-900">
            <div className="bg-indigo-100 p-1.5 rounded-lg">
              <Image
                src="/mileage-tracker-pro-icon.png"
                alt="Mileage Tracker Pro"
                width={28}
                height={28}
                priority
                className="h-7 w-7 rounded-md object-cover"
              />
            </div>
            <span className="text-lg sm:text-xl font-bold">Mileage Tracker Pro</span>
          </div>
          <Card className="shadow-sm">
            <CardHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6">
              <CardTitle className="text-xl sm:text-2xl">Welcome back</CardTitle>
              <CardDescription>Sign in to access your mileage tracker</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6">
              <form onSubmit={handleLogin}>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  {error && <p className="text-sm text-red-500">{error}</p>}
                  <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </Button>
                </div>
                <div className="mt-4 text-center text-sm text-slate-600">
                  Don't have an account?{" "}
                  <Link href="/auth/sign-up" className="text-indigo-600 hover:underline">
                    Sign up
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
