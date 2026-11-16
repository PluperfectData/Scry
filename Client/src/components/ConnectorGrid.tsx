import type { Connector } from '../api'
import { ConnectorIcon } from './ConnectorIcon'

/** Every connector a source can come from, as tiles to pick one from. A connector not ready yet says why, and cannot be picked. */
export function ConnectorGrid({ connectors, onPick }: { connectors: Connector[]; onPick: (connector: Connector) => void }) {
  return (
    <ul className="connector-grid">
      {connectors.map((connector) => (
        <li key={connector.id}>
          <button type="button" className="connector-tile" onClick={() => onPick(connector)} disabled={!!connector.notReady}>
            <ConnectorIcon id={connector.id} />
            <span className="connector-name">{connector.name}</span>
            <span className="connector-description">{connector.description}</span>
            {connector.notReady && <span className="connector-note">{connector.notReady}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}
