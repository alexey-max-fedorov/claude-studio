import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Claude Studio — Visual AI Coding for Next.js",
  description:
    "Select elements on your page, describe changes in plain English, and Claude Code makes it happen in your source code.",
  icons: {
    icon: "/icon.png",
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
  openGraph: {
    title: "Claude Studio",
    description: "Visual AI coding assistant for Next.js",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Claude Studio",
    description: "Visual AI coding assistant for Next.js",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
