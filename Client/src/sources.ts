const MAX_NAME_LENGTH = 63

/** A source name the API accepts, made from a file name: `Q3 Orders.csv` becomes `q3_orders`. */
export function nameFrom(fileName: string): string {
  const stem = fileName.replace(/\.[^.]*$/, '').toLowerCase()
  const name = stem.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const lettered = /^[a-z]/.test(name) ? name : `source_${name}`
  return lettered.slice(0, MAX_NAME_LENGTH).replace(/_+$/, '')
}
