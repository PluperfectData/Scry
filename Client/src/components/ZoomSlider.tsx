import { Tooltip } from './Tooltip'

export const MAX_ZOOM = 8

// The slider moves along powers of two, so every step zooms by the same factor: four steps double the zoom.
const STEPS_PER_DOUBLING = 4
const MAX_STEP = Math.log2(MAX_ZOOM) * STEPS_PER_DOUBLING
const BUTTON_STEPS = 2

/** A vertical zoom control, from 1× at the bottom to 8× at the top, with + and − buttons at its ends. */
export function ZoomSlider({ zoom, onZoom }: { zoom: number; onZoom: (zoom: number) => void }) {
  const step = Math.round(Math.log2(zoom) * STEPS_PER_DOUBLING)
  const to = (next: number) => onZoom(2 ** (Math.min(Math.max(next, 0), MAX_STEP) / STEPS_PER_DOUBLING))

  return (
    <div className="zoom">
      <Tooltip label="Zoom in">
        <button type="button" className="zoom-step" onClick={() => to(step + BUTTON_STEPS)} disabled={step >= MAX_STEP}>
          <span className="sr-only">Zoom in</span>
          <span aria-hidden="true">+</span>
        </button>
      </Tooltip>
      <input
        type="range"
        className="zoom-range"
        min={0}
        max={MAX_STEP}
        step={1}
        value={step}
        onChange={(e) => to(Number(e.target.value))}
        aria-label="Zoom"
        aria-valuetext={`${zoom.toFixed(1)} times`}
      />
      <Tooltip label="Zoom out">
        <button type="button" className="zoom-step" onClick={() => to(step - BUTTON_STEPS)} disabled={step <= 0}>
          <span className="sr-only">Zoom out</span>
          <span aria-hidden="true">−</span>
        </button>
      </Tooltip>
    </div>
  )
}
