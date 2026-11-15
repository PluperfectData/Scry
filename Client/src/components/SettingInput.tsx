import type { SettingField } from '../api'

/** One of a connector's settings, as the control its kind calls for. */
export function SettingInput({ field, value, onChange }: { field: SettingField; value: string; onChange: (value: string) => void }) {
  switch (field.kind) {
    case 'Boolean':
      return (
        <label className="check">
          <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(e.target.checked ? 'true' : '')} />
          {field.label}
        </label>
      )
    case 'Choice':
      return (
        <label>
          {field.label}
          <select value={value} onChange={(e) => onChange(e.target.value)} required={field.required}>
            {!field.required && <option value="">Default</option>}
            {(field.choices ?? []).map((choice) => (
              <option key={choice}>{choice}</option>
            ))}
          </select>
        </label>
      )
    default:
      return (
        <label>
          {field.label}
          <input
            type={field.kind === 'Secret' ? 'password' : field.kind === 'Number' ? 'number' : 'text'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            autoComplete={field.kind === 'Secret' ? 'new-password' : 'off'}
          />
        </label>
      )
  }
}
