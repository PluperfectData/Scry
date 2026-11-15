import { useId } from 'react'
import { Tooltip } from './Tooltip'

/** A question mark beside a term, explaining it in plain words on hover, focus, or a tap. */
export function Help({ term, children }: { term: string; children: string }) {
  const description = useId()

  return (
    <>
      <Tooltip label={children} pressToggles>
        <button type="button" className="help" aria-label={`About ${term}`} aria-describedby={description}>
          <span aria-hidden="true">?</span>
        </button>
      </Tooltip>
      <span id={description} hidden>
        {children}
      </span>
    </>
  )
}
