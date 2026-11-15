"use client"

import Image from "next/image"
import { X, ArrowUpRight, ArrowDown } from "lucide-react"
import { useEffect, useRef } from "react"
import { siteConfig } from "@/data/site"

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const menu = menuRef.current
    const focusable = menu?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")
    const closeButton = menu?.querySelector<HTMLElement>("button")
    closeButton?.focus()

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (event.key !== "Tab" || !focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    const desktop = window.matchMedia("(min-width: 1024px)")
    const handleResize = () => { if (desktop.matches) onClose() }
    window.addEventListener("keydown", handleKey)
    desktop.addEventListener("change", handleResize)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKey)
      desktop.removeEventListener("change", handleResize)
      previousFocus?.focus({ preventScroll: true })
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      ref={menuRef}
      id="mobile-navigation"
      className="mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Metatron navigation"
    >
      <div className="page-width mobile-menu-header">
        <a href="/" onClick={onClose} className="brand-link" aria-label="Metatron home">
          <Image src="/icon.png" alt="" width={38} height={38} />
          <span>Metatron</span>
        </a>
        <button type="button" onClick={onClose} className="menu-toggle" aria-label="Close Metatron navigation">
          <X size={24} aria-hidden="true" />
        </button>
      </div>
      <nav className="page-width mobile-menu-nav" aria-label="Mobile navigation">
        <ul>
          {siteConfig.nav.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                onClick={onClose}
                {...("external" in item && item.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {item.label}
                {"external" in item && item.external && <ArrowUpRight size={22} aria-hidden="true" />}
              </a>
            </li>
          ))}
        </ul>
        <a href="#how-it-works" onClick={onClose} className="button button-primary">
          Install Metatron <ArrowDown size={16} aria-hidden="true" />
        </a>
      </nav>
    </div>
  )
}
