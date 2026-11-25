import { Screen } from '@/components/Screen';

const STEPS = [
  ['1', 'El proveedor envía la factura', 'El cliente la revisa y la confirma.'],
  ['2', 'El cliente ofrece pagar hoy', 'Elige el descuento y reserva el monto neto en la red.'],
  ['3', 'El proveedor cobra o espera', 'Cobra en la misma operación en que acepta.'],
  ['4', 'Si vence, se recupera', 'El cliente recupera su reserva.'],
];

/** How the flow and the numbers work, with one worked example. */
export function HowItWorks() {
  return (
    <Screen title="Cómo funciona">
      <ol className="flex flex-col gap-3">
        {STEPS.map(([n, title, text]) => (
          <li key={n} className="flex gap-3 rounded-card border-2 border-ink bg-card p-4">
            <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-card">
              {n}
            </span>
            <span>
              <span className="block font-bold">{title}</span>
              <span className="text-[15px] text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <section className="flex flex-col gap-2 rounded-card border-2 border-ink bg-card p-4">
        <h2 className="font-bold">Ejemplo</h2>
        <p className="tabular text-[15px]">
          Factura de 1 000,00 USDC con 1,5 % de descuento: el cliente paga 985,00 y ahorra 15,00.
        </p>
        <p className="text-sm text-muted">
          Equivalente anual, solo como referencia: (15 ÷ 985) × (365 ÷ 30 días) ≈ 18,5 %.
        </p>
      </section>
      <p className="text-sm text-muted">Todo ocurre en Testnet: no se usa dinero real.</p>
    </Screen>
  );
}
