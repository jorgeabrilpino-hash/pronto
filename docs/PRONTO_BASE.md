# PRONTO — Base teórica y técnica

> Documento fuente para la ejecución con Claude Code. Si algo del código contradice este documento, manda este documento (o se actualiza aquí primero).
> Buildathon Stellar Codember Perú 2026 · Participante único: Jorge (peruano, cumple elegibilidad) · Entrega: 4 dic 2026.
> **Revisión 18 nov 2026:** se aplican los ajustes A–E de `docs/ANALISIS.md` §6 (USDC de testnet como activo principal, solo facturas no vencidas, M14 eliminado). El plan de sesiones vive en `docs/ROADMAP.md`.

---

## 0. Pronto en una línea

El **comprador** ofrece a su proveedor pagarle **hoy** una factura ya aprobada a cambio de un **descuento explícito**. El dinero queda reservado en un contrato Soroban, y el proveedor cobra en la **misma transacción** en que acepta.

**Cómo resuelve Stellar el problema (2 oraciones, Fase 2 de la guía):** el contrato retiene el neto que reserva el comprador y lo libera al proveedor de forma atómica cuando este firma, así la aceptación nunca se queda en una promesa de pago. Ambas partes verifican la reserva y el pago en el explorador sin depender de la conciliación bancaria del otro.

---

## 1. Problema

| Hecho | Dato | Fuente |
|---|---|---|
| Plazo legal | Las facturas MYPE deben pagarse en máx. 30 días calendario | Ley 31362 |
| Realidad | Muchas pymes cobran a 60, 90 e incluso 120 días | Revista Economía |
| Volumen del mercado de liquidez | S/ 27 019 millones en facturas negociables al 1.er semestre 2026 (+14,6 %) | PRODUCE |
| Quién lo usa | 84,5 % de las empresas usuarias de facturas negociables son MYPE (jun. 2026) | PRODUCE |

**El dolor concreto:** la imprenta ya entregó, el cliente ya dio la conformidad y **tiene caja**, pero paga a 30 días o más por política de tesorería. El proveedor necesita liquidez hoy y solo tiene dos salidas: esperar, o hacer factoring con un tercero (costos, trámite, y a veces el cliente le pide que no negocie la factura).

**Lo que NO sabemos todavía (decirlo con honestidad):** no hay entrevistas ni compradores confirmados. La demanda es una hipótesis. No usar el volumen de factoring como "mercado de Pronto": son instrumentos distintos.

---

## 2. Solución

1. El comprador carga una obligación **ya aprobada** (factura con conformidad) e invita al proveedor.
2. Define el descuento y la vigencia de la oferta, y **reserva el neto** en el contrato (firma con su billetera).
3. El proveedor ve: fecha original de pago, importe original, descuento, neto hoy y **costo anualizado**. Puede **aceptar** o **esperar** el pago original (esta opción siempre debe estar visible).
4. Si acepta, el contrato le transfiere el neto en la misma operación y marca la oferta como ejecutada. Un segundo intento falla.
5. Si la oferta vence sin aceptación, el comprador **recupera** la reserva y su obligación original sigue igual.
6. Ambos reciben un comprobante con el hash de la transacción. El comprador exporta un CSV para tesorería.

**Posicionamiento (repetir en README y video):** *financia el comprador, sin inversionistas, sin rendimientos prometidos, no es factoring.* La financiación de facturas con inversionistas ya está muy poblada en Soroban (InvoiceX, PayVault, LiquiFact…); Pronto no compite ahí.

**Por qué le conviene al comprador:** obtiene un descuento sobre su cuenta por pagar a cambio de usar caja ociosa, y fortalece a su cadena de proveedores. **Al proveedor:** liquidez inmediata, con el costo claro y sin trámite con terceros.

---

## 3. Actores

| Actor | Qué hace | Identidad en el MVP |
|---|---|---|
| Comprador (tesorería) | Carga obligaciones, crea y financia ofertas, recupera las vencidas, exporta CSV | Billetera Stellar + registro en la base |
| Proveedor (MYPE) | Ve ofertas, acepta o espera, descarga comprobante | Billetera Stellar + registro en la base |
| Contrato `pronto_offer` | Custodia la reserva, valida y ejecuta | Contrato en testnet |
| Reconciliador | Confirma en la red y actualiza la base | Función del frontend/backend que lee el contrato |

Para la demo: dos cuentas de testnet (una comprador, una proveedor) en la billetera.

---

## 4. Lógica de negocio

### 4.1 Fórmulas

Montos en unidades de prueba con 7 decimales (en el contrato: `i128`, `1.0000000 = 10_000_000`).

```
descuento          = importe_original − neto
tasa_descuento     = descuento / importe_original
dias_anticipados   = fecha_pago_original − fecha_aceptación      (en días)
costo_anualizado   = (descuento / neto) × (365 / dias_anticipados)  (interés simple)
```

Ejemplo canónico (usarlo en la UI, tests y video):
importe original S/ 1 000 · descuento S/ 15 · neto S/ 985 · 30 días antes
→ tasa 1,5 % · **costo anualizado ≈ 18,5 %**.

La UI calcula el costo anualizado con la fecha de **hoy** y lo muestra antes de aceptar. Si `dias_anticipados ≤ 0`, la oferta no tiene sentido: no se puede crear.

### 4.2 Reglas (invariantes)

1. `0 < neto < importe_original`: siempre hay descuento, nunca uno total. *(contrato)*
2. Comprador ≠ proveedor. *(contrato)*
3. `ahora < vencimiento_oferta ≤ ahora + 30 días`. *(contrato)*
4. La vigencia de la oferta debe terminar **antes** de la fecha de pago original. Solo se ofertan facturas **no vencidas**, cuya fecha de pago original no supera el plazo legal de 30 días o el plazo mayor pactado conforme a la Ley 31362: Pronto adelanta un pago dentro del plazo, no cobra descuento sobre una deuda en mora. *(base de datos/UI)*
5. Una obligación tiene **como máximo una oferta abierta o aceptada**. *(clave única en la base)*
6. Un `offer_id` no se reutiliza nunca, ni tras aceptar. *(contrato)*
7. Solo el proveedor designado acepta; solo el comprador recupera. *(contrato, `require_auth`)*
8. Solo se acepta antes del vencimiento; solo se recupera desde el vencimiento. *(contrato)*
9. Aceptar y pagar ocurren en la misma transacción. Si la transferencia falla, nada cambia. *(contrato)*
10. El estado en la red es la verdad. La base de datos es un espejo y se corrige leyendo el contrato. *(reconciliador)*

### 4.3 Máquina de estados

```
                 create_offer (comprador firma, reserva neto)
   [Borrador] ──────────────────────────────────────────► [Abierta]
   (solo en BD)                                             │   │
                         accept (proveedor, antes de vencer)│   │ ahora ≥ vencimiento
                                                            ▼   ▼
                                                    [Aceptada] [Vencida]  ← estado calculado en UI
                                                                  │
                                                                  │ reclaim (comprador)
                                                                  ▼
                                                             [Recuperada]
```

- En la red solo existen `Open`, `Accepted` y `Reclaimed`. **Vencida** = `Open` con `ahora ≥ expires_at` (se calcula en la UI).
- `Aceptada` y `Recuperada` son finales.

### 4.4 Casos límite que la app debe manejar

| Caso | Comportamiento |
|---|---|
| Segundo clic en "Aceptar" o doble pestaña | El contrato devuelve `NotOpen`; la UI muestra "Esta oferta ya fue cobrada" |
| Aceptar justo al vencer | `Expired`; la UI ofrece volver a la lista |
| Comprador sin saldo suficiente | La simulación falla; mensaje "Saldo insuficiente para reservar" |
| El navegador se cierra tras firmar | Al volver, se reconsulta `get_offer(offer_id)` y el hash guardado |
| La transacción queda pendiente | Consultar `getTransaction` con tiempo límite; no marcar éxito sin `SUCCESS` |
| Testnet reiniciado | El contrato desaparece; volver a desplegar y actualizar el ID (verificar antes del video) |

### 4.5 Códigos de error del contrato → mensajes de UI

| Código | Error | Mensaje |
|---|---|---|
| 1 | OfferExists | Ya existe una oferta para esta factura |
| 2 | OfferNotFound | No encontramos la oferta en la red |
| 3 | InvalidAmount | El neto debe ser menor que el importe original y mayor que cero |
| 4 | InvalidExpiry | La vigencia debe ser futura y de máximo 30 días |
| 5 | NotOpen | Esta oferta ya fue cobrada o recuperada |
| 6 | Expired | La oferta venció; ya no se puede aceptar |
| 7 | NotExpired | Aún no vence; podrás recuperarla desde {fecha} |
| 8 | SameParty | Comprador y proveedor no pueden ser la misma cuenta |

---

## 5. Data importante

### 5.1 Qué va en la red y qué no

| En la red (contrato) | Solo fuera de la red (base de datos) |
|---|---|
| `offer_id` aleatorio de 32 bytes | Razón social, RUC |
| Direcciones de comprador y proveedor | Número y serie de factura, PDF |
| Importe original y neto | Fecha de conformidad, fecha de pago original |
| Vencimiento de la oferta (timestamp) | Vínculo obligación ↔ `offer_id` |
| Estado y eventos | Hashes de transacción, comprobantes |

`offer_id` **no** deriva de la factura (por ejemplo, un hash del RUC): así nadie puede vincular datos públicos con la empresa.

### 5.2 Modelo de datos (Supabase)

```
companies       id, role('buyer'|'supplier'), legal_name, ruc, wallet_address (único)
obligations     id, buyer_id → companies, supplier_id → companies,
                invoice_series, invoice_number, face_amount (numeric 7 dec),
                conformity_date, original_due_date, created_at
                ÚNICO (buyer_id, supplier_id, invoice_series, invoice_number)
offers          id, obligation_id → obligations,
                offer_id_hex (único, 64 hex), net_amount, discount_amount,
                expires_at, chain_status('open'|'accepted'|'reclaimed'),
                tx_create, tx_accept, tx_reclaim, updated_at
                ÚNICO PARCIAL: una sola oferta por obligation_id con chain_status IN ('open','accepted')
```

Montos: en la base como `numeric(20,7)` o texto decimal; en TypeScript como `bigint` o cadena. **Nunca `Number`** para montos.

### 5.3 Métricas del piloto (para el video y el pitch)

Días de cobro adelantados por proveedor · costo por sol anticipado · % de ofertas aceptadas · tiempo de conciliación · reclamos. En la demo se muestran: días adelantados, costo anualizado y estado/hash.

---

## 6. Modelo de negocio

- **Cliente que paga:** el comprador recurrente con caja disponible y muchos proveedores pequeños.
- **Precio (hipótesis):** tarifa de software mensual por comprador; la integración contable, como servicio aparte.
- **Lo que no hacemos:** no captamos fondos de inversionistas, no prometemos rendimientos, no cobramos un porcentaje del dinero movido (esto también nos mantiene fuera de lo prohibido por las bases).
- **Escenario ilustrativo:** 5 compradores × 20 facturas × 30 % de aceptación = 30 pagos al mes, que con S/ 1 000 promedio son S/ 30 000 de flujo. A S/ 150 por comprador, los ingresos son S/ 750 al mes. Volumen procesado ≠ ingreso.
- **Señal para avanzar:** un comprador quiere fondear un piloto y sus proveedores eligen la oferta voluntariamente tras ver el costo.
- **Señal para descartar el segmento:** si el comprador atrasa los pagos por falta de caja, no es cliente.
- **Escala:** más proveedores del mismo comprador, luego un segundo comprador del mismo sector, luego otra industria.

---

## 7. Arquitectura técnica

### 7.1 Stack (alineado con la guía)

| Capa | Herramienta |
|---|---|
| UI | Vite + React + TypeScript (esqueleto inicial con v0/Bolt/Lovable, opcional) |
| Billetera | `@creit-tech/stellar-wallets-kit` (con Varial Wallet o Freighter), red TESTNET |
| Red | `@stellar/stellar-sdk@^17.4.0`, `rpc.Server('https://soroban-testnet.stellar.org')` |
| Contrato | Rust + soroban-sdk 29.0.1 → `contracts/pronto_offer` (**hecho, 11 pruebas**) |
| Cliente del contrato | Bindings TypeScript generados con `stellar contract bindings typescript` |
| Datos | Supabase (Postgres) |
| Deploy | Vercel |
| Explorador | stellar.expert/explorer/testnet |
| Activo | **Principal:** USDC de testnet envuelto (SAC), `stellar contract id asset --asset USDC:<EMISOR_TESTNET> --network testnet` (requiere trustline). **Respaldo:** XLM nativo envuelto, `stellar contract id asset --asset native --network testnet`. Un despliegue del contrato por activo |

### 7.2 Interfaz del contrato (ya implementada)

```
__constructor(token: Address)
create_offer(offer_id: BytesN<32>, buyer, supplier, face: i128, net: i128, expires_at: u64)
accept(offer_id)              → transfiere net al proveedor
reclaim(offer_id)             → devuelve net al comprador
get_offer(offer_id) -> Offer { buyer, supplier, face, net, expires_at, status }
token() -> Address
Eventos: OfferCreated, OfferAccepted, OfferReclaimed (topic: offer_id)
```

### 7.3 Flujo de una transacción (obligatorio en Soroban)

```
getAccount(pubkey) fresco → construir tx (setTimeout 180)
→ simulateTransaction → assembleTransaction → firmar con Wallets Kit
→ sendTransaction → consultar getTransaction hasta SUCCESS/FAILED (con límite)
→ get_offer(offer_id) → actualizar Supabase
```

### 7.4 Reconciliación (versión para una sola persona)

No hay un job programado. La fuente de verdad es el contrato:
- Tras cada transacción con `SUCCESS`: leer `get_offer` y actualizar `offers`.
- Al abrir cualquier lista: para cada oferta `open` en la base, releer `get_offer` y corregir si difiere.

---

## 8. Módulos de construcción (1 prompt = 1 módulo = 1 responsabilidad)

Orden de menor a mayor complejidad. **Must** = sin esto no hay entrega. **Should** = suma puntos. **Could** = solo si sobra tiempo.

| # | Módulo | Hace | Entrada → Salida | Depende de | Prioridad |
|---|---|---|---|---|---|
| M0 | Despliegue del contrato | build, deploy en testnet con el SAC, guardar el ID | wasm → `CONTRACT_ID` en `.env` y README | — | Must |
| M1 | Bindings TS | Generar el cliente tipado del contrato | `CONTRACT_ID` → paquete `src/contract` | M0 | Must |
| M2 | Conexión de billetera | Botón conectar/desconectar, dirección truncada, red testnet | — → `{publicKey, isConnected, kit}` | — | Must |
| M3 | Saldo | Hook `useBalance` (bigint, 7 decimales) | publicKey → `{balance, loading, error}` | M2 | Should |
| M4 | Utilidades de negocio | Cálculo de descuento, neto, costo anualizado; conversión decimal↔i128; mapa de errores | números → valores formateados | — | Must |
| M5 | Servicio de transacciones | `createOffer`, `acceptOffer`, `reclaimOffer`, `getOffer` con el patrón 7.3 | args → `{ok, txHash?, error?}` | M1, M2 | Must |
| M6 | Esquema Supabase | Tablas, claves únicas, tipos | — → migraciones | — | Must |
| M7 | Vista comprador | Cargar obligación, definir oferta, financiar, lista con estados, recuperar | UI | M4, M5, M6 | Must |
| M8 | Vista proveedor | Ver ofertas, comparar "esperar vs. cobrar hoy", aceptar | UI | M4, M5, M6 | Must |
| M9 | Reconciliación | Releer el contrato y corregir la base (7.4) | offers → offers corregidas | M5, M6 | Must |
| M10 | Comprobante | Vista/descarga con datos, hash y enlace al explorador | offer → comprobante | M9 | Should |
| M11 | Exportar CSV | CSV de tesorería del comprador | offers → .csv | M6 | Should |
| M12 | Deploy Vercel | Variables de entorno, URL pública | — → URL | todos | Must |
| M13 | README y video | Completar README según bases; guion; grabación | — → entregables | todos | Must |
| ~~M14~~ | ~~Activo propio~~ | Eliminado: lo reemplaza USDC de testnet (ajuste A) | — | — | — |

**Plan de recorte si vas atrasado al 26 nov:** sacar Supabase (M6/M9) y guardar obligaciones en `localStorage` leyendo estados del contrato. Se pierden la clave única y el CSV, pero la demo sigue completa.

---

## 9. Calendario por las 7 fases de la guía (solo)

| Fase de la guía | Módulos | Fecha objetivo |
|---|---|---|
| 01 Investiga con IA · 02 Define tu idea | Este documento | 18 nov ✅ |
| — Inscripción en el Hub + repo público + primer commit | — | 19 nov |
| 05 (adelantada) Contrato en testnet | M0, M1 | 19–20 nov |
| — **Registrar el repositorio en el Hub** (oficial: 25 nov, 11:59 p. m.) | — | 20 nov |
| 03 Genera tu UI base | Esqueleto de rutas `/comprador` y `/proveedor` | 20–21 nov |
| 04 Conecta tu wallet | M2, M3 | 21 nov |
| 05 Integra Stellar RPC | M4, M5, M6, M7, M8 | 22–26 nov |
| 05 (cont.) | M9, M10, M11 | 27–29 nov |
| 06 Sube y despliega | M12 (desplegar temprano y redesplegar seguido) | 27 nov en adelante |
| **Congelar funciones** | Solo correcciones y documentación | 30 nov |
| Revisión: `cargo scout-audit`, checklist pre-deploy, prueba de extremo a extremo | — | 1–2 dic |
| 07 Graba tu demo | M13 | 3 dic |
| **Entrega en APEX** (límite 11:59 p. m.) | — | 4 dic, en la mañana |
| Demo Day UTEC (o video pitch) | — | 5 dic, 9:00 a. m. |

---

## 10. Trampas de la guía que aplican a Pronto

- `tx_bad_seq`: recargar la cuenta antes de cada transacción. No disparar dos transacciones en paralelo desde la misma cuenta.
- `tx_too_late`: `setTimeout(180)`. Si falla, reconstruir con la cuenta fresca y no reutilizar el XDR.
- Simular siempre antes de enviar una llamada al contrato.
- 7 decimales: S/ 1 000 de prueba = `10_000_000_000` en `i128`.
- `op_no_trust`: aplica con USDC. Comprador y proveedor necesitan la trustline de USDC antes de operar; la UI ofrece "Activar USDC" (`changeTrust`). No aplica a la instancia de respaldo con XLM.
- Reinicio del testnet: guardar los IDs fuera de la red y verificar el contrato en el explorador antes de grabar.

---

## 11. Checklist de entrega (bases oficiales)

- [ ] Inscripción individual en el Hub con usuario de GitHub (cierre 24 nov)
- [ ] Repo público registrado en el Hub (cierre 25 nov) — sin esto no hay entrega
- [ ] Historial de commits dentro del 14 nov – 4 dic (commits pequeños y frecuentes)
- [ ] Contrato desplegado en testnet, con ID y enlace a stellar.expert
- [ ] README: problema, solución, arquitectura, cómo ejecutar, ID del contrato, integrante, uso de IA y código previo, librerías de terceros
- [ ] Video ≤ 3 min (YouTube no listado, Drive o Loom con acceso abierto)
- [ ] URL de la app desplegada
- [ ] Declarar el uso de Claude Code en el README (generación de código, pruebas, documentación)
- [ ] Nada especulativo: sin tokens de inversión ni rendimientos (Pronto cumple)

---

## 12. Guion del video (3:00)

| Tiempo | Bloque | Pantalla |
|---|---|---|
| 0:00–0:15 | Gancho: "La ley dice 30 días. Muchas pymes cobran a 90." | Texto + dato |
| 0:15–0:45 | Solución: el comprador ofrece pagar hoy con descuento visible; el proveedor decide | Diagrama simple |
| 0:45–2:15 | Demo: el comprador crea y financia la oferta → el proveedor ve neto y 18,5 % anual → acepta y cobra → saldo y hash en el explorador → segundo intento rechazado → otra oferta vencida, recuperada | App en vivo en testnet |
| 2:15–2:40 | Por qué Stellar: reserva y pago en una operación atómica, comisiones bajas, verificable por ambos | Explorador |
| 2:40–3:00 | Cierre: piloto con 1 comprador y 3 proveedores; financia el comprador, no es factoring | Logo + URL |

---

## 13. Fuera de alcance (no construir)

Integración contable o con SUNAT · verificación de cesión externa de la factura · conversión a soles o anchors · recuperación de cuentas · notificaciones por correo o WhatsApp · múltiples monedas · login con correo (la billetera es la identidad).
