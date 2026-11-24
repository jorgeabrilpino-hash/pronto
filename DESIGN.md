# Pronto — DESIGN.md

> Dirección visual **C · Comprobante** (21 nov 2026), aprobada como base. Fuente de verdad en Stitch: proyecto `13877670176772311015`, sistema `assets/5f2b67dff520465a9ea8ddda583c3328` ("Comprobante Tactile"). Pantallas: `docs/mockups/README.md`. Flujos y vistas: `docs/FLUJO_V2.md`.
> Este archivo manda sobre cualquier otra guía visual. Si hay conflicto con `docs/FLUJOS_Y_UX.md` §2, gana este (allí: Geist y fondo `#FAFAF7`; aquí: DM Sans y papel `#F7F4EC`).

## 1. Idea

Una factura que se paga es un **comprobante**: papel cálido, tinta oscura, un sello verde. La interfaz se parece a un ticket impreso, no a una app cripto. Una pantalla, una decisión, **un botón principal dorado**.

## 2. Tokens de color

| Token | Valor | Uso |
|---|---|---|
| `--paper` | `#F7F4EC` | Fondo de toda la app |
| `--ivory` | `#FFFDF7` | Tarjetas, comprobante, hojas inferiores, campos |
| `--border` | `#E7E0CF` | Bordes de 1 px, perforaciones, divisores |
| `--ink` | `#1F1C17` | Texto principal, montos, texto del botón dorado |
| `--ink-muted` | `#7A7366` | Texto secundario, metadatos, ayudas |
| `--gold` | `#E3C23A` | **Solo** botón principal, estado "en proceso", marca Stellar |
| `--green` | `#3F7D58` | Confirmado, "PAGADO", sello, ingresos |
| `--green-tint` | `#3F7D5815` | Relleno del sello y de las etiquetas de éxito |
| `--error` | `#BA1A1A` | Errores (siempre con icono y texto) |
| `--error-tint` | `#FFDAD6` | Fondo de aviso de error |
| `--pressed` | `#F0ECE1` | Estado presionado del botón secundario y filas |

Reglas: sin degradados, sin vidrio, sin sombras difusas. El color indica función, no decora. Contraste mínimo AA: tinta sobre papel ≈ 15:1; tinta sobre dorado ≈ 9:1; `--ink-muted` sobre papel ≈ 4,6:1 (solo para texto de 14 px o más).

## 3. Tipografía

| Rol | Fuente | Tamaño / peso | Uso |
|---|---|---|---|
| Titular de pantalla | DM Sans | 24 / 700 | Una por pantalla |
| Título de bloque | DM Sans | 16–20 / 600 | Nombre de empresa, secciones |
| Cuerpo | DM Sans | 16 / 400 | Texto general |
| Secundario | DM Sans | 14 / 400 | Ayudas, contexto |
| Monto grande | JetBrains Mono | 40 / 600, `tabular-nums` | "985 USDC" |
| Código y cifras | JetBrains Mono | 14–20 / 500–600 | RUC, `PR-7K4Q2M`, fechas, series, hash |
| Etiqueta | JetBrains Mono | 11 / 500, mayúsculas, 0,04 em | "PAGADO", "CÓDIGO DE OPERACIÓN" |

- **Siempre en JetBrains Mono:** montos con su moneda (`USDC`), porcentajes, fechas, serie-número de factura, RUC, códigos Pronto y de operación.
- Formato peruano: miles con espacio fino (`1 000`), coma decimal (`1,5 %`, `985,00`).
- Tamaño mínimo 11 px solo para etiquetas en mayúsculas; todo lo demás, 14 px o más.

## 4. Espaciado, forma y elevación

- Escala de 4 px: 4 · 8 · 12 · 16 · 24 · 40. Margen lateral de pantalla **16 px**; separación entre bloques 16–24 px.
- Botones y chips: **píldora** (`radius: 9999px`). Tarjetas y comprobante: **12 px**. Campos: 8 px.
- Reposo: sin sombra; borde de 1 px `--border`. Solo las hojas flotantes llevan sombra dura `0 4px 0 rgba(31,28,23,.08)` más borde de 1 px.
- Objetivos táctiles de **44 px o más**; botón principal de 52 px de alto.
- Barra superior: flecha de volver · título · chip **Testnet** (lleva a `/red`). El chip de billetera (`G…ABCD`) solo en la pantalla de inicio y en Registro.

## 5. Componentes

### 5.1 Tarjeta comprobante (receipt-ticket)
- Fondo `--ivory`, borde 1 px `--border`, radio 12 px.
- **Muescas:** dos semicírculos de 12 px de radio recortados en los bordes izquierdo y derecho, a la altura de la perforación, del mismo color que el papel (`--paper`).
- **Perforación:** línea `1.5px dashed --border` que une las muescas; divide el **cuerpo** (arriba: quién, qué factura, el monto grande) del **talón** (abajo: vencimiento, descuento, código, enlace a documento).
- El monto va una sola vez, grande, en JetBrains Mono. Nada de tarjetas dentro de tarjetas.
- Sello **PAGADO**: etiqueta rectangular, borde 1,5 px `--green`, relleno `--green-tint`, texto `--green` en mayúsculas de 11 px, ligeramente girada (−4°) solo en el comprobante final. En listas se muestra como etiqueta plana, sin giro.

### 5.2 Botón
| Tipo | Estilo | Regla |
|---|---|---|
| **Principal** | Relleno `--gold`, texto `--ink` 600, píldora, 52 px | **Uno por pantalla**, fijo al pie con margen de seguridad. Verbo directo: *Reservar 985 USDC*, *Cobrar 985*, *Enviar*, *Entrar* |
| Secundario | Relleno `--ivory`, borde 1,5 px `--border`, texto `--ink`; presionado `--pressed` | Acciones accesorias (*Copiar*, *Compartir*, *Activar USDC*) |
| Texto | Sin relleno, `--ink-muted`; al presionar, `--ink` | *Esperar*, *No coincide*, *Invitar a Pronto*, *Ver en la red* |
| Destructivo | Texto `--ink-muted`; al presionar, `--error` | Cancelar, quitar. Nunca dorado |
- Deshabilitado: 40 % de opacidad más texto que explique por qué (una línea). Cargando: el texto cambia a *Enviando…* con indicador; no se bloquea la pantalla entera.

### 5.3 Pestañas (Por cobrar / Por pagar)
- Control segmentado de dos opciones, píldora, bajo la barra superior. Activa: relleno `--ink` y texto `--ivory`; inactiva: `--ivory` con borde. Cada pestaña lleva un contador numérico en JetBrains Mono.
- Bajo la pestaña activa, primero **"Requiere tu acción"** (máximo 3 filas resaltadas con etiqueta dorada), luego el total y la lista. El botón principal **+ Nueva factura** queda fijo al pie, solo en la pestaña Por cobrar.
- Cambiar de pestaña no recarga ni pierde el desplazamiento de la otra.

### 5.4 Hoja inferior (bottom sheet)
- Fondo `--ivory`, esquinas superiores de 24 px, asa de 4×32 px, sombra dura. El fondo se atenúa al 40 % de tinta.
- Se usa para **Operación en la red** (Preparar → Firmar → Enviar → Confirmado), compartir y elegir archivo. No tiene botón principal mientras la operación avanza; solo un *Cerrar* en texto, deshabilitado hasta terminar.
- Pasos: hecho = check `--green`; activo = indicador `--gold`; pendiente = círculo `--border`. Debajo: tiempo transcurrido, **código de operación** (copiar) y *Ver en stellar.expert*.

### 5.5 Campos
- Altura 52 px, relleno `--ivory`, borde 1 px `--border`; enfocado: 2 px `--ink`. Etiqueta arriba en 14 px.
- Montos, RUC, serie y fechas en JetBrains Mono; la moneda va como etiqueta fija a la derecha.
- Validación en línea con una frase corta debajo del campo ("RUC no válido").

### 5.6 Selector de descuento
- Tres píldoras **1 %**, **1,5 %**, **2 %**; la elegida se rellena de `--ink`. Primero el dinero: *Pagas hoy 985 USDC*, *Ahorras 15 USDC*. El equivalente anual ("equivale a 18,5 % anual") va **solo** como texto secundario de 14 px `--ink-muted`, nunca como dato principal ni como botón.
- Si el descuento supera el máximo del proveedor: aviso *Supera el descuento máximo de la empresa (1,5 %)* con icono, sin bloquear.

### 5.7 Filas de lista
- Izquierda: nombre de la contraparte (16 / 600) y, debajo, serie-número y fecha (14, `--ink-muted`). Derecha: monto en JetBrains Mono y etiqueta de estado. Divisor de 1 px; fila presionada `#F2EDE1`. Sin sombras.

### 5.8 Estados de factura (siempre icono + texto)
| Estado | Etiqueta | Estilo |
|---|---|---|
| Por confirmar / Esperando confirmación | punto gris | `--ink-muted` |
| Confirmada | check | `--green` outline |
| Oferta abierta | rayo | `--gold` relleno suave |
| Cobrada / Pagada | check + sello | `--green` |
| Oferta vencida | reloj | `--ink-muted` |
| Recuperada | flecha de retorno | `--ink-muted` |
| Revisar (rechazada) | alerta | `--error` |

## 6. Estados de pantalla

| Estado | Regla |
|---|---|
| **Carga** | Esqueleto con la misma silueta de tarjeta y filas (bloques `--border`, sin brillo animado); en acciones de red, la hoja *Operación en la red*. Máximo un indicador visible a la vez |
| **Vacío** | Una línea y el botón principal. Ej.: "Aún no hay facturas" + *+ Nueva factura* |
| **Error** | **Una frase y un botón.** Aviso con borde `--error`, fondo `--error-tint`, icono de alerta. Ej.: "No se firmó" + *Reintentar*. Sin códigos técnicos en pantalla (van en *Ver en la red*) |
| **Éxito** | Check verde, frase corta y el siguiente paso como botón principal |
| **Sin conexión / red lenta** | "La red no responde" + *Reintentar*; los datos ya cargados se mantienen visibles |
Los mensajes completos están en `docs/FLUJOS_Y_UX.md` §8 y `docs/FLUJO_V2.md` §7.

## 7. Contenido y tono

- Español neutro, tuteo, verbos directos (*Reservar, Cobrar, Esperar, Recuperar, Confirmar*). Poco texto: un titular, un dato clave, un botón.
- Lenguaje simple en pantalla, técnico en "Ver en la red": *Código de operación* (no hash), *Activar USDC* (no trustline).
- Descuento siempre en **porcentaje**; el equivalente anual es secundario.
- Ejemplos de referencia: proveedor **Imprenta Gráfica Andina SAC** (RUC 20601234567, código `PR-7K4Q2M`), comprador **Distribuidora Yanahuara SAC** (RUC 20512345678), factura **F001-123**, **1 000 USDC** nominal, **985 USDC** netos con 1,5 %.
- Sin texto de relleno de marketing ("lectura óptica instantánea", "protocolo Stellar v20"): no se muestra nada que el producto no haga (no hay lectura por IA ni consulta a SUNAT en el MVP).

## 8. Stellar visible

Chip **Testnet** en toda barra superior; hoja *Operación en la red* en cada transacción; *Ver en la red* en cada oferta y comprobante; vista `/red` con diagrama *Reservar → Cobrar* (y *Recuperar* si vence), función de cada paso (`create_offer`, `accept`, `reclaim`) y últimas operaciones reales. En modo demostración, una etiqueta técnica bajo el botón principal.

## 9. Accesibilidad

- Contraste AA en todos los pares de la sección 2; el dorado nunca lleva texto claro.
- Objetivos de 44 px o más; separación de 8 px entre objetivos adyacentes.
- Estados con **icono y texto**, nunca solo color (verde/dorado/gris/rojo).
- Foco visible: contorno de 2 px `--ink` con separación de 2 px. Orden de tabulación = orden visual; el botón principal es el último elemento del flujo.
- Cada campo con etiqueta persistente (no solo marcador de posición); errores asociados al campo y anunciados.
- Respeta `prefers-reduced-motion`: sin giros ni transiciones largas; el estado de operación se anuncia como texto ("Enviando…", "Confirmado").
- El QR siempre acompañado de su código escrito (`PR-7K4Q2M`) y de *Copiar*.
- Importes leídos completos: `aria-label="985 USDC"`, no cifras sueltas.

## 10. Movimiento

Mínimo y funcional: 150–200 ms para cambio de pestaña, apertura de hoja y selección de píldora; el sello PAGADO aparece una vez (escala 1,1 → 1). Nada decorativo en bucle.

## 11. Sí y no

| Sí | No |
|---|---|
| Un botón dorado por pantalla | Dos botones dorados o dorado en elementos secundarios |
| Monto grande en JetBrains Mono, una sola vez | Repetir el monto en varios bloques |
| Descuento en %; anual como texto secundario | Tasa anual como dato principal |
| Tarjeta comprobante con muescas y perforación | Cajas anidadas, sombras difusas, vidrio, degradados |
| Papel cálido `#F7F4EC` y tinta `#1F1C17` | Fondo blanco puro o modo oscuro por defecto |
| Una frase y un botón en errores | Códigos, trazas o párrafos de error |
| Estados con icono + texto | Estado solo por color |
| Verbos directos y poco texto | Tutoriales, chat, textos de marketing |
| Datos de ejemplo peruanos y coherentes | Ejemplos genéricos ("Acme", "$") |
| Mostrar Stellar con *Ver en la red* | Ocultar la red o mostrar términos técnicos en el flujo principal |

## 12. Pendientes de decisión

Ver `docs/mockups/README.md` (sección "Decisiones para aprobar"): confirmación de la nueva hoja de pestañas, etiqueta "Requiere tu acción", tamaño del sello, y retirada de textos añadidos por el generador.
