import { render, screen } from '@testing-library/react'
import { DocsPage } from './DocsPage'

jest.mock('react-router', () => jest.requireActual('../../jest/router').reactRouterMock())

it('lists each section of the docs, the push API reference among them', () => {
  render(<DocsPage />)

  expect(screen.getByRole('link', { name: 'Push API reference' })).toHaveAttribute('href', '/docs/push-api')
})
