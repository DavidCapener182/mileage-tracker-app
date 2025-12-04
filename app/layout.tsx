import type React from "react"
import type { Metadata } from "next"
import { Montserrat } from "next/font/google"
import "./globals.css"

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
})

export const metadata: Metadata = {
  title: "Mileage Tracker Pro",
  description: "Track your business mileage and expenses",
  generator: "v0.app",
  icons: {
    icon: [
      {
        media: "(prefers-color-scheme: light)",
        url: "/icons/light.svg",
      },
      {
        media: "(prefers-color-scheme: dark)",
        url: "/icons/dark.svg",
      },
    ],
  },
}

// <CHANGE> Added viewport configuration for iOS safe areas
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover", // This enables safe area insets on iOS
  themeColor: "#312e81", // Indigo-900 to match header
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${montserrat.variable} font-sans`}>{children}</body>
    </html>
  )
}
