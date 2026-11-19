# Pronto — Flujos y experiencia de uso

> Estado: propuesta del 19 nov 2026, **pendiente de la aprobación de Jorge** (GATE: sin aprobación de los mockups no se escribe código de pantallas).
> Aquí manda el flujo. Reglas de negocio: `docs/PRONTO_BASE.md` §4. Decisiones de producto: `docs/ROADMAP.md` §0.

---

## 1. Principios de interfaz

1. **Una pantalla, una decisión, un botón principal.**
2. **Cifras primero.** Un número grande, una línea de contexto, un botón. Lo demás, detrás de un toque ("Ver detalle", "Ver en la red").
3. **Poco texto.** Verbos directos: *Reservar, Cobrar, Esperar, Recuperar*. Sin tutoriales, sin chat, sin párrafos. Un error es una frase y un botón.
4. **Móvil primero.** El proveedor entra desde el celular. El comprador (tesorería) lo usa también en escritorio.
5. **Lenguaje simple en pantalla, lenguaje técnico en "Ver en la red".** *Código de operación* en vez de hash, *Activar USDC* en vez de trustline.
6. **Stellar siempre visible** (sección 7): es lo que evalúa el jurado.
7. **Accesible:** contraste AA, objetivos táctiles de 44 px o más, estados con icono y texto (no solo color).

## 2. Sistema visual mínimo

| Elemento | Propuesta | Por qué |
|---|---|---|
| Tema | **Claro cálido** por defecto (fondo `#FAFAF7`, texto `#0F0F0F`). Oscuro opcional si sobra tiempo | Se lee mejor en celular y bajo luz; el Hub ya es oscuro y así Pronto se distingue |
| Acento | **Amarillo Stellar `#FDDA24` solo en el botón principal**, con texto negro (contraste ≈ 14:1) | Un solo punto de atención por pantalla |
| Estados | Abierta (amarillo claro) · Cobrada (verde) · Vencida (gris) · Recuperada (gris azulado) · Error (rojo). Siempre con icono | No depender del color |
| Tipografía | **Geist Sans** para la interfaz y **Geist Mono** para montos, fechas y códigos, con cifras tabulares (`tabular-nums`). Ambas en Google Fonts; de respaldo, `system-ui` | Montos que alinean bien y se leen rápido |
| Escala | Monto 40/32 px semibold · título 20 · cuerpo 16 · secundario 14 · mínimo 12 solo para códigos | Jerarquía clara sin adornos |
| Forma | Radio 12 px, un borde fino, sin sombras fuertes, espacio en múltiplos de 8 | Minimalista |
| Iconos | Una sola librería (Lucide) | Coherencia |
| Moneda en pantalla | **USDC** (activo de prueba), p. ej. "985 USDC". Los ejemplos en soles de los documentos son ilustrativos; la conversión a soles está fuera de alcance | Evita mostrar soles que no existen en la red |

La decisión final de estilo se confirma con los mockups de S2.

## 3. Mapa de pantallas

| Ruta | Pantalla | Quién |
|---|---|---|
| `/` | Inicio | Todos |
| `/perfil` | Datos de la empresa (primera vez) | Todos |
| `/fondos` | Preparar la cuenta (fondos, USDC) | Todos |
| `/i/:token` | Invitación (para la otra parte) | Comprador o proveedor |
| `/comprador` | Panel | Comprador |
| `/comprador/nueva` | Nueva factura | Comprador |
| `/comprador/oferta/:obligationId` | Oferta (crear, esperar, recuperar) | Comprador |
| `/comprador/lote` | Carga por CSV (Should) | Comprador |
| `/proveedor` | Panel "Para ti" | Proveedor |
| `/proveedor/pedir` | Pedir pago anticipado | Proveedor |
| `/proveedor/oferta/:offerId` | Cobrar | Proveedor |
| `/comprobante/:offerId` | Comprobante | Ambos |
| `/ficha/:address` | Ficha pública del comprador | Cualquiera |
| `/red` | Pronto en la red | Cualquiera |

Barra superior en todas: logo · chip **Testnet** (lleva a `/red`) · chip de billetera (`G…ABCD`, con "Desconectar"). Sin menús ni barra inferior: cada rol tiene un panel y una acción.

## 4. Pantallas: qué muestran

Formato: dato grande · botón principal (amarillo) · botón secundario (texto).

### Compartidas
- **Inicio:** frase de cinco palabras ("Cobra o paga antes, sin vueltas") · botones **Soy comprador** / **Soy proveedor** · enlace "Ver cómo funciona en Stellar" (`/red`).
- **Perfil:** dos campos, *Razón social* y *RUC* (11 dígitos, con dígito verificador) · **Continuar**. El rol aparece como una etiqueta fija.
- **Fondos:** lista de lo que falta, cada ítem con su botón. Comprador: *Cuenta activa* (**Obtener fondos de prueba**) y *USDC* (**Activar USDC**). Proveedor: *USDC* (**Activar USDC**). Al completar, pasa solo al panel.
- **Comprobante:** check grande · monto · "Pago total de la factura F001-123" · partes (nombre corto) · fecha · **Ver en la red** · **Descargar PDF** (vista de impresión).
- **Ficha del comprador:** nombre · 4 cifras (ofertas financiadas, % aceptado, días adelantados en promedio, proveedores distintos) · "Desde <mes>". Solo si `ficha_publica`.

### Comprador
- **Panel:** dos cifras ("Ahorro", "Reservado") · lista de facturas (proveedor, factura, monto, estado) · **+ Nueva factura** · secundarios: *Cargar varias*, *Exportar CSV*, *Mi ficha*. Vacío: "Aún no hay facturas" + el botón.
- **Nueva factura:** **Subir XML** (rellena todo) o cuatro campos: *Proveedor* (RUC), *Factura* (serie-número), *Importe*, *Emitida / Vence* · **Crear enlace**. Luego una hoja con **Copiar enlace** y **Enviar por WhatsApp**.
- **Oferta:** una línea de contexto ("ACME SAC · F001-123 · 1 000 USDC · vence 18 dic") · selector de tasa (atajos 12 / 18 / 24 % y deslizador) · dato grande **"Pagas hoy 985"** y "Ahorras 15 · Costo anual 18,5 %" · vigencia (3 / 7 / 15 días, solo las que terminan antes del vencimiento) · confirmación de billetera del proveedor (*ACME SAC · G…ABCD*) · **Reservar 985 USDC**. Una línea fija: "Podrás recuperarlo al vencer".
  - *Reservada:* cuenta regresiva + **Ver en la red**.
  - *Vencida:* **Recuperar 985 USDC**.
  - *Cobrada:* **Ver comprobante**.

### Proveedor
- **Panel "Para ti":** tarjetas de oferta ("**985 hoy** · o 1 000 el 18 dic" · cliente · vence en 6 d) · **Pedir pago anticipado**. Vacío: una línea y el botón.
- **Cobrar (la pantalla central):** dos tarjetas, **Esperar** (1 000 · 18 dic) y **Cobrar hoy** (985 · "Costo 18,5 % anual"). Una línea con la ficha del comprador (*12 ofertas · 100 % cobradas*). Encima del botón, una línea fija: "Recibo 985 como pago total de F001-123" · **Cobrar 985** · secundario **Esperar**.
- **Pedir pago anticipado:** *Cliente* (RUC), *Factura*, *Importe*, *Emitida / Vence* (o **Subir XML**) · **Descuento máximo** (deslizador con "Cobrarías hoy mínimo 985") · enlace *Referencia* (hoja con costos de crédito y factoring, con fecha y fuente) · **Crear enlace**.

### Invitación (`/i/:token`)
- Sin billetera: "ACME SAC te invita a cobrar la factura F001-123" (sin importe) · **Conectar billetera**.
- Con billetera: datos de la factura en solo lectura · **Confirmar** / **No coincide**.

## 5. Cómo se conectan comprador y proveedor

No hay buscador ni directorio. La conexión nace de **una factura que ya existe entre dos partes que ya comercian**, y se hace con un **enlace de un solo uso**.

- **Contexto compartido:** la *obligación* (factura, importe, fechas). Las dos partes ven los mismos datos, en solo lectura, antes de que se mueva dinero.
- **Doble confirmación:** quien crea la obligación escribe el RUC de la otra parte y los datos de la factura. La otra parte los **confirma** o marca **No coincide** (importe, fecha o factura). Nada avanza hasta que coinciden.
- **Verificación de RUC:** el RUC del perfil de quien abre el enlace debe ser igual al que escribió el iniciador; si no, "Este enlace es para otra empresa". No prueba propiedad, pero evita enviar a la persona equivocada.
- **Control de seguridad central:** el contrato guarda la **dirección** del proveedor al crear la oferta, y solo esa dirección puede aceptar. Por eso el comprador **confirma la billetera del proveedor** (nombre, RUC y `G…ABCD`) antes de reservar. Una confirmación equivocada enviaría el pago a un tercero.
- **Enlace:** token aleatorio de 128 bits; en la base solo se guarda su *hash*; vence a los 7 días; se reclama una sola vez (la misma billetera puede reabrirlo si se corta); el iniciador puede revocarlo. Antes de conectar, la invitación muestra lo mínimo (nombre y número de factura, sin importe).
- **Aviso:** no hay correo ni WhatsApp automáticos (fuera de alcance). El panel se actualiza solo (consulta cada 15 s) y hay botones **Enviar por WhatsApp** con un mensaje corto prellenado.
- **Un rol por billetera** en el MVP (se elige al entrar).

## 6. Flujos paso a paso

Etiquetas: **[UI]** pantalla · **[DB]** Supabase · **[RED]** Stellar.

### F0 · Entrar (todos)
1. **[UI]** Inicio → *Soy comprador* o *Soy proveedor*.
2. **[UI]** Se abre el selector de billetera (Wallets Kit, TESTNET). Sin billetera: "Instala Varial".
3. **[RED]** Se lee la dirección pública. Si la red no es testnet: "Cambia a Testnet".
4. **[UI→DB]** *Firmar para entrar*: se firma un reto sin costo (no se envía a la red) y se obtiene un acceso corto ligado a la dirección.
5. **[DB]** ¿Existe `companies` con esa dirección? Sí → su panel (si el rol elegido no coincide: "Esta cuenta es de proveedor" + *Ir a mi panel*). No → perfil.
6. **[UI→DB]** Perfil (razón social, RUC válido) → insertar `companies`.
7. **[RED]** Lectura de cuenta y saldos. Lo que falta aparece como tarea: fondos de prueba (Friendbot), trustline de USDC (`changeTrust`, una firma) y USDC de prueba.
8. Todo listo → panel.

### F1 · El comprador inicia
1. **[UI]** Panel → *+ Nueva factura* (con o sin XML).
2. **[UI]** Validaciones: RUC, formato serie-número, importe > 0, vencimiento futuro, factura no duplicada, factura **no vencida**.
3. **[DB]** Insertar `obligations` (`origin=buyer`, `status=awaiting_counterparty`, RUC de la contraparte, hash del token, vencimiento del enlace).
4. **[UI]** Hoja con enlace → *Copiar* o *WhatsApp*.
5. El proveedor completa **F1b**.
6. **[UI]** La fila pasa a "Listo para ofrecer".
7. **[UI]** *Oferta*: fija tasa y vigencia, confirma la billetera del proveedor, *Reservar*.
8. **[DB]** Antes de enviar: insertar `offers` con `chain_status=pending`, `offer_id` aleatorio de 32 bytes, neto, descuento y vencimiento.
9. **[RED]** Cuenta fresca → armar `create_offer` (`setTimeout(180)`) → **simular** (si falla, se mapea el error, nada se envía y la fila pasa a `failed`) → ensamblar → firmar → enviar → consultar `getTransaction` con límite hasta `SUCCESS`.
10. **[RED]** `get_offer` debe devolver *Open* con el mismo importe, neto y proveedor → **[DB]** `chain_status=open`, `tx_create`.
11. **[UI]** "Reservado" + cuenta regresiva + *Enviar por WhatsApp* (enlace a la oferta del proveedor).

### F1b · El proveedor recibe la invitación
1. **[DB]** `/i/:token`: validar hash, que no esté vencido, usado ni revocado.
2. **[UI]** Mínimo visible → *Conectar billetera* (F0 si es nuevo, rol proveedor).
3. **[DB]** El RUC del perfil debe igualar el de la invitación.
4. **[UI]** Datos de la factura en solo lectura → *Confirmar* o *No coincide*.
5. *Confirmar* → **[DB]** `supplier_id`, `status=confirmed`, token cerrado. Si falta la trustline: *Activar USDC*.
6. **[UI]** "Listo. Tu oferta aparecerá aquí" → *Ir al panel*.
- *No coincide:* se marca el campo; el comprador ve el aviso en la fila, corrige y el proveedor confirma de nuevo.

### F2 · El proveedor inicia
1. **[UI]** *Pedir pago anticipado* → datos de la factura, RUC del cliente, **descuento máximo**.
2. **[DB]** Insertar `obligations` (`origin=supplier`, `supplier_id` propio, `max_discount_pct`, token).
3. **[UI]** Enlace → *Copiar* o *WhatsApp* ("Te pido el pago anticipado de F001-123…").
4. El comprador abre `/i/:token`, conecta, el RUC debe igualar el escrito por el proveedor, ve los datos y el techo, *Confirmar* o *No coincide*.
5. **[DB]** `buyer_id`, `status=confirmed`.
6. **[UI]** Pasa a *Oferta*, con la tasa precargada según el techo → continúa en **F1 paso 7**. La billetera del proveedor ya se conoce; el comprador igual la confirma.

### F3 · El proveedor cobra
1. **[UI]** Panel → tarjeta → *Cobrar*.
2. **[RED]** Antes de habilitar el botón se verifica: `get_offer` = *Open*, `supplier` = mi dirección, importe y neto iguales a la obligación confirmada, ahora < vencimiento, trustline presente. Si algo falla, un mensaje específico y el botón deshabilitado.
3. **[UI]** Costo recalculado con la fecha de hoy: `(descuento / neto) × (365 / días que faltan)`.
4. **[RED]** *Cobrar*: cuenta fresca → simular (`NotOpen` y `Expired` se muestran con su mensaje) → firmar → enviar → sondear.
5. **[RED]** `get_offer` = *Accepted* → **[DB]** `chain_status=accepted`, `tx_accept`.
6. **[UI]** Comprobante.
- *Esperar:* no se hace nada; la oferta sigue abierta hasta vencer y el proveedor puede volver.

### F4 · Vencimiento y recuperación
1. **[UI]** Si `ahora ≥ expires_at` y sigue *Open*: se muestra "Vencida" (estado calculado).
2. **[UI]** El comprador: *Recuperar* (antes del vencimiento: "Podrás recuperarlo desde <fecha>", error `NotExpired`).
3. **[RED]** `reclaim` con el mismo patrón de transacción → `get_offer` = *Reclaimed* → **[DB]** `chain_status=reclaimed`.
4. **[DB]** La obligación vuelve a "Listo para ofrecer": se puede crear una oferta nueva con otro `offer_id` (el índice único solo bloquea `pending`, `open` y `accepted`).

### F5 · Reconciliación y recuperación de sesión
- Tras cada `SUCCESS` y al abrir cualquier lista: para cada oferta `pending` u `open`, releer `get_offer`.
  - `pending` y existe en la red → `open`. `pending`, no existe y pasaron más de 10 minutos → `failed`.
- Si el navegador se cierra después de firmar: el hash pendiente se guarda en la base y en `localStorage`; al volver se sondea `getTransaction` hasta un estado final. Nunca se marca éxito sin `SUCCESS`.
- **No se envían dos transacciones en paralelo** desde la misma cuenta: los botones se bloquean durante la operación.

## 7. Cómo se ve Stellar en la aplicación

1. **Estado en vivo de cada operación** (en toda transacción): *Preparar → Firmar → Enviar → Confirmado*, con el tiempo transcurrido. Al final: **código de operación** (copiar) y *Ver en stellar.expert*.
2. **"Ver en la red"** en cada oferta, para ambos roles: contrato (copiar y enlace), activo (USDC), **estado leído de la red** (`get_offer`), monto reservado, hashes de crear, aceptar y recuperar, comisión pagada y *ledger*.
3. **Chip Testnet** siempre visible → `/red`.
4. **`/red` — Pronto en la red:** diagrama de tres tiempos (*Reservar → Cobrar*; si vence, *Recuperar*) con el nombre de la función de cada paso, el ID del contrato y las últimas operaciones reales con su enlace. Es la pantalla del video.
5. **Modo demostración** (interruptor en el pie): muestra bajo cada botón principal una etiqueta técnica, por ejemplo: `create_offer · transfiere 985 USDC al contrato`.

## 8. Errores y casos límite

Cada error es **una frase y un botón**.

| Situación | Mensaje | Botón |
|---|---|---|
| Sin billetera | "Instala Varial" | Abrir Varial |
| Red distinta de testnet | "Cambia a Testnet" | Reintentar |
| Sin XLM para la comisión | "Necesitas fondos de prueba" | Obtener fondos |
| Sin trustline de USDC | "Activa USDC para continuar" | Activar USDC |
| Saldo insuficiente | "Saldo insuficiente para reservar" | Obtener USDC |
| Cancelaste la firma | "No se firmó" | Reintentar |
| `tx_bad_seq` o `tx_too_late` | (un reintento automático con cuenta fresca) "No se pudo enviar" | Reintentar |
| Sin confirmación a tiempo | "Aún confirmando…" | Revisar estado |
| Errores del contrato 1 a 8 | Los mensajes de `PRONTO_BASE.md` §4.5 | Según el caso |
| Segundo clic u otra pestaña | "Esta oferta ya fue cobrada o recuperada" | Ver comprobante |
| Aceptar justo al vencer | "La oferta venció" | Volver |
| Enlace inválido, usado o revocado | "Este enlace ya no es válido" | Pedir otro |
| RUC distinto | "Este enlace es para otra empresa" | Volver |
| Factura duplicada | "Ya cargaste esta factura" | Ver factura |
| Factura ya vencida | "Esta factura ya venció" | Volver |
| Faltan 1 día o menos | "Faltan muy pocos días para ofrecer" | Volver |
| Datos distintos a la red | "Los datos no coinciden con la red" (botón de cobrar bloqueado) | Actualizar |
| La red no responde | "La red no responde" | Reintentar |
| Cambiaste de cuenta a mitad | "Cambiaste de cuenta" | Volver a la correcta |
| Oferta supera el techo del proveedor | Aviso "Supera el descuento máximo de ACME (1,5 %)" (permite continuar) | Reservar igual |

## 9. Cambios al modelo de datos (para S4)

- `companies`: + `sector` (texto, nullable), + `ficha_publica` (boolean, por defecto `true`). Dirección única.
- `obligations`: + `origin` (`buyer` | `supplier`), + `status` (`awaiting_counterparty` | `confirmed` | `cancelled`), + `counterparty_ruc`, + `invite_token_hash`, + `invite_expires_at`, + `claimed_by_wallet`, + `mismatch_field` (nullable), + `max_discount_pct` (nullable), + `issue_date`. Estados de pantalla (*Esperando proveedor*, *Listo para ofrecer*, *Abierta*, *Cobrada*, *Vencida*, *Recuperada*) se **calculan** combinando `obligations.status` y `offers.chain_status`.
- `offers`: `chain_status` ahora `pending` | `open` | `accepted` | `reclaimed` | `failed`; + `annual_rate_bps` (la tasa elegida). **Índice único parcial:** una oferta en `pending`, `open` o `accepted` por obligación.
- **Vista `v_buyer_ficha`:** ofertas financiadas, % aceptado, días adelantados promedio, proveedores distintos, fecha de la primera.
- **Acceso sin correo:** reto firmado con la billetera (estilo SEP-10) → acceso corto con la dirección como dato → permisos de la base por dirección. La invitación se lee con el token. **Plan alterno si se atrasa:** función con clave de servicio que valida el token y expone solo campos mínimos.
- La clave de servicio **nunca** va en el repositorio ni en el navegador (solo en las variables de Vercel).

## 10. Inteligencia artificial: ¿hace falta?

**Decisión: el núcleo de Pronto no usa IA.**

| Uso posible | Veredicto | Por qué |
|---|---|---|
| Chat asistente | **No** | Contradice el diseño mínimo y puede equivocarse con dinero de por medio |
| Cálculo de costos y descuentos | **No (código, no IA)** | Son fórmulas exactas con pruebas; un modelo no debe calcular dinero |
| Explicar el costo en una línea | **No (plantilla)** | Basta una frase fija con las cifras |
| Cargar la factura sin escribirla | **Sí, sin IA:** lectura del **XML de la factura electrónica** (formato UBL de SUNAT) | Lectura exacta, sin errores ni costo. Falta verificar con una factura real que traiga fecha de vencimiento |
| Autocompletar desde foto o PDF con IA | **No en el MVP** | Puede leer mal, envía datos tributarios a un tercero, los documentos pueden contener instrucciones maliciosas, exige una clave en servidor y el usuario tendría que confirmar igual. Es una opción de la etapa 2 |

Las bases solo piden **declarar** el uso de IA en el README (generación de código, pruebas, documentación con Claude Code).

## 11. Pendientes y decisiones

- **Aprobar este documento y los mockups de S2** antes de escribir pantallas.
- **Moneda en pantalla:** USDC (propuesta). Si prefieres mostrar "S/", hay que declarar que son unidades de prueba.
- **Verificar:** emisor oficial de USDC en testnet y dónde obtenerlo (S1), campos del XML con una factura real, y que la billetera elegida soporta firmar el reto de entrada.
