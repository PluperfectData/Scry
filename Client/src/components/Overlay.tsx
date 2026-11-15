import { type ReactNode, useEffect, useId, useRef } from 'react'
import { Tooltip } from './Tooltip'

export interface OverlayProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * A modal dialog over the page, placed by `className`. Escape, the close button, or a click beside the panel closes
 * it. Its contents mount each time it opens, so a form inside starts fresh.
 */
export function Overlay({ open, title, onClose, children, className }: OverlayProps & { className: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const pressedOutside = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const node = dialog.current!
    if (open && !node.open) node.showModal()
    else if (!open && node.open) node.close()
  }, [open])

  return (
    <dialog
      ref={dialog}
      className={`overlay ${className}`}
      aria-labelledby={titleId}
      onClose={onClose}
      // The panel fills the dialog, so only the backdrop reports the dialog itself as the target. A press that starts
      // inside, such as selecting text, must not close it by ending outside.
      onPointerDown={(e) => (pressedOutside.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (pressedOutside.current && e.target === e.currentTarget) onClose()
      }}
    >
      <div className="overlay-panel">
        <header className="overlay-header">
          <h2 id={titleId}>{title}</h2>
          <Tooltip label="Close">
            <button type="button" className="icon-button" onClick={onClose}>
              <span className="sr-only">Close</span>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </Tooltip>
        </header>
        <div className="overlay-body">{open && children}</div>
      </div>
    </dialog>
  )
}
