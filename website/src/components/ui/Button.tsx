import { cn } from "@/lib/utils"
import Link from "next/link"

interface ButtonProps {
  children: React.ReactNode
  variant?: "primary" | "outline" | "ghost"
  size?: "sm" | "md" | "lg"
  href?: string
  onClick?: () => void
  className?: string
  type?: "button" | "submit" | "reset"
  disabled?: boolean
  external?: boolean
  "aria-label"?: string
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  href,
  onClick,
  className,
  type = "button",
  disabled,
  external,
  "aria-label": ariaLabel,
}: ButtonProps) {
  const classes = cn(
    "button",
    `button-${variant}`,
    `button-${size}`,
    disabled && "is-disabled",
    className
  )

  if (href) {
    if (external) {
      return (
        <a href={href} className={classes} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel}>
          {children}
        </a>
      )
    }
    return <Link href={href} className={classes} aria-label={ariaLabel}>{children}</Link>
  }

  return (
    <button type={type} onClick={onClick} className={classes} disabled={disabled} aria-label={ariaLabel}>
      {children}
    </button>
  )
}
