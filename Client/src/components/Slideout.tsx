import { Overlay, type OverlayProps } from './Overlay'

/** A panel that slides in from the right edge over the page, for a short form. */
export function Slideout(props: OverlayProps) {
  return <Overlay {...props} className="slideout" />
}
