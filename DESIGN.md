# Pronto — DESIGN.md

> Dirección **App móvil legible** (25 nov 2026, cambio de producto de Jorge). **Reemplaza** "Editorial ledger" y "Comprobante". De la referencia ChillSpace queda **solo** el estilo de botones y chips (borde negro de 2 px, sombra desplazada, naranja principal, píldoras con contorno): ni su disposición, ni su barra lateral, ni su serif, ni sus gráficos. Flujos: `docs/FLUJO_V2.md` (los roles se ajustan al perfil de la empresa).

## 1. Idea

Una **app móvil** rápida y simple: "mis pendientes". Modelo de la primera pantalla: el inicio de una billetera (saldo, acciones con icono, lista). No es un panel de control. Cada pantalla pide una sola decisión.

## 2. Formato

PWA de una sola columna (máximo 480 px). En escritorio la misma columna, centrada, con bordes laterales sobre un fondo neutro. **Sin barra lateral.**

- **Barra inferior** de 5 posiciones, solo en las pantallas raíz: Inicio · Facturas · **acción central contextual** · Actividad · Perfil.
- La acción central es el único naranja de la pantalla raíz. Según perfil y contexto: *Nueva factura* (proveedor) o *Pagar* (comprador).
- Las pantallas de flujo (detalle, oferta, nueva factura, comprobante) no muestran la barra: llevan su botón principal fijo al pie.

## 3. Tokens (`src/styles.css`)

| Token | Valor | Uso |
|---|---|---|
| `--color-paper` | `#F4F4F2` | Fondo de la columna |
| `--color-desk` | `#E4E4E0` | Fondo fuera de la columna (escritorio) |
| `--color-card` | `#FFFFFF` | Tarjetas, campos, hojas |
| `--color-ink` | `#0E0E0C` | Texto, bordes, tarjeta de saldo |
| `--color-signal` | `#FF5A1F` | **Solo** la acción principal y "oferta abierta" |
| `--color-green` | `#1E7A4C` | Pagado, cobrado, confirmado |
| `--color-stellar` | `#FDDA24` | Red (testnet) y sellos de confirmación en la red |
| `--color-muted` | `#5F5F5A` | Texto secundario (14 px o más; ≈ 5,8:1 sobre papel) |
| `--color-danger` | `#B3261E` | Errores, con icono y texto |

## 4. Tipografía

- **Inter** (variable) para todo: títulos 22 a 28 px / 700, cuerpo 16 px / 400, secundario 14 px.
- **Dinero:** Inter con `tabular-nums`, peso 600 a 700; **siempre 2 decimales** y miles con espacio fino (`3 500,00`). Nunca `Number`.
- **JetBrains Mono** solo para códigos, hashes y direcciones (`.code`).
- Etiquetas: Inter 600, 11 px, mayúsculas, 0,06 em. **Sin serif de exhibición.**

## 5. Forma

- Tarjetas y botones: borde sólido de **2 px** `ink`, radio **10 px**.
- Botones y chips: **sombra desplazada** (`3px 3px 0 ink`) que se hunde al pulsar. Principal naranja; secundario blanco. Mínimo 44 px de alto.
- Estado: **píldora con contorno** (radio total), icono + texto.
- Una **tarjeta negra de saldo** (texto claro) en el inicio. Ticket con muescas solo en detalle y comprobante.
- Rayado diagonal solo para lo pendiente (progreso, esqueletos).

## 6. Vocabulario de estados

| Estado | Proveedor | Comprador |
|---|---|---|
| `sent` | Esperando | Por confirmar |
| `rejected` | Revisar | (oculta) |
| `confirmed` | Confirmada | Confirmada |
| `offer_open` | Oferta recibida | Reservada |
| `collected` | Cobrada | Pagada |
| `offer_expired` | Oferta vencida | Vencida: recuperar |
| `cancelled` | Cancelada | (oculta) |

## 7. Módulos

- **Bienvenida:** logo, una frase, *Entrar* y *Cómo funciona*. **Nunca se pide elegir rol.**
- **Entrar:** *Conectar mi billetera* (Wallets Kit) o *Crear mi cuenta de prueba* (solo testnet).
- **Registro** (solo nuevos): RUC, razón social, rubro y **perfil** en 3 tarjetas: Proveedor, Comprador, Las dos cosas. Todo se adapta al perfil; "las dos" muestra un selector segmentado.
- **Inicio:** empresa y píldora de red; tarjeta negra de saldo (USDC grande, XLM "para comisiones", dirección con copiar); fila de acciones con icono; *Pendientes*; *Últimos movimientos*.
- **Facturas** (filtros y píldoras), **Actividad** (cobradas, reservadas, recuperadas, con enlace al explorador), **Perfil**.

## 8. Estados de pantalla

Carga: esqueletos de la misma silueta. Vacío: una frase, un icono y la acción. Error: una frase de `MESSAGES_ES[code]` y un botón. Éxito: sello y siguiente paso.

## 9. Contenido

Español neutro, tuteo, verbos directos. Descuento en %; equivalente anual pequeño. Sin texto de IA ni de SUNAT. Red **Testnet** siempre visible.

## 10. Sesión y billetera

- Billetera: Stellar Wallets Kit (Varial o Freighter; WalletConnect en teléfonos) o **cuenta de prueba local** (solo testnet): clave generada en el navegador, cifrada con PIN (WebCrypto PBKDF2 + AES-GCM) en IndexedDB. Aviso "cuenta de prueba, sin valor real". La clave nunca sale del dispositivo.
- Sesión: JWT (1 h) en `sessionStorage` para sobrevivir recargas. **Compromiso:** un script inyectado podría leerlo; se mitiga con vida corta, sin HTML inyectado y la CSP de `apps/web/vercel.json` (hay que añadir el host de la API real). Al vencer, se vuelve a firmar.
- API: `VITE_USE_MOCKS` cambia entre simulada y real.

## 11. Accesibilidad

Contraste AA, foco visible, estados con icono y texto, etiquetas persistentes, importes legibles por lector de pantalla, `prefers-reduced-motion`, QR siempre con su código escrito, objetivos de 44 px.
