import { nameFrom } from './sources'

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
