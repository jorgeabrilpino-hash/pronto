import type { Profile } from '@pronto/shared';

const OPTIONS: Array<{ value: Profile; title: string; text: string }> = [
  { value: 'supplier', title: 'Vendo a crédito', text: 'Proveedor: envío facturas y cobro antes.' },
  {
    value: 'buyer',
    title: 'Compro y puedo pagar antes',
    text: 'Comprador: pago hoy y ahorro con el descuento.',
  },
  { value: 'both', title: 'Las dos cosas', text: 'Vendo y también compro.' },
];

/** Three big cards. The app adapts to this choice; it can be changed later in Perfil. */
export function ProfileCards({
  value,
  onChange,
  disabled = false,
  error,
}: {
  value: Profile | null;
  onChange: (v: Profile) => void;
  disabled?: boolean;
  error?: string | undefined;
}) {
  return (
    <fieldset className="flex flex-col gap-3 border-0 p-0" disabled={disabled}>
      <legend className="label mb-2 text-muted">¿Cómo usas Pronto?</legend>
      {OPTIONS.map((o) => {
        const on = value === o.value;
        return (
          <label
            key={o.value}
            className={`hard flex min-h-16 cursor-pointer flex-col justify-center rounded-card border-2 border-ink px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal ${
              on ? 'bg-ink text-card' : 'bg-card'
            }`}
          >
            <input
              type="radio"
              name="profile"
              value={o.value}
              checked={on}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="font-bold">{o.title}</span>
            <span className={`text-sm ${on ? 'text-card/80' : 'text-muted'}`}>{o.text}</span>
          </label>
        );
      })}
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
    </fieldset>
  );
}
