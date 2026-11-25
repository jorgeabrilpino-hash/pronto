# Pronto — DESIGN.md

> Dirección visual **Editorial ledger** (25 nov 2026), definida por Jorge a partir de la referencia ChillSpace "Overview", mejorada y propia. **Reemplaza** la dirección C "Comprobante" (papel `#F7F4EC`, dorado, DM Sans). Este archivo manda sobre cualquier otra guía visual. Flujos y vistas: `docs/FLUJO_V2.md`. Auditoría que originó el rediseño: `docs/FRONT_AUDITORIA.md`.

## 1. Idea

Un libro contable impreso: papel cálido, tinta negra, bordes duros de 2 px, sombras desplazadas sin desenfoque y un solo color de señal (naranja) para la acción. La cifra importante es enorme y en serif. Una factura es un **ticket**: tarjeta negra con muescas y monto grande. Pronto no es una billetera: no debe parecerlo.

## 2. Formato

PWA responsive, mobile first, un solo código.
- **Teléfono (< 1024 px):** columna única, barra de navegación inferior de 4 iconos (Inicio, Facturas, Código/Escanear, Perfil), acción principal fija sobre la barra.
- **Escritorio (>= 1024 px):** barra lateral izquierda negra fija (240 px) con etiquetas mono en mayúsculas (EXPLORAR, ACTUAR, CONFIANZA); contenido a la derecha, ancho máximo 1080 px.
- Instalable: manifiesto, iconos, service worker, `display: standalone`.

## 3. Tokens (variables CSS en `src/styles.css`)

| Token | Valor | Uso |
|---|---|---|
| `--color-paper` | `#F2EEE3` | Fondo de la app |
| `--color-ink` | `#0E0E0C` | Texto, bordes, tarjetas negras, barra lateral |
| `--color-signal` | `#FF5A1F` | **Solo** la acción principal de cada pantalla y el estado "oferta abierta" |
| `--color-green` | `#1E7A4C` | Pagado, cobrado, confirmado |
| `--color-stellar` | `#FDDA24` | **Solo** sellos de confirmación en la red |
| `--color-muted` | `#6B665B` | Texto secundario (mínimo 14 px) |
| `--color-card` | `#F8F5EC` | Relleno de tarjetas y campos sobre el papel |
| `--color-danger` | `#B3261E` | Errores, siempre con icono y texto |

Contraste: tinta sobre papel ≈ 16:1; tinta sobre naranja ≈ 6,6:1; `muted` sobre papel ≈ 5:1.

## 4. Tipografía

| Rol | Fuente | Uso |
|---|---|---|
| Display | **Instrument Serif** | Títulos de pantalla y cifras grandes (monto neto, total) |
| Cuerpo | **DM Sans** | Texto, botones, listas |
| Mono | **JetBrains Mono** | Etiquetas en mayúsculas con espaciado (0,08 em), códigos, RUC, hashes, fechas, cifras de tabla |

Montos: formato peruano con **exactamente 2 decimales** y miles con espacio fino (`3 500,00`). Porcentajes en mono (`1,5 %`). Nunca `Number` para dinero (cadena decimal o `bigint`).

## 5. Forma y elevación

- Radio **0 a 2 px**. Bordes sólidos de **2 px** `ink`.
- Sombra dura desplazada `4px 4px 0 ink` en tarjetas y botones; al pulsar, el botón se **hunde** (`translate(3px,3px)` y sombra 1 px).
- **Rayado diagonal** (`repeating-linear-gradient 45°`) para lo pendiente o proyectado; **línea punteada** para referencias (promedio, perforación del ticket).
- Etiquetas de estado: **píldoras con contorno** (borde 2 px, sin relleno de color salvo naranja para "oferta abierta").
- Objetivo táctil mínimo **44 px**. Una acción principal (naranja) por pantalla; las demás, botones con contorno. Las acciones importantes nunca son enlaces de texto pequeños.

## 6. Componentes

- **Ticket** (hero): tarjeta negra, texto `paper`, dos muescas semicirculares y perforación punteada, cifra serif enorme.
- **Botón**: principal (naranja, borde y sombra duros), secundario (contorno, fondo `card`), terciario (texto subrayado, solo para acciones no críticas).
- **Píldora de estado**: icono + texto, contorno 2 px. Vocabulario único (sección 7).
- **Gráfico de barras por mes de vencimiento**: sólida = cobrado, rayada = proyectado, punteada = promedio.
- **Sello**: texto mono en mayúsculas dentro de un recuadro de 2 px, giro de −4°; `PAGADO` (verde), `RESERVADO` (naranja), `EN LA RED` (amarillo Stellar).
- **Navegación**: barra inferior (teléfono) o lateral (escritorio); la sección activa lleva relleno `ink` o subrayado naranja.
- **Hoja inferior** (teléfono) / **diálogo centrado** (escritorio) para la operación en la red.

## 7. Vocabulario de estados (único en toda la app)

| Estado de la API | Proveedor | Cliente |
|---|---|---|
| `sent` | Esperando | Por confirmar |
| `rejected` | Revisar | (oculta) |
| `confirmed` | Confirmada | Confirmada |
| `offer_open` | Oferta recibida | Reservada |
| `collected` | Cobrada | Pagada |
| `offer_expired` | Oferta vencida | Vencida: recuperar |
| `cancelled` | Cancelada | (oculta) |

## 8. Estados de pantalla

Carga: esqueletos rayados de la misma silueta. Vacío: una frase, un icono y la acción. Error: una frase de `MESSAGES_ES[code]` y un botón, con borde `danger`. Éxito: sello y siguiente paso. Sin conexión: datos cargados visibles más aviso.

## 9. Contenido y tono

Español neutro, tuteo, verbos directos. Descuento siempre en porcentaje; el equivalente anual es texto pequeño de apoyo. Sin texto de IA ni de SUNAT. Etiqueta **Testnet** visible en la barra. Datos de ejemplo peruanos (Imprenta Gráfica Andina SAC, Distribuidora Yanahuara SAC, F001-123).

## 10. Sesión y conexión

- **Billetera:** Stellar Wallets Kit (Varial o Freighter en escritorio; WalletConnect en teléfonos). La conexión es real; la demostración es un modo aparte.
- **Sesión:** el JWT (1 h) se guarda en `sessionStorage` para sobrevivir a una recarga o a cambiar de app. **Compromiso:** un script malicioso en la página podría leerlo (a diferencia de la memoria pura); se mitiga con vida corta, sin datos sensibles en el token, sin HTML inyectado y con la CSP de `apps/web/vercel.json` (script-src solo propio; connect-src limitado a la API, RPC, Horizon y WalletConnect: añadir el host de la API real al desplegar). Al vencer, se vuelve a firmar con la billetera sin pasar por la bienvenida.
- **API:** un único interruptor de entorno (`VITE_USE_MOCKS`) cambia entre la API simulada y la real.

## 11. Accesibilidad

Contraste AA, foco visible (2 px naranja con separación), estados con icono y texto, etiquetas persistentes en campos, importes con texto completo para lectores de pantalla, `prefers-reduced-motion` respetado, el QR siempre con su código escrito.

## 12. Sí y no

| Sí | No |
|---|---|
| Cifra grande en serif, una vez | Repetir el monto en varios bloques |
| Bordes duros y sombra desplazada | Degradados, vidrio, sombras difusas, esquinas muy redondeadas |
| Un botón naranja por pantalla | Dos acciones naranjas o naranja decorativo |
| Rayado para lo pendiente | Estado solo por color |
| Etiquetas mono en mayúsculas | Texto pequeño para acciones importantes |
