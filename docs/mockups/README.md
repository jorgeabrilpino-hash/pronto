# Pronto — Mockups móviles (Flujo V2, dirección C "Comprobante")

> Actualizado 23 nov 2026. Stitch, proyecto [`13877670176772311015`](https://stitch.withgoogle.com/projects/13877670176772311015), sistema `assets/5f2b67dff520465a9ea8ddda583c3328`. Reglas visuales: `/DESIGN.md`. Flujo: `docs/FLUJO_V2.md` §3 a §5. **Pendiente de aprobación de Jorge (GATE) antes de escribir pantallas.**

## Cómo abrirlas

Las pantallas creadas o editadas por la API **no aparecen** en `list_screens` ni en el lienzo del proyecto (solo se ven las 4 de la ronda del 21 nov). Se leen por ID con `get_screen` (`projects/13877670176772311015/screens/<id>`), que devuelve la captura (`screenshot.downloadUrl`) y el HTML (`htmlCode.downloadUrl`). Una llamada que agota el tiempo **no devuelve ID**, y como la lista no la muestra, no se puede recuperar: por eso las vistas "FALTA" no se pueden comprobar en el servidor. Yo solo leí las descripciones de Stitch; **no revisé las capturas visualmente**.

`edit_screens` no modifica la pantalla original: crea una **pantalla nueva** (columna "ID final"). La original sigue existiendo con el texto sin limpiar; no se borró.

## Estado por vista

| # | Vista | ID final | ID original | Estado y nota |
|---|---|---|---|---|
| 1 | Inicio público | `e5a91200dc3d495a8c8bd9905a361aa0` | — | Listo |
| 2 | Registro (formulario) | `44abd73fc1354bb29b56184ee68abc81` | — | Listo |
| 2b | Registro, estado final (código y QR) | `3ab5b853777a49b6bf04e8db0301ac0f` | `597a82cb7afa4c8993667c6498d40b6b` | Limpia: quitó "Ficha comercial registrada en Stellar", "Escanea para pagar o transferir" y el bloque de ledger |
| 2b-asset | Imagen del QR (auxiliar de Stitch) | `a020916dca254defb666fb83f037558b` | — | No es una vista |
| 3 | Fondos | `c712c1547ca4413dafb42af939634949` | `8d3b85e2496543c7a09733e4952bb704` | Limpia: "Falta activar" en lugar de "Línea de confianza pendiente"; quitó "Red de prueba Stellar". Conserva una fila "Fondos Testnet" y "Paso 1 de 2" que no se pidieron |
| 4 | Inicio con pestañas (Por cobrar) | **FALTA** | — | Generación agotó el tiempo; sin ID |
| 4b | Inicio, pestaña Por pagar | **FALTA** | — | Generación agotó el tiempo; sin ID |
| 5a | Nueva factura, paso 1 Cliente | `aef9ea7197bb44ed956d042bacf36863` | `fad90f53cc6246d8968a9e03c47e7788` | Limpia: quitó "Arequipa… verificada en Stellar" y "Protocolo Stellar v20" |
| 5b | Nueva factura, paso 2 Documento | `c62fcb8d1aab4f02ab5122e95dac48dd` | `e60aaaac88d54a6b9f969b1276645dfa` | Limpia: archivo `F001-123.pdf`, "182 KB", sin lectura óptica ni Clave SOL. Conserva una etiqueta "VALIDADO" |
| 5c | Nueva factura, paso 3 Datos | `aa68306f27f5498f9c4380ae1641628f` | `02756598b02444ebb7f9952b834c8b0e` (intermedia), `e2f0fd80703c4148b792f785ceff6735` | Limpia: sin "Anclado a Red Stellar", sin nota de liquidez, sin "Comprobante digital inmutable" |
| 6 | Detalle por cobrar | `04a85f854573407399af5fbcdbac97bf` | — | Listo |
| 7 | Detalle por pagar (Confirmada) | `da23a23814654081837fd37553c96046` | `024fa9aaffb5463a87719039b6b56a4d` | Limpia: "Ver documento", sin "SUNAT validada", enlace "No coincide". Quedan "Stellar Ledger Network" y un hash de transacción: quitar |
| 7b | Detalle por pagar (Por confirmar) | `68042aa98b294ac589cd606ede29a23b` | — | Listo, MOBILE. Chip "Por confirmar", `1 000 USDC`, botones *Confirmar* y *No coincide* |
| 8 | Nueva oferta | `53e787b445164c028586610b51ae2bfd` | `5e8f1672895e4db1aa306a66aa78e4e5` | Limpia: quitó "Stellar Liquidity". Descuento 1 / 1,5 / 2 %, anual secundario |
| 9 | Operación en la red (hoja) | **FALTA** | — | Un resultado inválido: `d6cc2b3b21ca4155ab1925690378b925` es de escritorio (2560 px) con prompt reducido a "Operación en la red": descartado. Otros intentos agotaron el tiempo. Provisional, versión previa al Flujo V2: `2eb4896429c6498bbe0cc7ddcc761751` |
| 10 | Comprobante | **FALTA** | — | El primer resultado (`721decaab853440e90aba9fae4b5de0a`) es de escritorio, 2560 px: **inválido**. Dos intentos más agotaron el tiempo. Provisional previa: `8686b7dacfb742b8a8b31de9d5745050` |
| 11 | Mi código | `a92dd6df2d1a473fb9a95ac24b1d5f1a` | `9ec09518cce848e694799beeac35fd55` | Limpia: quitó la leyenda "Escanea para pagar…" |
| 12 | Oferta vencida (Recuperar) | **FALTA** | — | No se intentó: Stitch estaba devolviendo tiempos agotados |
| 15 | Pronto en la red | **FALTA** | — | Dos intentos fallaron (tiempo y conexión) |

Pantallas previas del 21 nov (antes del Flujo V2; no borradas): `01e787188fed4386b511e4121976b9c2` "Crear oferta", `2eb4896429c6498bbe0cc7ddcc761751` "Operación en la red", `8686b7dacfb742b8a8b31de9d5745050` "Comprobante - Oferta Pronto", `512c14463b7b40b78bc4a5cca0089edd` prototipo.

## Qué falta

- **Generar:** 4, 4b, 7b, 9, 10, 12 y 15. Todas las llamadas agotaron el tiempo o se cortó la conexión justo después de las ediciones; el servicio de Stitch iba lento. Según la regla, no se reintentaron. Probar de nuevo **de una en una**, esperando entre llamadas; abrir antes el historial del proyecto en Stitch por si alguna se completó sin devolver ID.
- **Limpiar:** 5a (edición sin confirmar) y los restos señalados en 3, 5b, 5c y 7.
- **Estados no cubiertos:** error de una frase y un botón; carga.

## Decisiones para aprobar

1. **DM Sans + JetBrains Mono y papel `#F7F4EC`** reemplazan a Geist y `#FAFAF7` de `docs/FLUJOS_Y_UX.md` §2.
2. **Dorado `#E3C23A`** en lugar del amarillo Stellar `#FDDA24` (texto negro; contraste ≈ 9:1).
3. **Un solo botón dorado por pantalla**, fijo al pie; acciones accesorias en secundario o texto.
4. **Descuento en %**, con el equivalente anual solo como texto de apoyo de 14 px.
5. **"Requiere tu acción"** como primer bloque de cada pestaña (máximo 3 filas) y **+ Nueva factura** solo en Por cobrar.
6. **Sin textos de IA ni de SUNAT** en pantalla (coherente con la decisión de no usar IA ni verificar el RUC en el MVP).
7. Moneda mostrada en **USDC** (propuesta vigente).
