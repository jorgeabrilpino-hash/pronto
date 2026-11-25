import { LinkButton } from '@/components/Button';
import { Screen } from '@/components/Screen';

const STEPS = [
  {
    n: '1',
    title: 'Instala Varial',
    text: 'Es la billetera que guarda tus llaves y firma por ti. En la computadora se instala como extensión del navegador; en el celular, como app.',
    link: { href: 'https://varialwallet.com', label: 'Ir a varialwallet.com' },
  },
  {
    n: '2',
    title: 'Crea tu cuenta y cambia a Testnet',
    text: 'Crea una cuenta nueva, guarda tu frase de recuperación en papel y cambia la red a Testnet. Luego pide fondos de prueba desde la propia billetera.',
    link: null,
  },
];

/** "No tengo billetera": two steps, then back to connecting. */
export function WalletGuide() {
  return (
    <Screen
      title="Sin billetera"
      back="/"
      footer={<LinkButton to="/">Ya tengo mi billetera</LinkButton>}
    >
      <p className="max-w-[48ch] text-lg">
        Una billetera es la app que firma tus operaciones. No guarda dinero en Pronto: tú siempre
        decides qué firmar.
      </p>
      <ol className="flex flex-col gap-4">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-4 rounded-card border-2 border-ink bg-card p-4">
            <span className="display flex size-10 rounded-card shrink-0 items-center justify-center bg-ink text-[20px] text-paper">
              {s.n}
            </span>
            <span className="flex flex-col gap-2">
              <span className="display text-[18px]">{s.title}</span>
              <span className="text-[15px]">{s.text}</span>
              {s.link ? (
                <a
                  href={s.link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="code text-sm underline decoration-2 underline-offset-4"
                >
                  {s.link.label}
                </a>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </Screen>
  );
}
