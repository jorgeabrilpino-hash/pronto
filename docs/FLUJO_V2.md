# Pronto — Flujo V2: código de empresa, QR y factura adjunta

> 21 nov 2026. Propuesta de Jorge, analizada y completada. **Reemplaza las secciones 3 a 6 y 9 de `docs/FLUJOS_Y_UX.md`**; el resto de ese documento sigue vigente (principios, sistema visual, Stellar visible, errores, IA). Pendiente de aprobación.

## 1. Qué cambia

| Antes (V1) | Ahora (V2) | Por qué |
|---|---|---|
| Invitación por enlace externo | **Código Pronto + QR + RUC exacto**, dentro de la app | Familiar (como Yape o Plin) y sin salir de la app |
| Un rol por billetera | **Una empresa con dos pestañas: Por cobrar y Por pagar** | En la vida real una empresa compra y también vende |
| El comprador escribía la factura | **La carga quien la emite: el proveedor**, con su documento | Es quien tiene la factura |
| Lista "Mis proveedores" | **Contactos** (Mis clientes y Mis proveedores) que se arma solo | Sin buscador global |

El enlace de invitación solo queda para un cliente que **todavía no está en Pronto**.

## 2. Identidad de la empresa

- **Registro:** conectar billetera, RUC (11 dígitos, con dígito verificador), razón social y rubro. Un RUC, una empresa y una billetera, los tres únicos.
- Al registrarse recibe su **Código Pronto** (ej. `PR-7K4Q2M`: 6 caracteres sin letras ni números que se confundan) y su **QR**, que abre `/e/PR-7K4Q2M`.
- Una empresa se ubica de tres formas, siempre por dato exacto (no hay buscador): **escanear su QR**, **escribir su código** o **escribir su RUC**.
- **Límite declarado:** no verificamos con SUNAT que el RUC pertenezca a quien lo registra (etapa 2).

## 3. Flujo principal, con el ejemplo de la imprenta

1. La imprenta (proveedor) pulsa **"+ Nueva factura"**.
2. **Cliente:** escanea el QR, escribe el código o escribe el RUC. Ve "Distribuidora Yanahuara SAC · RUC 20…" y pulsa **Confirmar**. Si el cliente no está en Pronto: **Invitar a Pronto** (enlace por el canal que quiera); la factura no se envía hasta que se registre.
3. **Documento:** sube PDF, foto del celular o XML (máx. 5 MB). Con XML los datos se llenan solos; con PDF o foto se escriben.
4. **Datos:** serie y número, importe, fecha de emisión y de vencimiento. Opcional: **descuento máximo que acepta**.
5. **Enviar.** La factura aparece **solo** en "Por pagar" de ese cliente, como **Por confirmar**.
6. El cliente abre la factura, ve el documento y los datos, y pulsa **Confirmar** (o **No coincide**, con motivo).
7. El cliente pulsa **Ofrecer pago anticipado**: elige el descuento (1 %, 1,5 % o 2 %, con aviso si supera el máximo del proveedor) y la vigencia, confirma la billetera del proveedor y pulsa **Reservar** (`create_offer`).
8. El proveedor ve la oferta en "Por cobrar" y pulsa **Cobrar** (`accept`) o **Esperar**.
9. Ambos reciben el **comprobante**. Si la oferta vence, el cliente pulsa **Recuperar** (`reclaim`) y la factura vuelve a "Confirmada".

En el MVP solo el proveedor crea facturas. Sustituye a los flujos F1, F1b y F2 de V1.

## 4. Estados de la factura

Una sola máquina de estados; cada rol la ve con su propio texto.

| Estado | El proveedor ve | El cliente ve | Acciones |
|---|---|---|---|
| `sent` | Esperando confirmación | Por confirmar | Cliente: Confirmar / No coincide · Proveedor: Cancelar |
| `rejected` | Revisar (con motivo) | (oculta) | Proveedor: Corregir y reenviar / Cancelar |
| `confirmed` | Confirmada | Confirmada | Cliente: Ofrecer pago anticipado |
| Oferta abierta (red: *Open*) | Te ofrecen 985 hoy | Reservado · vence en 6 d | Proveedor: Cobrar / Esperar |
| Cobrada (red: *Accepted*) | Cobrada | Pagada | Ver comprobante |
| Oferta vencida (*Open* ya vencida) | Oferta vencida | Recuperar | Cliente: Recuperar |
| Recuperada (*Reclaimed*) | vuelve a Confirmada | vuelve a Confirmada | Se puede ofrecer de nuevo |
| `cancelled` | Cancelada | (oculta) | — |

**Regla:** con una oferta reservada no se puede cancelar ni editar la factura.

## 5. Vistas

| # | Vista | Ruta | Quién | Qué tiene | Prioridad |
|---|---|---|---|---|---|
| 1 | Inicio público | `/` | Todos | Una frase y **Entrar** | Must |
| 2 | Registro | `/registro` | Empresa nueva | RUC, razón social, rubro; al terminar, código y QR | Must |
| 3 | Fondos | `/fondos` | Todos | Fondos de prueba y activar USDC | Must |
| 4 | Inicio con pestañas | `/app` | Empresa | **Por cobrar · Por pagar**, "Requiere tu acción" arriba, totales y "+ Nueva factura" | Must |
| 5 | Nueva factura (3 pasos) | `/facturas/nueva` | Proveedor | Cliente → Documento → Datos | Must |
| 6 | Detalle por cobrar | `/cobrar/:id` | Proveedor | Estado, documento y oferta con **Cobrar / Esperar** | Must |
| 7 | Detalle por pagar | `/pagar/:id` | Cliente | Documento, **Confirmar / No coincide**, **Ofrecer pago** | Must |
| 8 | Nueva oferta | `/pagar/:id/oferta` | Cliente | Descuento en %, vigencia, billetera del proveedor, **Reservar** | Must |
| 9 | Operación en la red | Hoja sobre la pantalla | Ambos | Preparar → Firmar → Enviar → Confirmado, con código de operación | Must |
| 10 | Comprobante | `/comprobante/:offerId` | Ambos | Monto, "pago total de F001-123", hash, PDF | Must |
| 11 | Mi código | `/mi-codigo` | Empresa | QR grande, código, copiar, compartir, **Escanear** | Should |
| 12 | Contactos | `/contactos` | Empresa | Mis clientes / Mis proveedores, con código y ficha | Should |
| 13 | Página de empresa | `/e/:code` | Cualquiera (destino del QR) | Nombre, RUC, ficha y **Enviar factura** | Should |
| 14 | Carga por Excel | `/facturas/lote` | Proveedor | Plantilla, subir, revisar filas, enviar | Could |
| 15 | Pronto en la red | `/red` | Cualquiera | Diagrama, contrato, últimas operaciones | Must (demo) |
| 16 | Ajustes | `/ajustes` | Empresa | Datos, ficha pública sí/no, desconectar | Should |

## 6. Documentos adjuntos

- **Tipos:** PDF, JPG o PNG (foto del celular) y XML de factura electrónica. Excel o CSV solo para la carga en lote. Máximo 5 MB; un documento por factura, más el XML opcional.
- **Privacidad:** almacenamiento privado; solo lo ven el proveedor y el cliente de esa factura.
- **Lectura:** el XML llena los datos de forma exacta. Con PDF o foto los datos se escriben a mano (sin IA, decisión vigente). Si el XML y lo escrito no coinciden, manda el XML y se avisa.
- **Nada de esto va a la red:** en Stellar solo van montos, direcciones y vencimiento (sin cambios).

## 7. Casos límite nuevos (se suman a `FLUJOS_Y_UX.md` §8)

| Situación | Qué pasa |
|---|---|
| El código o el RUC no existe | "No encontramos esa empresa" + **Invitar a Pronto** |
| Te elegiste a ti mismo | "No puedes enviarte una factura" (el contrato también lo bloquea: `SameParty`) |
| El RUC ya está registrado con otra billetera | "Este RUC ya está en Pronto" (soporte fuera de alcance) |
| Factura duplicada (mismo proveedor, serie y número) | "Ya enviaste esta factura" |
| La factura ya venció | "Esta factura ya venció" (no se envía) |
| Archivo de tipo o tamaño no permitido | "Sube PDF, foto o XML de hasta 5 MB" |
| El cliente marca No coincide | El proveedor ve el motivo, corrige y reenvía |
| El proveedor quiere cancelar con oferta reservada | No se puede: hay que esperar a que se cobre o venza |
| Facturas no deseadas | El cliente las rechaza; bloquear empresa (Could) |
| Fila del Excel con error | Se marca la fila y se envían solo las válidas |

## 8. Modelo de datos (reemplaza lo que cambia de `FLUJOS_Y_UX.md` §9)

- `companies`: `ruc` (único), `legal_name`, `sector`, `wallet` (único), `code` (único, `PR-XXXXXX`), `ficha_publica`.
- `obligations`: `supplier_id` y `buyer_id` (ambos obligatorios), `invoice_series`, `invoice_number`, `face_amount`, `issue_date`, `original_due_date`, `max_discount_pct`, `status` (`sent` | `rejected` | `confirmed` | `cancelled`), `rejection_reason`. Único: (`supplier_id`, serie, número).
- `attachments`: `id`, `obligation_id`, `kind` (`pdf` | `image` | `xml`), `storage_path`, `mime`, `size_bytes`, `uploaded_by`.
- `offers`: sin cambios (`pending` | `open` | `accepted` | `reclaimed` | `failed`, índice único parcial).
- **Contactos:** vista derivada de `obligations` (pares proveedor–cliente).
- `invites` (solo clientes no registrados): `id`, `from_company`, `target_ruc`, `token_hash`, `expires_at`.
- Almacenamiento privado con permisos por empresa, usando la misma identidad por firma de billetera.

## 9. Prioridad para la entrega

- **Must:** vistas 1 a 10 y 15.
- **Should:** vistas 11, 12, 13 y 16, más el autollenado por XML.
- **Could:** vista 14 (Excel) y bloquear empresa.
- El plan de recorte del roadmap sigue igual.
