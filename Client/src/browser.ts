/** Leaves Scry for another site, such as a sign-in page that returns to Scry when it is done. */
export function leaveFor(url: string) {
  window.location.assign(url)
}
