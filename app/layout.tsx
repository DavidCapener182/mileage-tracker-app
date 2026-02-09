import type React from "react"
import type { Metadata, Viewport } from "next"
import { Montserrat } from "next/font/google"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
})

export const metadata: Metadata = {
  title: "Mileage Tracker Pro",
  description: "Track your business mileage and expenses",
  applicationName: "Mileage Tracker Pro",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Mileage Tracker Pro",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/mileage-tracker-pro-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/mileage-tracker-pro-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/mileage-tracker-pro-icon-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcut: ["/mileage-tracker-pro-icon-192.png"],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#312e81",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${montserrat.variable} font-sans`}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
