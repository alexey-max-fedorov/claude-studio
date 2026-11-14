import React, { useEffect, useId, useMemo, useRef, useState } from "react"
import type { Attachment } from "@claude-studio/protocol"
import { attachmentLabel } from "../lib/format"
import { Icon } from "./Icons"

export function screenshotSource(a: Attachment): string | undefined {
  return a.type === "screenshot" && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(a.dataUrl) ? a.dataUrl : undefined
}

function details(a: Attachment): string {
  switch (a.type) {
    case "selection":
    case "page_text":
      return a.text
    case "element":
      return JSON.stringify(a.element, null, 2)
    default:
      return `${a.title}\n${a.url}`
  }
}

interface Props {
  attachment: Attachment
  onClose: () => void
  onRemove: () => void
  fallbackFocus?: HTMLElement | null
}

export function AttachmentPreview({ attachment, onClose, onRemove, fallbackFocus }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const image = useMemo(() => screenshotSource(attachment), [attachment])
  const [fullSize, setFullSize] = useState(false)
  useEffect(() => setFullSize(false), [attachment])

  useEffect(() => {
    const el = dialog.current!
    const previous = document.activeElement
    el.showModal()
    close.current?.focus()
    return () => {
      el.close()
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
      else fallbackFocus?.focus()
    }
  }, [fallbackFocus])

  return (
    <dialog
      ref={dialog}
      className="attachment-preview"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation() }}>
      <div className="attachment-preview-head">
        <h2 id={titleId}>{attachment.type === "screenshot" ? "Review screenshot" : "Review attachment"}</h2>
        <button ref={close} type="button" className="icon-btn" aria-label="Close preview" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <p id={descriptionId} className="attachment-preview-hint">Captures can include sensitive information. Review this content before sending your message, or remove the attachment.</p>
      <div className="attachment-preview-source">
        <strong>{attachment.title || attachmentLabel(attachment)}</strong>
        <div>{attachment.url}</div>
      </div>
      {image ? <button type="button" className="btn btn-quiet attachment-preview-zoom" onClick={() => setFullSize((value) => !value)}>{fullSize ? "Fit image" : "Original size"}</button> : null}
      <div className={`attachment-preview-body${fullSize ? " is-full-size" : ""}`}>
        {image ? <img src={image} alt={`Screenshot of ${attachment.title || attachment.url}`} /> :
          attachment.type === "screenshot" ? <p role="alert">This screenshot cannot be previewed. Remove it and capture it again.</p> :
          <pre>{details(attachment)}</pre>}
      </div>
      <div className="attachment-preview-actions">
        <button type="button" className="btn" onClick={onRemove}>Remove attachment</button>
        <button type="button" className="btn btn-primary" onClick={onClose}>Keep attachment</button>
      </div>
    </dialog>
  )
}
