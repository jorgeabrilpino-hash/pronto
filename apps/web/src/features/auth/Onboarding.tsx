import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { Plain } from '@/components/Screen';
import { markOnboarded } from './signIn';

const SLIDES = [
  {
    label: '1 de 3 · Qué es Pronto',
    title: 'Tu cliente te paga antes, con un descuento claro.',
    text: 'Pronto conecta a quien emite una factura con quien la va a pagar. Sin intermediarios ni tasas escondidas.',
  },
  {
    label: '2 de 3 · Cómo ganas o ahorras',
    title: 'El comprador propone el descuento. El proveedor decide.',
    text: 'El comprador ofrece pagar hoy con 1 %, 1,5 % o 2 % de descuento. El proveedor cobra o espera. Siempre ves el monto exacto.',
  },
  {
    label: '3 de 3 · Qué pasa con tu dinero',
    title: 'El dinero queda reservado hasta que se cobra.',
    text: 'El comprador reserva el monto en un contrato. El proveedor cobra en la misma operación en que acepta. Si vence, el comprador lo recupera.',
  },
];

/** Three skippable slides, shown once after the first sign-in. */
export function Onboarding() {
  const [i, setI] = useState(0);
  const navigate = useNavigate();
  const slide = SLIDES[i] ?? SLIDES[0];
  const last = i === SLIDES.length - 1;

  function done() {
    markOnboarded();
    navigate('/fondos', { replace: true });
  }

  return (
    <Plain
      footer={
        <>
          <Button onClick={() => (last ? done() : setI(i + 1))}>
            {last ? 'Empezar' : 'Siguiente'}
          </Button>
          {last ? null : (
            <Button variant="secondary" onClick={done}>
              Saltar
            </Button>
          )}
        </>
      }
    >
      <p className="label text-muted">{slide?.label}</p>
      <h1 className="display text-[48px] sm:text-[60px]">{slide?.title}</h1>
      <p className="max-w-[44ch] text-lg">{slide?.text}</p>
      <div className="mt-2 flex gap-2" aria-hidden="true">
        {SLIDES.map((s, n) => (
          <span
            key={s.label}
            className={`h-2 flex-1 border-2 border-ink ${n <= i ? 'bg-ink' : 'hatch-light'}`}
          />
        ))}
      </div>
    </Plain>
  );
}
