import { Link } from 'react-router'
import { apiUrl } from '../api'

const TYPES: [string, string][] = [
  ['String', 'Text, as a JSON string.'],
  ['Int64', 'A whole number, as a JSON number or a string of digits.'],
  ['Decimal', 'An exact number, best sent as a string to keep its digits. Give precision (1 to 38) and scale; without them it holds 38 digits, 10 after the point.'],
  ['Float64', 'A number, as a JSON number.'],
  ['Boolean', 'true or false.'],
  ['Date', 'A date, such as "2026-11-15".'],
  ['Timestamp', 'A moment with its offset, such as "2026-11-15T14:30:00Z" or "2026-11-15T09:30:00-05:00".'],
  ['DateTime', 'A date and time with no offset, such as "2026-11-15T14:30:00".'],
  ['Time', 'A time of day, such as "14:30:00".'],
  ['Json', 'Any JSON value, kept as JSON.'],
  ['Binary', 'Bytes, as base64 text.'],
]

const STATUSES: [string, string][] = [
  ['400', 'The request does not fit: a bad name, column, type, or row. Nothing in the batch was written.'],
  ['401', 'No key, or a key Scry did not make or has revoked.'],
  ['403', 'The source exists, but this key did not make it.'],
  ['404', 'There is no source of that name. Make it first.'],
  ['409', 'The change takes a replacement: a column changed type or went, or the key changed.'],
  ['413', 'The batch is over 10 MB.'],
]

/** One HTTP request as text: its method and address, its headers, and any JSON body. */
function Request({ method, path, body }: { method: string; path: string; body?: string }) {
  const lines = [`${method} ${apiUrl}${path}`, 'Authorization: Bearer <your key>']
  if (body) lines.push('Content-Type: application/json', '', body)
  return (
    <pre>
      <code>{lines.join('\n')}</code>
    </pre>
  )
}

/** The push API's reference: keys, routes, column types, and answers. */
export function PushApiDocsPage() {
  return (
    <div className="page docs">
      <p>
        <Link to="/docs">Docs</Link>
      </p>
      <h1>Push API</h1>
      <p>
        The push API lets a script or another service send rows to Scry. Each source it makes is a table of its own, which
        charts read like any other source.
      </p>

      <h2>Keys</h2>
      <p>
        Make a key on the <Link to="/settings">Settings</Link> page and send it with every request as{' '}
        <code>Authorization: Bearer &lt;your key&gt;</code>. Scry shows a key once, when it is made. A key writes only to
        the sources it made. Revoking it keeps those sources, and no key writes to them again.
      </p>

      <h2>Make a source</h2>
      <Request
        method="PUT"
        path="/ingest/sources/orders"
        body={`{
  "columns": [
    { "name": "id", "type": "Int64" },
    { "name": "amount", "type": "Decimal", "precision": 10, "scale": 2 },
    { "name": "day", "type": "Date" }
  ],
  "primaryKey": ["id"]
}`}
      />
      <p>
        A source's name starts with a lowercase letter and holds lowercase letters, digits, and underscores, 63 at most.
        Rows list their values in the order of <code>columns</code>. The <code>primaryKey</code> is optional; merges match
        on it. Sending this again with more columns adds them. Changing a column's type, removing a column, or changing
        the key takes a replacement.
      </p>

      <h2>Send rows</h2>
      <Request
        method="POST"
        path="/ingest/sources/orders/batches"
        body={`{
  "id": "2026-11-15-1",
  "mode": "merge",
  "rows": [
    [1, "10.00", "2026-11-14"],
    [2, "5.25", "2026-11-15"]
  ]
}`}
      />
      <ul>
        <li>
          <code>mode</code> is <code>append</code>, the default, or <code>merge</code>, which replaces rows whose key
          matches. When a batch holds a key twice, its last row wins.
        </li>
        <li>
          <code>id</code> is optional, up to 100 characters. A batch whose id was already written is skipped, so a batch
          can be sent again safely after a failure.
        </li>
        <li>A batch holds up to 10,000 rows and 10 MB. It is written whole or not at all.</li>
        <li>
          The answer is <code>{'{"rowCount": 2, "skipped": false}'}</code>: the source's rows after the batch.
        </li>
      </ul>

      <h2>Replace a source</h2>
      <Request
        method="POST"
        path="/ingest/sources/orders/replace"
        body={`{
  "columns": [
    { "name": "id", "type": "String" },
    { "name": "region", "type": "String" }
  ],
  "primaryKey": ["id"]
}`}
      />
      <Request method="POST" path="/ingest/sources/orders/commit" />
      <p>
        After <code>replace</code>, batches go to a new table while charts keep reading the old one. <code>commit</code>{' '}
        swaps the new table in. The body of <code>replace</code> is optional; without it, the new table takes the
        source's own columns. Sending <code>replace</code> again starts over. Without a replacement under way,{' '}
        <code>commit</code> answers the source's row count.
      </p>

      <h2>Column types</h2>
      <div className="docs-table">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Sent as</th>
            </tr>
          </thead>
          <tbody>
            {TYPES.map(([type, sent]) => (
              <tr key={type}>
                <th>
                  <code>{type}</code>
                </th>
                <td>{sent}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>Any value may be null, except in a key column.</p>

      <h2>Answers</h2>
      <p>
        A refused request answers with a status and a JSON body whose <code>detail</code> says why, in words safe to
        show.
      </p>
      <div className="docs-table">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Means</th>
            </tr>
          </thead>
          <tbody>
            {STATUSES.map(([status, means]) => (
              <tr key={status}>
                <th>{status}</th>
                <td>{means}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
