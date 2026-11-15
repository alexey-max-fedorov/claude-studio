"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Menu, ArrowDown, ArrowUpRight } from "lucide-react"
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
      <header className={cn("site-header", scrolled && "is-scrolled")}>
        <div className="page-width header-inner">
          <Link href="/" className="brand-link" aria-label="Metatron home">
            <Image src="/icon.png" alt="" width={38} height={38} priority />
            <span>Metatron</span>
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            {siteConfig.nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                {...("external" in item && item.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {item.label}
                {"external" in item && item.external && <ArrowUpRight size={13} aria-hidden="true" />}
              </a>
            ))}
          </nav>
          <a href="#how-it-works" className="button button-primary header-install">
            Install <ArrowDown size={14} aria-hidden="true" />
          </a>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="menu-toggle"
            aria-label="Open Metatron navigation"
            aria-expanded={mobileOpen}
            aria-controls={mobileOpen ? "mobile-navigation" : undefined}
          >
            <Menu size={24} aria-hidden="true" />
          </button>
        </div>
      </header>
      <MobileMenu isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  )
}
