// Red, green, white, blue, and plum, left to right in the color wheel's order.
const LASHES = [
  { d: 'M2.6 9l2.1 1.1', color: '#e2483d' },
  { d: 'M5.7 4.7l1.5 2', color: '#33a35f' },
  { d: 'M12 2.6v2.6', color: '#f5eed6' },
  { d: 'M18.3 4.7l-1.5 2', color: '#3a86d6' },
  { d: 'M21.4 9l-2.1 1.1', color: '#82378a' },
]

/**
 * Scry's mark, a radiant eye with a star for its pupil: a gray eye under five colored lashes, on Nexus's dark tile so
 * its colors hold in either theme.
 */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="5" fill="#1a1f3d" />
      {/* The eye spans the whole 24-unit box, so it is drawn at 0.8 size to leave the tile a margin. */}
      <g transform="translate(12 12.5) scale(0.8) translate(-12 -11.5)">
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M2.5 14.5c2.6-3.9 5.8-5.9 9.5-5.9s6.9 2 9.5 5.9c-2.6 3.9-5.8 5.9-9.5 5.9s-6.9-2-9.5-5.9z"
            stroke="#8b919c"
            strokeWidth="1.6"
          />
          {LASHES.map((lash) => (
            <path key={lash.d} d={lash.d} stroke={lash.color} strokeWidth="2.2" />
          ))}
        </g>
        <path d="M12 11.3l.95 2.25 2.25.95-2.25.95-.95 2.25-.95-2.25-2.25-.95 2.25-.95z" fill="#8b919c" />
      </g>
    </svg>
  )
}
