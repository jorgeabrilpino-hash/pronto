# Pronto — Roadmap y mapa de sesiones

> Fecha de corte: 18 nov 2026. Entrega: viernes 4 dic, 11:59 p. m. (APEX). Quedan 16 días.
> Fuente de verdad del producto: `docs/PRONTO_BASE.md` + ajustes de `docs/ANALISIS.md` §6.
> Este archivo lo mantiene la **sesión orquestadora**. Las demás sesiones solo leen su brief.

---

## 0. Decisiones de producto (19 nov) — prevalecen sobre `PRONTO_BASE.md` si hay conflicto

**Principios**
- **Pre-fondeo:** el comprador reserva el neto al crear la oferta (`create_offer` transfiere el neto al contrato). Sin saldo no hay oferta y el proveedor nunca ve una oferta sin fondos. Por eso Pronto filtra solo a los compradores sin caja o sin voluntad de pagar: no hace falta ninguna lista negra.
- **Quién paga el descuento:** el proveedor. El comprador paga el neto y el proveedor recibe el neto. El descuento no sale de la ley ni de un tercero: es un acuerdo comercial voluntario.
- **Alcance de usuarios:** MYPE **formales** que emiten factura electrónica a compradores formales. Las informales quedan fuera del MVP y se declara en el README. Sin integración con SUNAT ni verificación de cesión en CAVALI (declararlo).
- **Aceptar cierra la factura:** el texto de aceptación y el comprobante dicen "recibo S/ X como pago total de la factura <serie-número>". El contrato no conoce la factura, así que esa constancia es la prueba. El tratamiento tributario del descuento (posible nota de crédito) se consulta con un contador y se declara como pendiente.

- **Alcance del producto:** Pronto es la capa de pago entre partes que **ya comercian**. El descubrimiento de clientes, los pedidos y las sugerencias de precio de producto son Etapa 2 (`docs/ETAPA2.md`) y no se construyen en la buildathon. El uso del proveedor es por evento (tiene una factura aprobada o recibe una oferta), no diario: se declara como límite.
- **Anti-presión:** solo ofertas antes del vencimiento, rechazar no tiene costo, la mora legal sigue corriendo y la ficha pública deja en evidencia a quien estira los pagos para forzar descuentos.

**Funciones confirmadas**
- Sin puntos ni cashback (no hay quién los financie y duplican el descuento).
- **A:** ofertas en lote (CSV de facturas aprobadas) con un enlace compartible por proveedor.
- **B:** panel de ahorro del comprador (ganancia total y tasa anualizada).
- El comprador fija una **tasa anual objetivo** y la UI calcula el neto con los días que quedan. El contrato no cambia. El costo que ve el proveedor se recalcula con la fecha de hoy.
- Descuento escalonado por fecha (C): pospuesto, cambia el contrato.
- **Ficha pública del comprador (Should):** ofertas financiadas, % aceptado, días promedio adelantados y proveedores distintos, calculada desde la tabla `offers` de Supabase (reconciliada con el contrato; los eventos de la RPC solo guardan pocos días). Sin calificaciones manuales. El proveedor la ve al recibir una oferta. Sin directorio ni ranking de proveedores: queda para después del evento.

**Confirmada por Jorge (19 nov)**
- **Solicitud de pago anticipado iniciada por el proveedor, con techo de descuento:** la MYPE genera un enlace "ofréceme pago anticipado por S/ X, con descuento máximo de Y %" para enviárselo a su cliente. Es solo una fila en la base y un enlace, sin cambio de contrato. La UI avisa al comprador si su oferta supera el techo; el proveedor siempre decide al firmar. Ataca el problema de que el comprador no conoce Pronto y protege a la MYPE de perder más de lo que fijó.

**Para validar en las entrevistas:** costo real del factoring en Perú (pedir 1 o 2 cotizaciones de una factura de S/ 1 000 a 30 días) para compararlo con el costo anualizado de Pronto.

## 1. Cómo trabajamos

- **Sesión orquestadora (Opus):** decide, mantiene este roadmap y `NEXO-STATUS.md`, revisa lo que entrega cada sesión, integra ramas y verifica en el navegador. No escribe código de producto salvo arreglos chicos.
- **Sesiones de trabajo:** una por tarea con entregable propio, en su **worktree y rama** (`feat/<tema>`). Reciben un brief corto (sección 4), leen solo los archivos que necesitan y terminan con evidencia: comando + resultado observado.
- **Regla de paralelismo:** dos sesiones nunca tocan los mismos archivos. Los archivos compartidos (router, `package.json`, `index.css`) tienen un solo dueño por ola.
- **Modelos:** diseño y núcleo de transacciones → Opus. Esqueleto, esquema, vistas con spec clara → Sonnet. Búsquedas y cambios mecánicos → Haiku.
- **Commits:** pequeños, diarios, Conventional Commits, sin atribución de IA en el mensaje (la IA se declara en el README).

## 2. Estructura objetivo del repo

```
pronto/
├─ contracts/pronto_offer/        S1  contrato Soroban (hecho) + pruebas
├─ scripts/                       S1  deploy.ps1 / deploy.sh reproducibles
├─ supabase/migrations/           S4  esquema §5.2 + RLS
├─ web/                           S3  Vite + React + TS
│  ├─ packages/pronto-offer/      S1  bindings TS generados del contrato
│  ├─ src/app/                    S3  router, layout, providers (dueño único)
│  ├─ src/wallet/                 S3  Wallets Kit + useBalance
│  ├─ src/lib/                    S5  dinero (bigint), finanzas, errores
│  ├─ src/services/               S5  stellar (tx), db (Supabase), reconcile
│  ├─ src/features/buyer/         S6  vista comprador
│  ├─ src/features/supplier/      S7  vista proveedor
│  └─ src/features/receipts/      S8  comprobante + CSV
├─ DESIGN.md · docs/mockups/      S2
└─ docs/  PRONTO_BASE · ANALISIS · ROADMAP
```

## 3. Calendario por olas

| Ola | Fechas | Sesiones (en paralelo dentro de la ola) | Hito de salida |
|---|---|---|---|
| 0 | 18 nov | Orquestador: análisis + paquete base | Este roadmap ✅ |
| — | 19 nov | **Jorge:** inscripción, repo público, toolchain (sección 5) | Primer push a GitHub |
| 1 | 19–21 nov | S1 Contrato y despliegue · S2 Diseño · S3 Esqueleto web + billetera · S4 Esquema Supabase | Contrato en testnet, mockups aprobados, app conectando billetera en URL pública |
| — | 20 nov | **Jorge: registrar el repo en el Hub** (cierre oficial 25 nov) | Checkpoint cumplido |
| 2a | 22–23 nov | S5 Núcleo de negocio + servicio de transacciones (M4, M5) | Oferta creada y aceptada en testnet desde TypeScript, pruebas verdes |
| 2b | 24–26 nov | S6 Vista comprador (M7) · S7 Vista proveedor (M8) | Flujo completo en el navegador con dos cuentas |
| 3 | 27–29 nov | S8 Reconciliación + comprobante + CSV (M9–M11) · despliegue continuo (M12) | Demo completa en la URL pública |
| — | **30 nov** | **Congelar funciones** | Solo correcciones y documentación |
| 4 | 1–2 dic | S9 QA y seguridad · S10 README y guion | Checklist de entrega completo |
| — | 3 dic | **Jorge:** grabar el video (guion de S10) | Video ≤ 3 min subido |
| — | 4 dic (mañana) | **Jorge:** entrega en APEX | Entregado |
| — | 5 dic, 9:00 a. m. | Demo Day UTEC (no puntúa) | — |

**Plan de recorte (si al 26 nov S6/S7 no están):** sacar Supabase (S4/S8 parcial), guardar obligaciones en `localStorage` y leer estados del contrato. Se pierden la clave única y el CSV; la demo sigue completa.

## 4. Briefs de sesión (copiar al abrir cada sesión)

Cada brief asume: repo `C:\Buildathon\pronto`, rama propia, leer `CLAUDE.md` del proyecto primero, montos siempre en `bigint` o cadena decimal (nunca `Number`), solo TESTNET.

### S1 · Contrato y despliegue (Sonnet) — Ola 1
- **Requiere:** Rust + target `wasm32v1-none` + Stellar CLI instalados (sección 5).
- **Archivos:** `contracts/**`, `Cargo.*`, `scripts/**`, `web/packages/pronto-offer/**`, `.env.example`, sección "Evidencia en testnet" del `README.md`.
- **Hacer:** `cargo test` (11 pruebas) → `cargo scout-audit` (documentar hallazgos) → `stellar contract build` → identidad `pronto-deployer` con `--fund` → obtener SAC de USDC de testnet (verificar emisor oficial de Circle en testnet) y de XLM nativo → desplegar **dos instancias** (USDC principal, XLM respaldo) → generar bindings TS en `web/packages/pronto-offer` → prueba de humo por CLI: crear y aceptar una oferta entre dos identidades de prueba, guardar los hashes.
- **Listo cuando:** IDs en `.env.example` y README con enlaces a stellar.expert, bindings compilan, script de despliegue reproducible.

### S2 · Diseño (Opus) — Ola 1
- **Archivos:** `DESIGN.md`, `docs/mockups/**`.
- **Hacer:** sistema visual coherente con la estética Stellar del Hub (amarillo `#FDDA24`, negro `#0F0F0F`, tema oscuro), español neutro, sin jerga cripto. Mockups (una imagen por pantalla): inicio y elección de rol · comprador: lista de obligaciones y crear/financiar oferta · proveedor (mobile-first): oferta con "esperar vs. cobrar hoy" y costo anualizado · confirmación y comprobante con hash · estados de error (§4.5 del documento base) · onboarding "Activar USDC".
- **Listo cuando:** Jorge aprueba los mockups (GATE: sin aprobación no arrancan S6/S7).

### S3 · Esqueleto web + billetera (Sonnet) — Ola 1
- **Archivos:** `web/**` excepto `web/packages/pronto-offer/**` y `web/src/features/**`.
- **Hacer:** Vite + React + TS (Node ≥ 22.12), rutas `/`, `/comprador`, `/proveedor`, `/comprobante/:offerId` con páginas vacías; `@stellar/stellar-sdk@^17.4.0` y `@creit-tech/stellar-wallets-kit` (jsr) en TESTNET; `WalletProvider` con `{publicKey, isConnected, kit}`; `useBalance` para XLM y USDC (bigint, 7 decimales, refresco 30 s); configuración por variables `VITE_*`. Despliegue en Vercel **solo con OK de Jorge**.
- **Listo cuando:** `npm run build` verde y conexión de billetera verificada en el navegador.

### S4 · Esquema Supabase (Sonnet) — Ola 1
- **Archivos:** `supabase/**`.
- **Hacer:** migraciones de `companies` (más `sector` texto nullable y `ficha_publica` boolean por defecto true, para la Etapa 2), `obligations`, `offers` según §5.2 (montos `numeric(20,7)`), índice único parcial (una oferta `open`/`accepted` por obligación), regla "solo facturas no vencidas" (ajuste B), RLS restrictiva sin login (ajuste E), tipos TS generados en `supabase/types.ts`.
- **Listo cuando:** migraciones aplicadas en el proyecto de Jorge y los advisors de seguridad sin errores críticos.

### S5 · Núcleo de negocio + transacciones (Opus) — Ola 2a
- **Requiere:** S1 (bindings + IDs) y S3 (WalletProvider) integrados en `main`.
- **Archivos:** `web/src/lib/**`, `web/src/services/**`.
- **Hacer (TDD):** `money.ts` (decimal ↔ i128 sin `Number`), `finance.ts` (descuento, tasa, días anticipados, costo anualizado; caso canónico 1 000 / 15 / 985 / 30 días → ≈ 18,5 %), `errors.ts` (códigos 1–8 → mensajes §4.5), `offerId.ts` (32 bytes aleatorios), servicio `createOffer/acceptOffer/reclaimOffer/getOffer` con el patrón §7.3 (cuenta fresca, `setTimeout(180)`, simular, ensamblar, firmar, enviar, sondear con límite), `changeTrust` para USDC, cliente Supabase.
- **Listo cuando:** pruebas unitarias verdes y un script de integración crea y acepta una oferta real en testnet.

### S6 · Vista comprador (Sonnet) — Ola 2b
- **Archivos:** `web/src/features/buyer/**`. **Requiere:** S2 aprobado, S4, S5.
- **Hacer:** cargar obligación (solo no vencidas), definir la **tasa anual objetivo** (la UI calcula descuento y neto) y la vigencia (vigencia < fecha de pago original, máx. 30 días), financiar con el mensaje "Saldo insuficiente para reservar" si falla, **carga en lote por CSV con un enlace por proveedor**, **panel de ahorro** (ganancia total y tasa anualizada), lista con estados (Abierta/Aceptada/Vencida calculada/Recuperada), botón recuperar desde el vencimiento.

### S7 · Vista proveedor (Sonnet) — Ola 2b
- **Archivos:** `web/src/features/supplier/**`. **Requiere:** S2 aprobado, S4, S5.
- **Hacer:** bandeja de ofertas para su billetera, comparación "esperar el día X por S/ A" vs. "cobrar hoy S/ B (costo anual C %)", aceptar con el texto "recibo S/ X como pago total de la factura <serie-número>", manejo de `NotOpen`/`Expired`, onboarding "Activar USDC" si falta la trustline. Generar el enlace de solicitud de pago anticipado con techo de descuento. Mostrar una referencia de costos de alternativas (crédito de microempresa, factoring) con fuente y fecha, y sugerir el techo a partir del costo de financiamiento que declare la MYPE.

### S8 · Reconciliación, comprobante y CSV (Sonnet) — Ola 3
- **Archivos:** `web/src/services/reconcile.ts`, `web/src/features/receipts/**`.
- **Hacer:** releer `get_offer` tras cada `SUCCESS` y al abrir listas (§7.4), recuperación tras cierre del navegador, comprobante con hash, enlace a stellar.expert y la constancia "pago total de la factura <serie-número>", exportación CSV de tesorería. Ficha pública del comprador (ver §0), calculada desde `offers`.

### S9 · QA y seguridad (Sonnet + revisores) — Ola 4
- **Hacer:** recorrido de punta a punta con Playwright en la URL pública (dos cuentas, incluye segundo intento rechazado y oferta vencida recuperada), revisión de seguridad (secretos, RLS, dependencias), `cargo scout-audit`, checklist pre-deploy de la guía, `judgment-day` sobre el código.

### S10 · README y guion (Opus) — Ola 4
- **Hacer:** README completo según las bases (problema, solución, arquitectura, cómo ejecutar, IDs, integrante, uso de IA y de código previo, librerías), guion de 3:00 (§12 del documento base, con el reencuadre del ajuste B), checklist final de entrega.

## 5. Lo que necesito de Jorge

| # | Qué | Cuándo | Por qué bloquea |
|---|---|---|---|
| 1 | Inscribirte en el Hub con tu usuario de GitHub | 19 nov (cierre 24 nov) | Sin inscripción no hay participación |
| 2 | Crear el repo **público** `pronto` en GitHub y pasarme la URL (o autorizarme a crearlo con `gh`) | 19 nov | Checkpoint y worktrees de las sesiones |
| 3 | Registrar el repo en el Hub | 20 nov (cierre 25 nov) | Sin esto no se puede entregar |
| 4 | Instalar Rust (rustup, con Build Tools de C++), `rustup target add wasm32v1-none` y Stellar CLI | 19 nov | Bloquea S1 (no están instalados en esta máquina) |
| 5 | Billetera Varial con **dos cuentas** de testnet (comprador y proveedor), fondeadas con Friendbot. Pasar solo las **direcciones públicas** (G…), nunca la clave secreta | 21 nov | Demo con dos roles |
| 6 | Crear un proyecto gratuito en Supabase y poner URL + anon key en `web/.env.local` (los agentes no escriben archivos `.env`) | 21 nov | S4 aplica migraciones ahí |
| 7 | OK para desplegar en Vercel (preview temprano y producción) | 21 nov | La guía pide desplegar temprano |
| 8 | Aprobar los mockups de S2 | 21–22 nov | GATE de S6/S7 |
| 9 | (Recomendado) 3 conversaciones de 15 min: 1 comprador, 2 proveedores MYPE | antes del 2 dic | Sube "Problema e impacto" (20 %) |
| 10 | Grabar el video y entregar en APEX | 3–4 dic | Entregable final |

**Ya resuelto por Jorge:** Varial instalada, red TESTNET y cuenta fondeada con Friendbot (asistente de despliegue 3/3).

## 6. Herramientas de IA recomendadas para las sesiones

- **Stellar Skills** (skills.stellar.org) y **Stellar Raven** (MCP), recomendadas por la guía oficial. Revisar el repositorio antes de instalar y fijar versión.
- `llms.txt` de Stellar como contexto para S1 y S5.
- Context7 para documentación vigente de `stellar-sdk` 17 y Wallets Kit.
- Supabase MCP (ya conectado) para S4.
