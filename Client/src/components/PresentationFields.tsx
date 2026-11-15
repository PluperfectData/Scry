import { MAX_SECONDS, PACES, WRAPS, type Pace, type Wrap } from '../presentation'
import { Help } from './Help'

/** How scrolling wraps at the end of the data and how fast it goes, with each preset's seconds a screenful shown. */
export function PresentationFields({
  value,
  onChange,
}: {
  value: { wrap: Wrap; pace: Pace; seconds: number }
  onChange: (next: { wrap: Wrap; pace: Pace; seconds: number }) => void
}) {
  return (
    <>
      <label>
        At the end
        <select value={value.wrap} onChange={(e) => onChange({ ...value, wrap: e.target.value as Wrap })}>
          {(Object.keys(WRAPS) as Wrap[]).map((wrap) => (
            <option key={wrap} value={wrap}>
              {WRAPS[wrap]}
            </option>
          ))}
        </select>
      </label>
      <span className="field-label">
        <label>
          Speed
          <select value={value.pace} onChange={(e) => onChange({ ...value, pace: e.target.value as Pace })}>
            <option value="slow">Slow, {PACES.slow} s a screenful</option>
            <option value="medium">Medium, {PACES.medium} s a screenful</option>
            <option value="fast">Fast, {PACES.fast} s a screenful</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <Help term="Speed">
          How long each screenful of rows, or each window of the x axis, stays in view as it scrolls past.
        </Help>
      </span>
      {value.pace === 'custom' && (
        <label>
          Seconds a screenful
          <input
            type="number"
            min={1}
            max={MAX_SECONDS}
            step={1}
            required
            value={Number.isNaN(value.seconds) ? '' : value.seconds}
            onChange={(e) => onChange({ ...value, seconds: e.target.valueAsNumber })}
          />
        </label>
      )}
    </>
  )
}
