import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Car, Mail } from "lucide-react"
import Link from "next/link"

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-center gap-2 text-indigo-900">
            <div className="bg-indigo-100 p-2 rounded-lg">
              <Car className="w-6 h-6" />
            </div>
            <span className="text-xl font-bold">Mileage Tracker Pro</span>
          </div>
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-emerald-100 p-3 rounded-full">
                  <Mail className="w-8 h-8 text-emerald-600" />
                </div>
              </div>
              <CardTitle className="text-2xl">Check your email</CardTitle>
              <CardDescription>We've sent you a confirmation link</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
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
