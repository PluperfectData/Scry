import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const HOVER_DELAY_MS = 300
const GAP = 6
const EDGE = 8

/**
 * Shows `label` by its one child, a control, while a mouse rests on it or the keyboard focuses it. The label repeats
 * what the control already tells a screen reader, so it is hidden from one. With `pressToggles`, a press shows it,
 * and a tap shows or hides it, since a phone cannot hover.
 */
export function Tooltip({
  label,
  children,
  pressToggles = false,
}: {
  label: string
  children: ReactNode
  pressToggles?: boolean
}) {
  const anchor = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const delay = useRef<number | undefined>(undefined)
  // Where the tooltip renders while shown. Inside a modal dialog it has to be the dialog, which covers the body.
  const [container, setContainer] = useState<Element | null>(null)

  const show = () => setContainer(anchor.current!.closest('dialog') ?? document.body)
  const hide = () => {
    window.clearTimeout(delay.current)
    setContainer(null)
  }

  // Below the control, or above it near the bottom of the window, and never past either side.
  useLayoutEffect(() => {
    const control = anchor.current?.firstElementChild
    if (!container || !control || !tip.current) return
    const box = control.getBoundingClientRect()
    const { width, height } = tip.current.getBoundingClientRect()
    const below = box.bottom + GAP
    const top = below + height + EDGE <= window.innerHeight ? below : box.top - GAP - height
    const left = Math.min(Math.max(box.left + box.width / 2 - width / 2, EDGE), window.innerWidth - width - EDGE)
    tip.current.style.top = `${top}px`
    tip.current.style.left = `${left}px`
  }, [container, label])

  useEffect(() => {
    if (!container) return
    const close = () => setContainer(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    const onPress = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) close()
    }
    // A fixed tooltip would stay behind while its control scrolls away.
    window.addEventListener('scroll', close, { capture: true, passive: true })
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPress)
    return () => {
      window.removeEventListener('scroll', close, { capture: true })
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPress)
    }
  }, [container])

  useEffect(() => () => window.clearTimeout(delay.current), [])

  return (
    <span
      ref={anchor}
      className="tooltip-anchor"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') delay.current = window.setTimeout(show, HOVER_DELAY_MS)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== 'touch') hide()
      }}
      onPointerDown={(event) => {
        if (!pressToggles) hide()
        else if (event.pointerType === 'touch' && container) hide()
        else {
          window.clearTimeout(delay.current)
          show()
        }
      }}
      onFocus={(event) => {
        if (event.target.matches(':focus-visible')) show()
      }}
      onBlur={hide}
    >
      {children}
      {container &&
        createPortal(
          <div ref={tip} className="tooltip" aria-hidden="true">
            {label}
          </div>,
          container,
        )}
    </span>
  )
}
