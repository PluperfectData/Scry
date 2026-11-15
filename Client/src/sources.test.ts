import { MAX_UPLOAD_BYTES, nameFrom, sourceName, tooLarge } from './sources'

it("names a database table's source by its whole name, schema and all", () => {
  expect(sourceName('public.Orders')).toBe('public_orders')
  expect(sourceName('orders')).toBe('orders')
})

const sized = (bytes: number) => Object.defineProperty(new File([''], 'customers.csv'), 'size', { value: bytes })

it('takes a file up to 1 GB, and says why it refuses a larger one', () => {
  expect(tooLarge(sized(MAX_UPLOAD_BYTES))).toBeNull()
  expect(tooLarge(sized(1.25 * 1024 ** 3))).toBe('customers.csv is 1.3 GB. A source can be up to 1 GB.')
})

it.each([
  ['Q3 Orders.csv', 'q3_orders'],
  ['sales-2026.final.csv', 'sales_2026_final'],
  ['2026 budget.csv', 'source_2026_budget'],
  ['___.csv', 'source'],
])('turns %s into %s', (fileName, name) => {
  expect(nameFrom(fileName)).toBe(name)
})

it('stays within 63 characters', () => {
  expect(nameFrom(`${'a'.repeat(80)}.csv`)).toHaveLength(63)
})
