const MAX_NAME_LENGTH = 63

/** The largest CSV file a source can be made from, as the API allows: 1 GB. */
export const MAX_UPLOAD_BYTES = 1024 ** 3

/** Why a file is too large to upload, or null when it is not. */
export function tooLarge(file: File): string | null {
  if (file.size <= MAX_UPLOAD_BYTES) return null
  return `${file.name} is ${(file.size / 1024 ** 3).toFixed(1)} GB. A source can be up to 1 GB.`
}

/** A source name the API accepts, made from a file name: `Q3 Orders.csv` becomes `q3_orders`. */
export const nameFrom = (fileName: string): string => sourceName(fileName.replace(/\.[^.]*$/, ''))

/** A source name the API accepts, made from any text, such as a table's: `public.Orders` becomes `public_orders`. */
export function sourceName(text: string): string {
  const name = text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const lettered = /^[a-z]/.test(name) ? name : `source_${name}`
  return lettered.slice(0, MAX_NAME_LENGTH).replace(/_+$/, '')
}
