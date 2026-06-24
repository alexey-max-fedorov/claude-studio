"use client"

import { motion, AnimatePresence } from "framer-motion"
import Image from "next/image"
import { X, ExternalLink, ArrowRight } from "lucide-react"
import { useEffect } from "react"
import { siteConfig } from "@/data/site"

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
}

export function MobileMenu({ isOpen, onClose }: MobileMenuProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 bg-black flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#1a1a1a]">
            <a
              href="/"
              onClick={onClose}
              className="flex items-center gap-3"
              aria-label="Claude Studio — Home"
            >
              <Image src="/icon.png" alt="" width={28} height={28} className="rounded-md" />
              <div className="flex flex-col leading-none">
                <span
                  className="text-white text-xl font-bold tracking-tight"
                  style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
                >
                  CLAUDE
                </span>
                <span className="text-[#c9a84c] text-[9px] tracking-[0.35em] uppercase font-medium">
                  STUDIO
                </span>
              </div>
            </a>
            <button
              onClick={onClose}
              className="p-2 text-[#a0a0a0] hover:text-white transition-colors rounded-md cursor-pointer"
              aria-label="Close menu"
            >
              <X size={24} />
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 flex flex-col justify-center px-8">
            <ul className="space-y-2" role="list">
              {siteConfig.nav.map((item, i) => (
                <motion.li
                  key={item.href}
                  initial={{ opacity: 0, x: -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.4, delay: i * 0.08, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <a
                    href={item.href}
                    onClick={onClose}
                    {...("external" in item && item.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="block text-4xl font-semibold text-white hover:text-[#c9a84c] transition-colors py-2 inline-flex items-center gap-3"
                    style={{ fontFamily: "var(--font-playfair-display), Georgia, serif" }}
                  >
                    {item.label}
                    {"external" in item && item.external && (
                      <ExternalLink size={20} className="text-[#666]" aria-hidden="true" />
                    )}
                  </a>
                </motion.li>
              ))}
            </ul>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, delay: 0.36 }}
              className="mt-10"
            >
              <a
                href={siteConfig.github}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="inline-flex items-center gap-2 bg-[#c9a84c] text-black font-semibold px-8 py-4 rounded-md text-base hover:bg-[#d4b65e] transition-colors group"
              >
                Get Started
                <ArrowRight
                  size={18}
                  className="group-hover:translate-x-0.5 transition-transform duration-200"
                />
              </a>
            </motion.div>
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
