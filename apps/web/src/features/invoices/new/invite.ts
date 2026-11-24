/** Invite a company that is not in Pronto yet: a link through whatever channel they like. */
export async function shareInvite(): Promise<void> {
  const url = `${window.location.origin}/`;
  const text =
    'Te invito a Pronto: cobra o paga facturas antes del vencimiento, con descuento claro.';
  if (navigator.share) {
    await navigator.share({ title: 'Pronto', text, url }).catch(() => undefined);
  } else {
    await navigator.clipboard.writeText(`${text} ${url}`).catch(() => undefined);
  }
}
