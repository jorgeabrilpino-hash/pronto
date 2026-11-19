# Pronto — cobro anticipado para pequeños proveedores

> Buildathon Stellar Codember Perú 2026. Estado: en construcción (MVP en testnet).

## Problema

Una pequeña imprenta entrega un pedido y su cliente aprueba la factura, pero el pago está programado a 30, 60 o más días. La ley peruana fija 30 días para facturas MYPE, y en la práctica muchas pymes cobran a los 60, 90 o 120 días. El comprador suele tener caja; el proveedor necesita liquidez hoy y hoy no tiene una forma simple, verificable y transparente de aceptar "pagar antes con descuento".

## Solución

Pronto permite que el **comprador** ofrezca a su proveedor un pago anticipado con **descuento explícito**. El comprador reserva el importe neto en un contrato Soroban. El proveedor ve la fecha original, el descuento, el neto y su costo anualizado, y puede aceptar o esperar el pago original. Al aceptar, el contrato transfiere los fondos **en la misma transacción** en que marca la oferta como ejecutada. Si la oferta vence, el comprador recupera la reserva.

No es factoring: no hay inversionistas ni se promete rendimiento. El adelanto lo financia la propia tesorería del comprador.

## Arquitectura

- **Contrato Soroban** (`contracts/pronto_offer`): `create_offer`, `accept`, `reclaim`, `get_offer`. Un activo por despliegue, fijado en el constructor. Eventos para reconciliación.
- **Frontend** (React + TypeScript + Stellar Wallets Kit): vista del comprador y vista del proveedor.
- **Backend** (Supabase): factura, RUC y conformidad; vínculo factura ↔ oferta con clave única por factura; reconciliador que confirma el resultado en la red antes de actualizar la app; comprobante y exportación para tesorería.
- **Privacidad:** el identificador de oferta es aleatorio (no deriva de datos de la factura). Nombres, RUC y documentos no se escriben en la red.

## Cómo ejecutarlo

```bash
# Pruebas del contrato (11 pruebas)
cargo test

# Compilar a WASM (requiere Stellar CLI y el target wasm32v1-none)
stellar contract build

# Cuenta de testnet con fondos
stellar keys generate alice --network testnet --fund

# Activo de prueba: XLM nativo envuelto como contrato (SAC)
stellar contract id asset --asset native --network testnet

# Desplegar (el constructor recibe el activo)
stellar contract deploy --wasm <ruta-del-wasm-que-imprime-el-build> \
  --source alice --network testnet -- --token <ID_DEL_SAC>
```

## Evidencia en testnet

- ID del contrato: _pendiente de despliegue_
- Explorador: _pendiente (stellar.expert/explorer/testnet)_
- Activo de prueba: unidades de prueba, **no son soles convertibles**.

## Integrantes

_Pendiente: nombre y usuario de GitHub de cada integrante._

## Uso de IA y código previo

- **IA:** el contrato y sus pruebas se redactaron con ayuda de Claude (Anthropic) y fueron revisados y ejecutados por el equipo. _Completar con el resto de usos de IA (interfaz, backend, guion del video)._
- **Código previo:** este repositorio parte de cero durante la buildathon. _Si se reutiliza algo de proyectos anteriores (por ejemplo de EcoBonus), declararlo aquí con su alcance._
- **Librerías de terceros:** soroban-sdk, Stellar Wallets Kit, Stellar SDK. _Completar al integrar._

## Alcance y límites

Estudio y prototipo en testnet con carga manual de obligaciones y una sola moneda de prueba. Fuera de alcance por ahora: integración contable, verificación de cesión externa de facturas, recuperación de cuentas y conversión a moneda local. Para operar con dinero real se necesita revisión contractual, tributaria, contable y de datos con especialistas locales.

## Licencia

MIT
