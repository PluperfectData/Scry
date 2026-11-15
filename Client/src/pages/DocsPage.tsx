import { Link } from 'react-router'

const SECTIONS = [
  {
    to: '/docs/push-api',
    title: 'Push API reference',
    description: 'Send rows to Scry from a script or another service with a key: the routes, column types, modes, and answers.',
  },
]

/** Every section of Scry's docs. */
export function DocsPage() {
  return (
    <div className="page docs">
      <h1>Docs</h1>
      <ul className="list cards">
        {SECTIONS.map((section) => (
          <li key={section.to}>
            <h2>
              <Link to={section.to}>{section.title}</Link>
            </h2>
            <p className="muted">{section.description}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
