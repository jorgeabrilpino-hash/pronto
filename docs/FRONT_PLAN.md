# Pronto — Plan del front (brief para la sesión del front)

> 23 nov 2026. Un agente que lea solo este archivo, `CLAUDE.md` y los documentos que cita debe poder trabajar sin preguntar. Cambia solo `apps/web/**`.

## 1. Qué se construye

La app móvil de Pronto (una sola app con las pestañas **Por cobrar** y **Por pagar**) según `docs/FLUJO_V2.md`.

- **Must:** vistas 1 a 10 y 15. **Should:** 11, 12, 13 y 16. **Could:** 14 (Excel).
- Español neutro, poco texto, **una decisión por pantalla y un botón dorado**. Descuento en % (el equivalente anual solo como apoyo). Moneda mostrada: USDC.

## 2. Fuentes de verdad (léelas en este orden)

1. `CLAUDE.md` (reglas duras: solo testnet, montos nunca `Number`, patrón de transacción).
2. `docs/FLUJO_V2.md` (vistas, estados, casos límite) y `docs/FLUJOS_Y_UX.md` (principios; sus secciones 3 a 6 y 9 están reemplazadas por FLUJO_V2).
3. `DESIGN.md` y `docs/mockups/README.md` (tokens, componentes e IDs de Stitch; las pantallas se leen con `get_screen`).
4. `packages/shared` (contrato: esquemas zod, errores, mensajes). **Importa de ahí, no dupliques tipos.**

## 3. Stack propuesto (fijar versiones al instalar, con la documentación vigente)

Vite + React + TypeScript estricto + React Router + TanStack Query + Tailwind con los tokens de `DESIGN.md` como variables CSS + Vitest y Testing Library. `@creit-tech/stellar-wallets-kit` para la billetera (Varial o Freighter, red TESTNET) y `@stellar/stellar-sdk` para armar las transacciones. QR: una librería de generación y el escáner con la cámara del navegador. Despliegue estático en Vercel.

Estructura: `apps/web/src/{api,wallet,chain,features,components,routes}`. Una carpeta por función (`features/invoices`, `features/offers`...).

## 4. API: simulada primero, real después

- Hasta que B4 despliegue la API, usa un **servidor simulado (MSW)** cuyas respuestas se validan con los esquemas de `packages/shared`. Interruptor `VITE_USE_MOCKS`.
- Cliente tipado en `src/api/client.ts` (`VITE_API_URL`). Errores con la forma `{ error: { code, message } }`: la pantalla muestra **`MESSAGES_ES[code]`** (una frase y un botón), nunca el texto del servidor.
- Acceso: reto firmado por la billetera. `POST /v1/auth/challenge`, firmar el XDR, `POST /v1/auth/verify`, JWT de 1 hora **en memoria** (no `localStorage`). Pendiente de comprobar: que Varial firme una transacción con secuencia 0; alternativa, firma de mensaje.

## 5. Red Stellar (testnet)

- Contrato USDC: `CCEP3RMDUYCFD3GJPDTMH2OQGX3KTV4NX7VRCXLUIIU2ZZOSKL4M5BE4`. SAC de USDC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`. Instancia con XLM para pruebas rápidas: `CDJLAF3FBQCMU35CPTAF3ICL5W3XSTMDOOLWKJU3K4GGC5WOWIRBY52S`.
- Cuentas de prueba (direcciones públicas, importadas en Varial): comprador `GABXMVQFX6R74OUC6TGL3YGO7TLGV7R34RVAGTJE42UUXCVA4IELCKU3`, proveedor `GCKU5G3MCJD4HM44QCK2E3D3Y6AIC3YZNG2EZ2HRWT4CF6LNSUWWVQTY`.
- Funciones del contrato: `create_offer(buyer, supplier, offer_id, face, net, expires_at)`, `accept(offer_id)`, `reclaim(offer_id)`, `get_offer`, `token`. Los montos son `i128` con 7 decimales.
- **Patrón de cada operación** (hoja "Operación en la red"): cuenta fresca, `setTimeout(180)`, simular, ensamblar, firmar, enviar y sondear `getTransaction` con límite. **No marcar éxito sin `SUCCESS`.** Nunca dos transacciones en paralelo desde la misma cuenta. Con `SUCCESS`, llamar `POST /v1/offers/:offerId/reconcile` con el hash: el servidor decide leyendo la red.
- El `offerId` lo entrega la API en `POST /v1/invoices/:id/offers/draft`; el front no lo inventa.
- Falta que las cuentas activen el USDC y consigan USDC de prueba (grifo de Circle, lo hace Jorge). Mientras tanto, probar con la instancia XLM.

## 6. Orden de trabajo (cortes verticales)

| Corte | Qué | Listo cuando |
|---|---|---|
| S0 | Esqueleto, tema, rutas, MSW, vista previa en Vercel | Se ve en el celular |
| S1 | Entrar con billetera, registro, código y QR (vistas 1, 2, 3, 11) | Registro completo contra el simulado |
| S2 | Inicio con pestañas y estados (vista 4) | "Requiere tu acción" arriba |
| S3 | Nueva factura en 3 pasos con subida directa por URL firmada (vista 5) | Factura enviada |
| S4 | Detalle por pagar: confirmar o "No coincide" (vista 7) | Cambia de estado |
| S5 | Nueva oferta y hoja de red: reservar (vistas 8 y 9) | `create_offer` firmado en testnet |
| S6 | Detalle por cobrar: cobrar, esperar, recuperar y comprobante (vistas 6 y 10) | `accept` y `reclaim` firmados |
| S7 | `/red`, contactos, ajustes y página de empresa (15, 12, 16, 13) | Demo completa |

## 7. Diseño

El diseño C fue **aprobado por Jorge el 23 nov** (dirección y las siete decisiones de `docs/mockups/README.md`): no cambies sus decisiones sin avisar. Hay mockups de las vistas 1, 2, 3, 5, 6, 7, 8 y 11; **faltan 4, 9, 10, 12 y 15**: constrúyelas con los patrones de `DESIGN.md` (tarjeta de comprobante con muescas, sello "PAGADO", un botón dorado). Los textos que Stitch inventó ("SUNAT validada", "Lectura óptica"...) **no van**: no hay IA ni verificación de SUNAT en el MVP.

## 8. Variables (solo nombres; los valores reales no se commitean)

`VITE_API_URL`, `VITE_USE_MOCKS`, `VITE_STELLAR_RPC_URL`, `VITE_NETWORK_PASSPHRASE`, `VITE_PRONTO_CONTRACT_ID`, `VITE_USDC_SAC_ID`.

## 9. Límites y verificación

- Toca solo `apps/web/**`. Puede **añadir** al contrato de `packages/shared` (sin renombrar ni quitar) y debe avisarlo. No toca `apps/api` ni `supabase/`.
- Nada de claves, `.env*` reales ni secretos. Commits convencionales y pequeños, sin atribución de IA; **no hacer push**, lo decide Jorge.
- Listo solo con evidencia: `pnpm lint`, `pnpm typecheck`, `pnpm test` en verde y un recorrido en el navegador a 390 px comparado con el mockup de cada pantalla.
- **Meta de la demo:** registro, factura, confirmar, oferta, cobrar y comprobante, en el celular, contra la API real en testnet.
