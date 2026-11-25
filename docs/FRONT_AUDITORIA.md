# Pronto — Auditoría del front (recorrido del 24 nov 2026)

> Documento de diagnóstico. **No se ejecutó ningún cambio**: el rediseño espera la inspiración que aportará Jorge. Fuente: recorrido real de la app en un viewport de 390 px (rama `claude/front-23f2d0`, commit `1d58f32`), lectura de su código, la web de Varial y la documentación de Freighter y Stellar Wallets Kit.

## 1. Veredicto

El front **funciona como prototipo técnico** (los flujos de datos, estados y el recibo responden) pero **no funciona como producto**: no tiene entrada real, no se siente como una app, su identidad visual es genérica y a una persona que llega por primera vez no le explica qué hacer. Jorge lo juzgó "muy mal, no convence, incompleto"; el recorrido lo confirma en lo esencial. Lo que está bien conviene conservarlo (sección 3).

## 2. Qué se revisó y qué no

| Revisado | No revisado (límites) |
|---|---|
| Entrada, registro con validación, inicio de proveedor y de comprador, detalle por cobrar, detalle por pagar, confirmar, nueva oferta, hoja de operación, comprobante, mi código, contactos, ajustes, nueva factura (pasos 1 y 2) | Subida real de archivo (no había archivo de prueba), paso 3 de factura, "Recuperar", `/red`, `/e/:code`, oferta vencida |
| Recarga de página, errores de formulario, estados de la lista | Billetera real (el recorrido fue con datos simulados y billetera de demostración), contraste y tamaño táctil medidos, lectores de pantalla, velocidad |

## 3. Qué funciona y conviene conservar

- La **lógica de estados** (Por confirmar, Confirmada, Reservada, Cobrada, Vencida) es coherente y se actualiza al operar.
- La **hoja de operación** (Preparar, Firmar, Enviar, Confirmado) con código de operación copiable es clara.
- El **comprobante** (monto neto grande, valor de factura, descuento, sello PAGADO) es la mejor pantalla.
- **Mi código** (QR grande, código, copiar, compartir, escanear) cumple.
- La validación del registro marca los campos y usa los mensajes del contrato.
- Una acción principal por pantalla y textos cortos en español.

## 4. Fallos por pantalla

| Pantalla | Qué está mal | Gravedad |
|---|---|---|
| **Entrada** | No hay login: el selector "Demostración: cuenta de prueba" ocupa su lugar. Una persona nueva no ve "Conectar billetera", ni qué es una billetera, ni cómo conseguir Varial. Cerca de la mitad de la pantalla está vacía. Solo habla al proveedor ("Cobra tu factura hoy"); el comprador no se ve reflejado. Sin logo, solo la palabra PRONTO en letra pequeña. La etiqueta TESTNET es un enlace oculto a `/red` | Alta |
| **Sesión** | Recargar la página (F5) devuelve a la entrada: se pierde la sesión. En el celular, cambiar de app y volver puede cerrar la sesión | Alta |
| **Registro** | Tres cajas vacías sin ejemplo ni ayuda (sin formato del RUC, "Rubro" es texto libre). Los errores aparecen solo al enviar, no mientras se escribe. No explica que el RUC no se verifica con SUNAT ni pide aceptar términos | Media |
| **Inicio** | Cabecera saturada: nombre de empresa cortado ("Imprenta Gráfica An…"), chip de billetera `G…VQTY` y chip TESTNET en una sola fila. Lista con 6 filas casi idénticas, nombres que se parten en dos líneas y 6 estilos de etiqueta distintos (Revisar, Te ofrecen pagar hoy, Confirmada, Esperando confirmación, Cobrada, Oferta vencida). Navegación escondida: "Mi código · Contactos · Ajustes" son tres palabras sueltas al final de la lista, sin iconos ni barra fija. El comprador aterriza en "Por cobrar" aunque su trabajo está en "Por pagar" (5 pendientes) | Alta |
| **Detalle por cobrar** | **No muestra la oferta**: el descuento, el porcentaje, los días que quedan y el monto neto solo aparecen dentro del botón "Cobrar 3 447,50". Muestra "Descuento máximo 2 %", un dato propio que confunde al ver una oferta. "Esperar" es un enlace diminuto. El botón dispara una operación en la red sin decir qué ocurre | Alta |
| **Detalle por pagar** | Falta la fecha de emisión. Después de reservar, la pantalla queda sin acción y sin resumen de la oferta (monto, descuento, vencimiento) | Media |
| **Nueva oferta** | Muestra importes con **4 decimales** (`2 364,4925 USDC`, `Ahorras 36,0075`): no es dinero legible. No muestra el valor de la factura ni el saldo del comprador. El flujo V2 pedía confirmar la billetera del proveedor y no está | Alta |
| **Hoja "Reservando"** | Vuelca la dirección completa de 56 caracteres dentro de una frase. En modo demostración el enlace "Ver en stellar.expert" apunta a un código que no existe | Media |
| **Comprobante** | Muestra "Reserva vence 1 dic 2026" en un pago ya hecho. Faltan fecha del pago, quién pagó y a quién, y el hash completo. "Descargar PDF" no se probó | Media |
| **Contactos** | Una lista de un solo elemento sin acciones: no hay "Agregar", ni ficha, ni estado vacío | Baja |
| **Ajustes** | Solo datos y una casilla "Ficha pública"; falta ayuda, soporte, cerrar sesión visible y términos | Baja |
| **Nueva factura** | El paso 1 funciona, pero ingresar el código del propio proveedor da "Algo salió mal de nuestro lado" en vez de "No puedes enviarte una factura". El paso 2 es una pantalla casi vacía con un botón pequeño: sin cámara, sin arrastrar, sin vista previa | Media |

## 5. Fallos transversales

1. **Identidad visual genérica.** Fondo crema, tarjeta, botón dorado y texto negro: correcto pero sin carácter ni marca; nada recuerda a una app de pagos. Sin logo, iconos ni ilustración.
2. **Mucha área muerta** en casi todas las pantallas y botón fijo al pie lejos del contenido.
3. **No hay navegación persistente.** Falta una barra inferior con iconos; moverse requiere volver atrás.
4. **No hay estados vacíos, de carga ni de error útiles** (salvo el comprobante).
5. **Botones y chips:** los chips de descuento, vigencia y estado son pequeños y de forma muy parecida entre sí; la acción secundaria es texto diminuto. No se midió el tamaño táctil mínimo (se recomienda 44 px).
6. **No hay onboarding** ni explicación de los dos roles, del descuento ni de qué es una billetera.
7. **Dinero:** montos con 4 decimales y mezcla de formatos (`3500` y `3 500`).
8. **No es instalable:** sin manifiesto ni service worker, no se puede agregar a la pantalla de inicio ni abre sin conexión.
9. **Flujos incompletos o no comprobados:** recuperar una oferta vencida, invitar a un cliente que no está en Pronto, notificaciones, historial de operaciones, ficha del cliente, ayuda.

## 6. Comparación con Varial

Varial (captura de su web, su extensión y su documentación) resuelve justo lo que a Pronto le falta:

| Varial | Pronto hoy |
|---|---|
| Bienvenida con dos caminos claros: **Create new wallet** e **Import wallet** | Un selector de demostración y "Entrar" |
| Marca visible: logo, tipografía y color propios en cada pantalla | Palabra PRONTO pequeña |
| Inicio con **saldo grande** y **cuatro acciones con icono y una palabra** (Add, Send, Swap, Earn) | Lista de facturas y enlaces de texto |
| Pestañas dentro del inicio (Tokens, Positions, Collectibles) y **barra inferior de 3 iconos** (historial, inicio, explorar) | Pestañas Por cobrar y Por pagar; sin barra |
| Selector de cuenta con avatar arriba (cambiar de cuenta en un toque) | Chip `G…VQTY` sin función |
| App móvil, extensión y web con el mismo lenguaje | Solo una web |
| Pestaña **Discover** para abrir apps de Stellar | No aparece |

Qué **sí** copiar: bienvenida con dos caminos, barra inferior con iconos, acciones grandes con icono, selector de cuenta, estados claros. Qué **no** copiar: Pronto no es una billetera (no envía, no cambia, no ahorra); no debe parecer una.

## 7. ¿Extensión, PWA o app móvil?

Pronto es una **aplicación que usa una billetera**, no una billetera. Varial es extensión porque guarda llaves e inyecta un proveedor en el navegador; Pronto solo necesita **pedirle firmas**.

| Opción | Pros | Contras | Veredicto |
|---|---|---|---|
| **Extensión de Chrome propia** | Instalable desde la tienda | Solo escritorio (el Chrome de Android no usa extensiones: dato general, verificar); revisión de la tienda; la MYPE usa celular; no aporta nada que una web no haga | **No** |
| **PWA** (web instalable) | Un solo código para celular y escritorio; se instala desde el navegador sin tienda; usa cámara (QR), notificaciones y pantalla completa; despliegue inmediato en Vercel | Aún no está hecha (falta manifiesto, service worker, iconos) | **Recomendada** |
| **App nativa** (iOS/Android) | Mejor integración | Meses de trabajo, tiendas, imposible antes del 4 dic | No ahora |
| **Dentro de Varial móvil** | La pestaña Discover abre apps de Stellar; distribución natural | Depende de que Varial acepte la app y de su navegador interno (no verificado) | **Complemento**, a investigar |

**Cómo se conecta la billetera desde el celular** (documentación de Freighter y Stellar Wallets Kit): la web abre un diálogo de WalletConnect v2, la persona elige su billetera y aprueba. El módulo WalletConnect del kit solo expone `stellar_signXDR` y `stellar_signAndSubmitXDR`; nuestro acceso firma una **transacción** (el reto con secuencia 0), así que debería ser compatible. En escritorio sigue sirviendo la extensión de Varial. **Falta probar con Varial móvil real** que firme ese reto.

**Camino para quien no tiene billetera:** hoy es el mayor obstáculo de adopción. Opciones: guiar la instalación de Varial en dos pasos dentro de la app, o (etapa 2) una billetera con huella o llave de paso (passkey) sin instalar nada. Esta última exige otra verificación de firma en el servidor y no cabe antes del 4 dic.

## 8. Propuesta de rediseño (para discutir; nada ejecutado)

1. **Entrada real:** logo, una frase y tres caminos: *Conectar mi billetera* (Varial u otra), *No tengo billetera* (guía de dos pasos) y *Probar demostración*. Quitar el selector de la vista principal.
2. **Onboarding de 3 pantallas** con ilustración: qué es Pronto, cómo ganas o ahorras, qué pasa con tu dinero. Saltable.
3. **Inicio estilo billetera:** arriba el selector de empresa con avatar; cifra grande (por cobrar o por pagar); **acciones con icono** (Nueva factura, Mi código, Escanear, Contactos); debajo "Requiere tu acción" y la lista.
4. **Barra inferior de 4 iconos:** Inicio, Facturas, Escanear/Mi código, Perfil. Sin enlaces de texto sueltos.
5. **Detalle con la oferta al centro:** monto neto grande, porcentaje, días que quedan, qué ocurre al pulsar; acción secundaria visible.
6. **Dinero con 2 decimales** y regla de redondeo a centavos en el descuento (hoy el protocolo produce 7 decimales).
7. **Sesión persistente** y reconexión silenciosa con la billetera.
8. **PWA instalable:** manifiesto, iconos, service worker mínimo, modo pantalla completa.
9. **Estados:** vacío, cargando y error en cada lista y flujo; mensajes por código de error.
10. **Marca:** logo, paleta y tipografía con más carácter que el diseño C actual (la inspiración de Jorge decide la dirección); iconografía coherente.

## 9. Lista priorizada

| Prioridad | Trabajo |
|---|---|
| **P0** (sin esto no es presentable) | Entrada real y onboarding; barra inferior; inicio con saldo y acciones; detalle por cobrar con la oferta visible; dinero a 2 decimales; sesión persistente; nueva identidad visual |
| **P1** | PWA instalable; paso 2 de factura con cámara; mensajes de error correctos; estados vacíos y de carga; comprobante completo; confirmar billetera del proveedor |
| **P2** | Contactos con acciones; ficha del cliente; notificaciones; ayuda; accesibilidad medida; abrir desde Discover de Varial |

## 10. Preguntas abiertas para Jorge

1. ¿Qué referencias de diseño (apps, capturas) marcan la dirección? El diseño C ya aprobado puede cambiar: se aprobó sin ver la app funcionando.
2. ¿Nombre y logo de Pronto: ya existe algo o se crea?
3. ¿Se prioriza el celular de la MYPE sobre el escritorio?
4. ¿Se invierte en la guía "No tengo billetera" antes del 4 dic?

## 11. Pendiente

Esperar la inspiración de Jorge, decidir el formato (PWA recomendada) y recién entonces actualizar `DESIGN.md`, regenerar los mockups y ejecutar el rediseño por cortes. Hasta entonces el front actual sirve para ensayar la lógica y mostrar el flujo.
