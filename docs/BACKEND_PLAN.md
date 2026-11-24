# Pronto — Plan del backend

> 21 nov 2026. **Borrador local, sin publicar.** Pendiente de aprobación de Jorge. Reemplaza la sección de stack de `docs/ROADMAP.md` para el backend y alimenta a S4 y S5.

## 1. Decisión y alcance

- **Backend: TypeScript con arquitectura hexagonal** (puertos y adaptadores).
- **Rust se queda solo en el contrato** (`contracts/pronto_offer`): Soroban exige Rust. El servidor no es Rust.
- **Reglas de oro**
  1. El servidor **nunca firma ni guarda llaves**. Cada usuario firma en su billetera.
  2. **La red manda en el dinero.** El estado de una oferta solo lo escribe el servidor, después de leerlo de Stellar.
  3. **La base está cerrada** (RLS sin políticas: nadie entra directo). Solo la API, con la clave de servicio.
  4. **Dominio puro:** sin base de datos, sin Stellar, sin red. Todo lo externo entra por puertos.
  5. **Contrato primero:** los esquemas (zod) de `packages/shared` generan el OpenAPI y el cliente tipado del front.
  6. **Dinero siempre en `bigint` o texto decimal**, nunca `Number`.
  7. **La IA nunca decide ni mueve dinero** (sección 11).
- **Fuera de alcance:** microservicios, colas, tareas programadas, notificaciones, SUNAT/CAVALI, soles, varios activos.

## 2. Stack (versiones exactas se fijan en B0 con la documentación vigente)

| Pieza | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript estricto, Node 24 | Mismo lenguaje que el front y el SDK de Stellar |
| Monorepo | pnpm workspaces | Ya instalado (pnpm 11) |
| API | **Hono** + `@hono/zod-openapi` | Despliegue sin configuración en Vercel ([guía de Vercel](https://vercel.com/kb/guide/ship-a-hono-app-on-vercel.md)); OpenAPI desde los esquemas |
| Validación | zod | Un solo esquema para validar, tipar y documentar |
| Base de datos | Postgres en Supabase + SQL de migraciones (Supabase CLI) | Fuente de verdad del esquema |
| Acceso a datos | **Kysely** + `pg`, tipos generados desde la base | Tipado sin "magia" de ORM; `numeric` como texto |
| Archivos | Supabase Storage, cubo privado | Enlaces firmados y temporales |
| Acceso | `jose` (JWT) + firma de billetera | Sin correo ni contraseña |
| Stellar | `@stellar/stellar-sdk` ^17.4.0 | El de la guía del Hub |
| Pruebas | Vitest; Docker para Postgres real | Docker ya instalado |
| Calidad | Biome, pino, GitHub Actions | Revisión automática en cada subida |
| Despliegue | Vercel Functions (Fluid compute) | Duración por defecto de 300 s según [la documentación](https://vercel.com/docs/functions/limits) (verificar en vivo) |

## 3. Estructura y quién toca qué

```
pronto/
├─ contracts/pronto_offer/            existente (Rust)
├─ supabase/
│  ├─ migrations/  seed.sql  config.toml           B1
│  └─ generated/db.ts                              B1
├─ packages/shared/                                B0
│  └─ src/ contract.ts  errors.ts  messages.es.ts
├─ apps/api/
│  ├─ api/index.ts                                 B4 (entrada Vercel)
│  └─ src/
│     ├─ domain/                                   B2
│     ├─ application/  use-cases/  ports/          B0 (puertos) y B2
│     ├─ adapters/
│     │  ├─ postgres/  storage/  stellar/  auth/   B3
│     │  ├─ http/                                  B4
│     │  └─ ai/                                    B6 (Could)
│     └─ composition/                              B4
├─ apps/web/                                       después (diseño C)
└─ .github/workflows/ci.yml                        B0
```

Cada sesión toca solo sus carpetas, para poder correr en paralelo sin pisarse.

## 4. Dominio (código puro, sin dependencias)

**Objetos de valor**
- `Ruc`: 11 dígitos con dígito verificador (módulo 11; se prueba con RUC reales conocidos).
- `CompanyCode`: `PR-` + 6 caracteres del alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (sin letras que se confundan). Si choca, se regenera.
- `Money`: `bigint` con 7 decimales; leer y formatear sin `Number`.
- `InvoiceRef`: serie (4 caracteres, ej. `F001`) y número (1 a 8 dígitos).
- `StellarAddress`: forma `G…` de 56 caracteres (el checksum lo valida el adaptador).

**Finanzas (funciones puras)**
- `netFromDiscount(face, bps)`, `discount(face, net)`, `annualizedBps(discount, net, days)` con enteros escalados y redondeo fijo.
- **Prueba canónica:** factura 1 000, descuento 1,5 %, 30 días → neto 985, costo anual **18,5 %** (1 853 pb).

**Máquina de estados de la factura**

| Desde | Hacia | Quién | Condición |
|---|---|---|---|
| `sent` | `confirmed` · `rejected` · `cancelled` | Cliente · Cliente · Proveedor | — |
| `rejected` | `sent` · `cancelled` | Proveedor | Corrigió y reenvía |
| `confirmed` | `cancelled` | Proveedor | **Solo si no hay oferta** `pending`, `open` ni `accepted` |

El estado que ve el usuario (oferta abierta, cobrada, vencida, recuperada) se **calcula** combinando la factura con la oferta.

**Reglas de negocio**
- Factura no vencida y con fecha de emisión no futura.
- Si el vencimiento supera 30 días desde la emisión, el proveedor declara `longer_term_agreed` (plazo pactado por escrito, Ley 31362 art. 3).
- Proveedor y cliente distintos (el contrato también lo exige).
- Oferta: vigencia de 3, 7 o 15 días, y siempre termina antes del vencimiento.
- Descuento por encima del máximo del proveedor: **aviso, no bloqueo** (el proveedor decide al firmar).

**Errores de dominio (código estable → mensaje en español en `packages/shared`)**
`RUC_INVALID`, `RUC_TAKEN`, `WALLET_TAKEN`, `COMPANY_NOT_FOUND`, `SELF_INVOICE`, `INVOICE_DUPLICATE`, `INVOICE_OVERDUE`, `INVOICE_NOT_FOUND`, `INVALID_STATE`, `FORBIDDEN`, `OFFER_EXISTS`, `ATTACHMENT_INVALID`, `CHAIN_MISMATCH`, `CHAIN_UNAVAILABLE`, `CHALLENGE_EXPIRED`, `SIGNATURE_INVALID`, `RATE_LIMITED`.

## 5. Casos de uso

| # | Caso | Actor | Resumen |
|---|---|---|---|
| 01 | `RequestChallenge` | Público | Crea un reto de un solo uso para una dirección |
| 02 | `VerifyChallenge` | Público | Verifica la firma y entrega el acceso (JWT) |
| 03 | `RegisterCompany` | Billetera nueva | RUC, razón social, rubro; genera código |
| 04 | `GetMe` / `UpdateSettings` | Empresa | Datos propios y ficha pública sí/no |
| 05 | `FindCompany` | Empresa | Por código o RUC exacto; datos públicos |
| 06 | `RequestUploadUrl` / `CompleteUpload` | Empresa | Subida directa a Storage con URL firmada |
| 07 | `SendInvoice` | Proveedor | Crea la factura `sent` para ese cliente |
| 08 | `ListInvoices` / `GetInvoice` | Ambos | Con documentos y estado calculado |
| 09 | `ConfirmInvoice` / `RejectInvoice` | Cliente | Confirmar o "No coincide" con motivo |
| 10 | `EditAndResend` / `CancelInvoice` | Proveedor | Corregir o cancelar (si no hay oferta) |
| 11 | `PrepareOffer` | Cliente | Calcula neto y vigencia, genera `offer_id` aleatorio y guarda `pending` |
| 12 | `ReconcileOffer` | Ambos | **Lee la red y actualiza la oferta** (sección 8) |
| 13 | `GetOfferProof` | Ambos | Datos de "Ver en la red" |
| 14 | `ListContacts` / `GetCompanyPage` | Empresa | Contactos y ficha del cliente |
| 15 | `ExportInvoicesCsv` | Cliente | Archivo para tesorería |
| 16 | `ExtractInvoice` | Proveedor | XML (Should) o IA (Could) → datos propuestos |
| 17 | `CreateInvite` | Proveedor | Invitar a un cliente aún no registrado |
| 18 | `GetNetworkSummary` | Público | Para `/red` |
| 19 | `ImportInvoicesBatch` | Proveedor | Excel (Could) |

**Prioridad:** Must 01 a 14 y 18 · Should 15, 16 (solo XML) y 17 · Could 16 (IA) y 19.

## 6. Puertos (interfaces del núcleo)

```ts
CompanyRepository     byId · byRuc · byCode · byWallet · insert · update
InvoiceRepository     insert · byId · listFor(company, role) · duplicateExists · update(expectedVersion)
OfferRepository       insertPending · byOfferId · byInvoice · update · listFor(company)
AttachmentRepository  insert · byId · markReady
FileStorage           createUploadUrl · createDownloadUrl(ttl) · head
ChainReader           getOffer(offerIdHex) · getTransaction(hash) · contractId
ChallengeStore        create(address, ttl) · consume(nonce)
SignatureVerifier     verifyChallenge(xdr, address, nonce)
TokenService          issue · verify
InvoiceExtractor      extract(file)            // XML ahora, IA después
RateLimiter           hit(key, window, max)
AuditLog              record(event)
Clock · IdGenerator   now() · offerId() · companyCode() · token()
```

Concurrencia: la factura lleva `version`; cada cambio exige la versión que se leyó, para que dos clics o dos pestañas no apliquen la misma transición dos veces.

## 7. API REST (`/v1`, acceso con `Authorization: Bearer`)

| Método y ruta | Acceso | Caso |
|---|---|---|
| `POST /auth/challenge` · `POST /auth/verify` | Público | 01 · 02 |
| `POST /companies` | Firmado | 03 |
| `GET /me` · `PATCH /me/settings` | Empresa | 04 |
| `GET /companies/lookup?code=\|ruc=` | Empresa | 05 |
| `GET /public/companies/:code` | Público (respeta ficha pública) | 14 |
| `POST /attachments/upload-url` · `POST /attachments/:id/complete` · `GET /attachments/:id/url` | Empresa | 06 |
| `POST /invoices` · `GET /invoices?role=&status=` · `GET /invoices/:id` | Empresa | 07 · 08 |
| `POST /invoices/:id/confirm` · `/reject` · `/cancel` · `PATCH /invoices/:id` (reenviar) | Según rol | 09 · 10 |
| `POST /invoices/:id/offers/draft` | Cliente | 11 |
| `POST /offers/:offerId/reconcile` · `GET /offers/:offerId` | Ambos | 12 · 13 |
| `GET /contacts?role=` · `GET /exports/invoices.csv` | Empresa | 14 · 15 |
| `POST /invoices/extract` | Proveedor | 16 |
| `POST /invites` | Proveedor | 17 |
| `GET /public/network` · `GET /health` | Público | 18 |

Errores: `{ "error": { "code", "message", "details?" } }` con código HTTP coherente (400, 401, 403, 404, 409, 422, 429, 502). El front traduce el `code` a una frase y un botón.

**Subidas:** los archivos van **directo a Storage** con URL firmada, no por la API, porque el cuerpo de una función de Vercel tiene un tope de unos 4,5 MB (dato de memoria, sin verificar aquí) y el límite del producto es 5 MB.

## 8. Reconciliación con la red (el corazón de la seguridad)

1. **Entrada:** `ReconcileOffer(offerId, txHash?)`. También se llama al abrir listas con ofertas `pending` u `open` (no más de una vez cada 15 s por oferta).
2. **Lectura primaria: estado actual del contrato**, con `getLedgerEntries` sobre la entrada de datos de esa oferta (no depende de historial). Respaldo: simular `get_offer`. Se decodifica con el SDK.
3. **Por qué no solo el historial:** `getTransaction` solo conserva transacciones recientes (24 horas por defecto, hasta 7 días como máximo, según la [documentación](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents); las fuentes difieren). Fuera de esa ventana devuelve `NOT_FOUND`. El hash se usa como evidencia si está disponible, no como requisito.
4. **Verificaciones** antes de escribir: el contrato es el de nuestro entorno; el comprador y el proveedor on-chain son las billeteras de las empresas de esa factura; el importe y el neto coinciden con el borrador; el vencimiento coincide.
5. **Resultado:** coincide → se actualiza `chain_status` (`open`, `accepted`, `reclaimed`) y los hashes. **No coincide → `failed` + auditoría + `CHAIN_MISMATCH`**, sin confiar jamás en lo que diga el navegador.
6. **`pending` que no aparece en la red tras 10 minutos → `failed`.** Es idempotente: repetirlo no cambia nada.
7. **Pendiente de comprobar al implementar (B3 y B5):** la forma exacta de la clave de datos de `DataKey::Offer(BytesN<32>)` contra el contrato ya desplegado.

## 9. Acceso (sin correo ni contraseña)

- **Reto:** transacción con secuencia 0, una operación de datos con un `nonce` aleatorio y vigencia de 5 minutos. La billetera la **firma** y nunca se envía a la red. El servidor verifica la firma y consume el `nonce` (un solo uso).
- **Sesión:** JWT de 1 hora con la dirección y el ID de empresa; para renovar, se firma de nuevo.
- **Pendiente de comprobar en B3 con Varial:** que la billetera firme una transacción con secuencia 0. Alternativa: firma de mensaje. Si ninguna funciona, el plan alterno ya está en `FLUJOS_Y_UX.md` §9.

**Autorización** (la decide cada caso de uso, no la base):

| Acción | Quién |
|---|---|
| Ver una factura y sus documentos | Su proveedor y su cliente, solo |
| Subir un documento | La empresa dueña del archivo |
| Confirmar, rechazar, preparar oferta | Solo el cliente |
| Cancelar o reenviar | Solo el proveedor, y sin oferta activa |
| Reconciliar una oferta | Cualquiera de las dos partes |
| Contactos y exportación | Solo la propia empresa |

## 10. Modelo de datos (SQL; lo implementa B1)

- `companies`: `id`, `ruc` (único), `legal_name`, `sector`, `wallet` (único), `code` (único), `ficha_publica`, `created_at`.
- `auth_challenges`: `nonce` (PK), `address`, `expires_at`, `consumed_at`.
- `invoices`: `id`, `supplier_id`, `buyer_id`, `series`, `number`, `face_amount numeric(20,7)` (> 0), `currency`, `issue_date`, `due_date`, `longer_term_agreed`, `max_discount_bps` (0 a 5000, opcional), `status`, `rejection_reason`, `version`, fechas. **Único** (`supplier_id`, `series`, `number`); **chequeos:** proveedor ≠ cliente, `due_date` > `issue_date`.
- `attachments`: `id`, `invoice_id`, `owner_company_id`, `kind` (`pdf` | `image` | `xml`), `storage_path` (único, aleatorio), `mime`, `size_bytes` (≤ 5 242 880), `sha256`, `status` (`pending` | `ready`).
- `offers`: `id`, `invoice_id`, `offer_id_hex` (único, 64 hex), `net_amount`, `discount_amount`, `discount_bps`, `expires_at`, `chain_status` (`pending` | `open` | `accepted` | `reclaimed` | `failed`), `tx_create`, `tx_accept`, `tx_reclaim`, `contract_id`, `last_checked_at`. **Índice único parcial:** una sola oferta en `pending`, `open` o `accepted` por factura.
- `invites`: `id`, `from_company_id`, `target_ruc`, `token_hash`, `expires_at`, `claimed_at`.
- `rate_limits`: `key`, `window_start`, `count` (límites sin servicios extra).
- `audit_events`: solo se agrega, nunca se edita.
- **Vistas:** `v_contacts`, `v_buyer_ficha` (ofertas financiadas, % aceptado, días adelantados promedio, proveedores distintos).
- **Seguridad:** RLS activado en todas las tablas **sin políticas** (acceso directo denegado) y cubo `invoices` privado.
- **Datos de demostración (`seed.sql`):** dos empresas ficticias con RUC de dígito verificador válido, varias facturas en distintos estados. Imprescindible para el video.

## 11. Inteligencia artificial y agentes: decisión

**Regla:** la IA **lee documentos o responde sobre datos propios**. **No decide, no calcula dinero, no firma, no aprueba, no mueve fondos.** Todo número sale de las funciones del dominio y todo lo que la IA propone lo confirma una persona.

| Idea | Veredicto | Cómo |
|---|---|---|
| **Leer la factura (PDF o foto) con IA** y proponer los datos | **Sí, como Could #1** | Puerto `InvoiceExtractor` con dos adaptadores: XML exacto (Should, sin IA) e IA (Could) con un proveedor de modelos **gratuito e intercambiable** (Gemini principal; Groq u OpenRouter de respaldo; API compatible con OpenAI, configurada con `LLM_BASE_URL`, `LLM_API_KEY` y `LLM_MODEL`). Respuesta con esquema JSON fijo, sin herramientas, el documento tratado como dato (no como instrucciones). El servidor **revalida** (RUC, montos, fechas) y la pantalla pide confirmar. Interruptor `AI_ENABLED`, tope de 20 usos al día por empresa, sin guardar el contenido en registros |
| **Asistente de consulta** ("¿cuánto me deben este mes?") | Could #2, solo si el resto está listo el 29 nov | Nuevo adaptador de entrada que llama a los **mismos casos de uso** como herramientas, **solo lectura**, con el acceso del usuario, máximo 5 llamadas por pregunta |
| **Servidor MCP de solo lectura** (estado de oferta, mis facturas) | Could #3 | Mismo patrón; sirve de vitrina "Stellar + agentes" |
| Sugerir descuentos, evaluar riesgo, aprobar facturas, decidir pagos | **No** | No es reproducible ni auditable, y toca dinero |

**Lo bueno de la arquitectura:** como el puerto ya existe desde el inicio, la IA se agrega **sin tocar el dominio**. Posponerla no cuesta nada ahora.

**Requisitos y límites de la IA**
- Se usan **planes gratuitos**: Gemini como principal (lee imagen y PDF y devuelve JSON con esquema) y Groq u OpenRouter de respaldo. Los límites cambian y las fuentes difieren: verificarlos en la página oficial de cada proveedor. La clave va solo en las variables de Vercel y en el archivo local fuera del repo.
- Los documentos se envían a un tercero y, en planes gratuitos, los datos pueden usarse para mejorar sus productos (sin verificar): **solo facturas de demostración, nunca datos reales**. La pantalla lo avisa con una línea y se puede desactivar.
- El modelo se elige probando con unas 10 facturas de ejemplo. Si la IA falla o se agota la cuota, el formulario manual sigue funcionando.
- La IA **no entra en la ruta crítica** de la demo.

## 12. Seguridad (lista de control)

| Amenaza | Defensa |
|---|---|
| Estado de oferta falsificado por el navegador | Lo escribe solo el servidor, tras leer la red (sección 8) |
| Pagar a la billetera equivocada | El cliente confirma la billetera del proveedor; el contrato fija la dirección |
| Acceder a facturas de otros | Autorización en cada caso de uso y base cerrada |
| Reutilizar un reto firmado | `nonce` de un solo uso y 5 minutos |
| Robo de sesión | JWT de 1 hora, sin guardarlo en `localStorage` si el front lo permite |
| Archivos maliciosos | Lista de tipos, revisión del tipo real del archivo, 5 MB, ruta aleatoria, nunca se ejecutan |
| Inyección en la lectura con IA | Salida con esquema, sin herramientas, revalidación |
| Fuerza bruta o abuso | `rate_limits` en reto, subidas y reconciliación |
| Filtración de claves | Nada en el repo; solo nombres en `.env.example` |
| Datos personales en registros | Registros sin tokens ni contenido de documentos |

## 13. Pruebas

1. **Dominio:** finanzas (caso 18,5 %), RUC, código de empresa, dinero, máquina de estados. Meta de cobertura: 90 % en dominio y aplicación.
2. **Casos de uso:** con adaptadores en memoria; todos los flujos felices y todos los errores de la sección 4.
3. **Adaptadores:** Postgres real con Docker (restricciones, índice parcial, concurrencia); lector de Stellar con respuestas grabadas, más una prueba de humo en vivo contra testnet.
4. **API:** rutas con el cliente de pruebas de Hono, incluida la autorización de cada rol.
5. **Integración final (B5):** crear, aceptar y recuperar una oferta en testnet con el contrato desplegado, y comprobar que la base queda consistente.
6. **CI:** tipos, formato, pruebas y, cuando haya Rust, `cargo test`.

## 14. Entornos y configuración

- **Local:** `supabase start` (Docker) y la API en local.
- **Vista previa y producción:** un proyecto de Supabase y un proyecto de Vercel.
- **Variables (solo nombres):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `JWT_SECRET`, `STELLAR_RPC_URL`, `STELLAR_NETWORK_PASSPHRASE`, `PRONTO_CONTRACT_ID`, `USDC_SAC_ID`, `ALLOWED_ORIGINS`, `AI_ENABLED`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`. Local: `C:\Buildathon\.secrets\pronto.env` (fuera del repo, se carga con `node --env-file`). Supabase: Session pooler en `DATABASE_URL` (el host directo `db.*` es solo IPv6).
- **Scripts:** migrar, cargar datos de demostración, verificar salud y reconciliar a mano.

## 15. Ejecución por sesiones

| Sesión | Qué hace | Modelo | Depende de | Listo cuando |
|---|---|---|---|---|
| **B0** | Esqueleto del monorepo, CI, `packages/shared` (esquemas, errores, mensajes) y **puertos** | Opus | Aprobación | `typecheck` y `test` en verde en local y en CI |
| **B1** | Migraciones, `seed.sql`, RLS cerrada, cubo privado, tipos generados | Sonnet | B0 | Aplica en Supabase local y en el proyecto de Jorge; pruebas de restricciones |
| **B2** | Dominio y casos de uso con adaptadores en memoria | Opus | B0 | Todas las pruebas; cobertura ≥ 90 % |
| **B3** | Adaptadores: Postgres, Storage, lector de Stellar, acceso | Sonnet | B1 y B2 | Pruebas de adaptadores en verde; firma probada con Varial |
| **B4** | Rutas Hono, OpenAPI, errores, límites, despliegue de prueba en Vercel | Sonnet | B2 y B3 | `/health` y `/docs` en línea; cliente tipado generado |
| **B5** | Integración contra testnet, datos demo, revisión de seguridad | Opus | B4 y el contrato desplegado (S1) | Oferta creada, cobrada y recuperada con base consistente |
| **B6** | IA (Could) | Sonnet | B5 | Extracción con 10 facturas de prueba |

**Paralelismo:** B1 y B2 corren a la vez (carpetas distintas). Después B3, B4 y B5 en cadena.

**Calendario:**

| Día | Trabajo |
|---|---|
| 21–22 nov | B0 |
| 22 nov | B1 y B2 |
| 23 nov | B3 |
| 24 nov | B4 y despliegue del contrato (S1) |
| 25 nov | B5 |
| Desde el 24 nov | El front con diseño C ya puede avanzar contra un servidor simulado generado del OpenAPI, así que no espera a B5 |

Congelar funciones el 30 de noviembre, como estaba.

## 16. Definición de "backend listo"

- Los casos de uso Must (01 a 14 y 18) pasan sus pruebas.
- La API está desplegada en Vercel con `/health` y la documentación OpenAPI.
- Los datos de demostración cargan con un comando.
- La reconciliación se verificó contra testnet.
- CI en verde.
- Una sección de backend en el README.

## 17. Antes de ejecutar (lo que necesita Jorge)

Estado al 23 nov:

1. ✅ Plan aprobado; B0 en marcha.
2. ✅ **Supabase** (cuenta aparte, proyecto `iasvqinlafmpqjkwckup`): claves y `DATABASE_URL` guardadas fuera del repo; conexión probada.
3. ⏳ **Vercel:** `vercel login` y conectar el repo, con OK para desplegar.
4. ⏳ `rustup target add wasm32v1-none` (para desplegar el contrato).
5. ✅ **Cuentas de testnet** `comprador` (`GABXMVQF…4IELCKU3`) y `proveedor` (`GCKU5G3M…SUWWVQTY`), fondeadas e importadas en Varial. Las llaves están en la CLI de Stellar, fuera del repo.
6. ⏳ Clave gratuita de **Gemini** (solo para B6).
7. ✅ Hub: inscripción hecha. ⏳ Registro del repo (25 nov).

## 18. Riesgos y verificaciones pendientes

- Firma del reto con secuencia 0 en Varial (B3).
- Forma de la clave de datos de la oferta en el contrato (B3 y B5).
- Tope del cuerpo de las funciones de Vercel y su duración máxima en tu plan.
- El XML de factura real puede no traer la fecha de vencimiento.
- El RUC no se verifica con SUNAT (declarado).
