import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Mail } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export default function SignUpSuccessPage() {
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
            <CardHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-emerald-100 p-3 rounded-full">
                  <Mail className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
              <CardTitle className="text-xl sm:text-2xl">Check your email</CardTitle>
              <CardDescription>We've sent you a confirmation link</CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 sm:px-6 sm:pb-6 text-center">
              <p className="text-sm text-slate-600 mb-4">
                Please check your email and click the confirmation link to activate your account.
              </p>
              <Link href="/auth/login" className="text-sm text-indigo-600 hover:underline">
                Back to sign in
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
