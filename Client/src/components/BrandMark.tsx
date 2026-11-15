/** Scry's mark, a radiant eye with a star for its pupil, drawn in the current text color. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 14.5c2.6-3.9 5.8-5.9 9.5-5.9s6.9 2 9.5 5.9c-2.6 3.9-5.8 5.9-9.5 5.9s-6.9-2-9.5-5.9z" />
        <path d="M12 2.6v2.6M5.7 4.7l1.5 2M18.3 4.7l-1.5 2M2.6 9l2.1 1.1M21.4 9l-2.1 1.1" />
      </g>
      <path d="M12 11.3l.95 2.25 2.25.95-2.25.95-.95 2.25-.95-2.25-2.25-.95 2.25-.95z" fill="currentColor" />
    </svg>
  )
}
