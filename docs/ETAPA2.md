# Pronto — Etapa 2: de pagos a conexiones

> Estado: **visión, no se construye en la buildathon** (decisión del 19 nov 2026). Esta página existe para no perder la idea y dejar el MVP preparado.

## La idea (propuesta de Jorge)

Un comprador busca a un proveedor o le hace un pedido. El proveedor ve una ficha sencilla del comprador (si paga antes, cuánto ha operado). Según lo que el comprador quiere contratar, la aplicación sugiere condiciones, por ejemplo un descuento por volumen o por buen pagador, al estilo de las sugerencias de precio de InDrive: propuesta, sugerencia, contraoferta. El proveedor la usaría no solo para cobrar facturas, sino también para conectar con clientes.

## Por qué no entra en el MVP

1. **No usa Stellar.** El descubrimiento de clientes y las sugerencias de precio viven fuera de la red. Diluyen el criterio de mayor peso ("Uso de Stellar", 25 %) y compiten con "Funcionalidad" (25 %), que exige que lo central funcione.
2. **Arranque en frío.** Un directorio o marketplace necesita compradores y proveedores desde el primer día. Hoy hay cero usuarios.
3. **Faltan datos.** No conocemos los costos ni los márgenes del proveedor. Sugerirle un descuento sobre su producto sin ese dato puede dañarle el margen.
4. **La ficha no cambia el riesgo del pago anticipado.** En Pronto el dinero ya está reservado en el contrato, así que el puntaje del comprador no afecta si el proveedor cobra. Pesa en las **ventas a crédito normales**, y ese es el dominio de la etapa 2.
5. **Privacidad.** Publicar el comportamiento de pago de una empresa exige consentimiento y reglas claras.

## Lo que el MVP ya aprovecha

- **Ficha pública del comprador** (`/comprador/:address`) con métricas objetivas calculadas desde `offers`.
- **Solicitud de pago anticipado con techo de descuento:** es un "InDrive en pequeño" entre partes que ya comercian. El proveedor propone su techo, el comprador oferta dentro o fuera de él y el proveedor decide al firmar.
- **Campos de preparación** en `companies`: `sector` (para categorías) y `ficha_publica` (consentimiento, por defecto `true`).
- **Sin cambios en el contrato:** nada de la etapa 2 requiere tocarlo.

## Qué se construiría

1. Perfil de empresa por rubro.
2. Pedido: producto, cantidad y fecha.
3. Ficha del comprador visible para el proveedor al recibir el pedido.
4. Sugerencia de condiciones (descuento por volumen y por pronto pago) con un piso de margen que declara el propio proveedor.
5. Contraoferta.
6. Pago anticipado con Pronto sobre la factura resultante.

## Señales para pasar a la etapa 2

- Al menos 2 de los 3 proveedores entrevistados dicen que usarían la plataforma para **encontrar clientes**, no solo para cobrar antes.
- El piloto de 1 comprador y 3 proveedores funciona (es el cierre del guion del video).
- Hay compradores con historial suficiente para que la ficha signifique algo (umbral a definir después del piloto).

## Riesgos conocidos

- Cuentas falsas que se califiquen entre sí.
- Publicar la reputación de empresas sin su consentimiento.
- Responsabilidad por sugerencias de precio que dañen al proveedor.
- Competencia de marketplaces B2B existentes (no investigada).
