"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, ArrowRight, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { siteConfig } from "@/data/site"
import { MobileMenu } from "./MobileMenu"

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-40 transition-all duration-300",
          scrolled
            ? "bg-black/90 backdrop-blur-md border-b border-[#1a1a1a]"
            : "bg-transparent"
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <Link
              href="/"
              className="flex items-center gap-3 group"
              aria-label="Claude Studio — Home"
            >
              <Image
                src="/icon.png"
                alt=""
                width={28}
                height={28}
                className="rounded-md"
              />
              <div className="flex flex-col leading-none">
                <span
                  className="text-white text-lg lg:text-xl font-bold tracking-tight group-hover:text-[#c9a84c] transition-colors duration-200"
                  style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
                >
                  CLAUDE
                </span>
                <span className="text-[#c9a84c] text-[8px] tracking-[0.35em] uppercase font-medium">
                  STUDIO
                </span>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-8" aria-label="Main navigation">
              {siteConfig.nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  {...("external" in item && item.external
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
                  className="text-sm font-medium tracking-wide transition-colors duration-200 relative group text-[#a0a0a0] hover:text-white inline-flex items-center gap-1.5"
                >
                  {item.label}
                  {"external" in item && item.external && (
                    <ExternalLink size={13} aria-hidden="true" />
                  )}
                  <span className="absolute -bottom-0.5 left-0 h-px bg-[#c9a84c] transition-all duration-300 w-0 group-hover:w-full" />
                </a>
              ))}
            </nav>

            {/* Desktop CTA + Mobile Hamburger */}
            <div className="flex items-center gap-4">
              <a
                href={siteConfig.github}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden lg:inline-flex items-center gap-2 bg-[#c9a84c] text-black font-semibold px-5 py-2.5 rounded-md text-sm hover:bg-[#d4b65e] hover:shadow-[0_0_20px_rgba(201,168,76,0.35)] transition-all duration-200 active:scale-[0.98] group"
              >
                Get Started
                <ArrowRight
                  size={15}
                  className="group-hover:translate-x-0.5 transition-transform duration-200"
                />
              </a>

              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-2 text-[#a0a0a0] hover:text-white transition-colors rounded-md cursor-pointer"
                aria-label="Open navigation menu"
                aria-expanded={mobileOpen}
              >
                <Menu size={22} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <MobileMenu isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  )
}
