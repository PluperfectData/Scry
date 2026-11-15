import { Overlay, type OverlayProps } from './Overlay'

/** A window centered over the page, for looking at something wider than a form, such as a table of rows. */
export function Modal(props: OverlayProps) {
  return <Overlay {...props} className="modal" />
}
