# Pronto — cobro anticipado para pequeños proveedores

> Buildathon Stellar Codember Perú 2026. Estado: en construcción (MVP en testnet).

## Problema

Una pequeña imprenta entrega un pedido y su cliente aprueba la factura, pero el pago está programado a 30, 60 o más días. La ley peruana fija 30 días para facturas MYPE, y en la práctica muchas pymes cobran a los 60, 90 o 120 días. El comprador suele tener caja; el proveedor necesita liquidez hoy y hoy no tiene una forma simple, verificable y transparente de aceptar "pagar antes con descuento".

## Solución

Pronto permite que el **comprador** ofrezca a su proveedor un pago anticipado con **descuento explícito**. El comprador reserva el importe neto en un contrato Soroban. El proveedor ve la fecha original, el descuento, el neto y su costo anualizado, y puede aceptar o esperar el pago original. Al aceptar, el contrato transfiere los fondos **en la misma transacción** en que marca la oferta como ejecutada. Si la oferta vence, el comprador recupera la reserva.

No es factoring: no hay inversionistas ni se promete rendimiento. El adelanto lo financia la propia tesorería del comprador.

## Arquitectura

Monorepo pnpm en TypeScript, más el contrato en Rust.

- **Contrato Soroban** (`contracts/pronto_offer`): `create_offer`, `accept`, `reclaim`, `get_offer`, `token`. Un activo por despliegue, fijado en el constructor.
- **API** (`apps/api`): arquitectura hexagonal con Hono y OpenAPI. Inicio de sesión firmando con la billetera, perfiles de empresa (proveedor, comprador o ambos), facturas, ofertas y reconciliación que lee el estado de la red antes de actualizar la base de datos.
- **Web** (`apps/web`): React y Vite, pensada para el teléfono. Conexión con Stellar Wallets Kit o con una cuenta de prueba creada en el navegador (solo testnet, clave cifrada con PIN).
- **Datos** (`supabase/`): Postgres con RLS activado y sin acceso público; adjuntos en un bucket privado.
- **Contratos compartidos** (`packages/shared`): tipos y validaciones que usan la API y la web.
- **Privacidad:** el identificador de oferta es aleatorio (no deriva de datos de la factura). Nombres, RUC y documentos no se escriben en la red.

## Cómo ejecutarlo

Requiere Node 24 o superior y pnpm 11.

```bash
pnpm install
pnpm check                      # formato, tipos y pruebas
pnpm --filter ./apps/web dev    # web; sin VITE_API_URL usa datos simulados
pnpm --filter ./apps/api dev    # API; requiere tu propio proyecto de Supabase
```

La API lee su configuración de variables de entorno (`DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` y los datos del contrato). La web contra la API real usa `VITE_API_URL`, `VITE_PRONTO_CONTRACT_ID` y `VITE_USDC_SAC_ID`. No se publica ningún secreto en el repositorio.

Contrato:

```bash
cargo test                 # 11 pruebas
stellar contract build     # requiere Stellar CLI y el target wasm32v1-none
stellar contract deploy --wasm <ruta-del-wasm> --source <identidad> --network testnet -- --token <ID_DEL_SAC>
```

## Evidencia en testnet

| Instancia | Contrato |
|---|---|
| USDC de prueba (la configurada para la app) | [`CCEP3RMDUYCFD3GJPDTMH2OQGX3KTV4NX7VRCXLUIIU2ZZOSKL4M5BE4`](https://stellar.expert/explorer/testnet/contract/CCEP3RMDUYCFD3GJPDTMH2OQGX3KTV4NX7VRCXLUIIU2ZZOSKL4M5BE4) |
| XLM de prueba (verificación del contrato) | [`CDJLAF3FBQCMU35CPTAF3ICL5W3XSTMDOOLWKJU3K4GGC5WOWIRBY52S`](https://stellar.expert/explorer/testnet/contract/CDJLAF3FBQCMU35CPTAF3ICL5W3XSTMDOOLWKJU3K4GGC5WOWIRBY52S) |

En la instancia con XLM se reservaron 9.85, el proveedor cobró al aceptar y un segundo intento de aceptar fue rechazado. Los activos son de prueba y **no son soles convertibles**.

## Estado

Hecho:

- Contrato desplegado en testnet.
- API y base de datos con pruebas automáticas.
- En la web contra la API real se verificó: crear una cuenta de prueba en testnet con USDC activado, iniciar sesión firmando y registrar una empresa.

Pendiente:

- Recorrer en la web el ciclo completo con USDC (reservar, cobrar y recuperar) sobre la red.
- Terminar la pantalla de inicio (saldo y últimos movimientos), el historial y el detalle de la oferta.
- Instalación como aplicación (PWA) y despliegue público.
- Video de demostración.

## Integrantes

Jorge, participante individual — GitHub: [jorgeabrilpino-hash](https://github.com/jorgeabrilpino-hash).

## Uso de IA y código previo

- **IA:** el contrato, la API, la web, las pruebas y la documentación se desarrollaron con ayuda de Claude (Anthropic) mediante Claude Code. Las exploraciones de diseño usaron Google Stitch. El producto no usa un modelo de IA para decidir ni para mover dinero.
- **Código previo:** este repositorio parte de cero durante la buildathon.
- **Librerías de terceros:** soroban-sdk, Stellar SDK, Stellar Wallets Kit, Hono, zod, jose, Kysely, node-postgres, React, Vite, MSW y Vitest.

## Alcance y límites

Estudio y prototipo en testnet con carga manual de obligaciones. Fuera de alcance por ahora: integración contable, verificación de cesión externa de facturas, recuperación de cuentas y conversión a moneda local. Para operar con dinero real se necesita revisión contractual, tributaria, contable y de datos con especialistas locales.

## Licencia

MIT
