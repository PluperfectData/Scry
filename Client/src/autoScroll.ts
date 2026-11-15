import { type RefObject, useEffect, useRef } from 'react'
import type { ScrollPlan } from './presentation'

/** How far a looping list scrolls before its copy of the first rows sits where they began, or null without one. */
export function seamOf(wrap: HTMLElement | null, seam: HTMLElement | null): number | null {
  if (!wrap || !seam) return null
  return seam.offsetTop - (wrap.querySelector('thead')?.offsetHeight ?? 0)
}

/** How long scrolling rests at an end before it jumps back or turns around. */
export const REST_MS = 2000

/**
 * Scrolls an element through its content on its own, a screenful every `plan.seconds`, along `axis`. At the end it
 * jumps back to the start or turns around. Looping, it needs a `seam`: the distance at which a copy of the content's
 * start begins, which it scrolls past and then drops back by, unseen; without one yet, it jumps back. While `waiting`,
 * as more rows load, it holds at the end.
 */
export function useAutoScroll(
  ref: RefObject<HTMLElement | null>,
  plan: ScrollPlan | null,
  axis: 'x' | 'y',
  { seam, waiting = false }: { seam?: () => number | null; waiting?: boolean } = {},
) {
  const live = useRef({ seam, waiting })
  useEffect(() => {
    live.current = { seam, waiting }
  }, [seam, waiting])

  useEffect(() => {
    const element = ref.current
    if (!plan || !element) return
    const get = () => (axis === 'y' ? element.scrollTop : element.scrollLeft)
    const set = (position: number) => {
      if (axis === 'y') element.scrollTop = position
      else element.scrollLeft = position
    }

    let frame = 0
    let last: number | null = null
    let direction = 1
    let restUntil = 0
    let jumpBack = false
    // Browsers keep whole pixels of scroll, so fractions carry until they add up to one.
    let carry = 0

    const step = (now: number) => {
      const elapsed = last === null ? 0 : now - last
      last = now
      const size = axis === 'y' ? element.clientHeight : element.clientWidth
      const extent = (axis === 'y' ? element.scrollHeight : element.scrollWidth) - size

      if (jumpBack && now >= restUntil) {
        set(0)
        jumpBack = false
        restUntil = now + REST_MS
      } else if (extent > 0 && now >= restUntil) {
        carry += (size / plan.seconds) * (elapsed / 1000) * direction
        const whole = Math.trunc(carry)
        if (whole !== 0) {
          carry -= whole
          const seamAt = plan.wrap === 'loop' ? (live.current.seam?.() ?? null) : null
          let position = get() + whole
          if (seamAt !== null && position >= seamAt) {
            position -= seamAt
          } else if (position >= extent) {
            position = extent
            carry = 0
            if (!live.current.waiting) {
              if (plan.wrap === 'reverse') direction = -1
              else jumpBack = true
              restUntil = now + REST_MS
            }
          } else if (position <= 0 && direction < 0) {
            position = 0
            carry = 0
            direction = 1
            restUntil = now + REST_MS
          }
          set(position)
        }
      }
      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [ref, plan, axis])
}
