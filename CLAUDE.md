# Pronto — instrucciones para agentes

Pronto: el comprador ofrece pagar hoy una factura aprobada con descuento explícito; reserva el neto en un contrato Soroban y el proveedor cobra en la misma transacción en que acepta. Buildathon Stellar Codember Perú 2026 (entrega 4 dic 2026).

## Leer antes de trabajar
1. `NEXO-STATUS.md` (cabecera de estado).
2. Tu brief en `docs/ROADMAP.md` §4. Lee solo los archivos que tu brief necesita.
3. Reglas de negocio: `docs/PRONTO_BASE.md` §4 (fórmulas, invariantes, errores). Ajustes vigentes: `docs/ANALISIS.md` §6.

## Reglas duras
- Solo **TESTNET** (`https://soroban-testnet.stellar.org`). Nunca mainnet.
- Montos: `i128` en el contrato, `bigint` o cadena decimal en TypeScript, `numeric(20,7)` en Postgres. **Nunca `Number`** para montos. 7 decimales: `1.0000000 = 10_000_000`.
- El estado en la red es la verdad; la base de datos es un espejo que se corrige leyendo `get_offer`.
- Patrón de transacción Soroban: cuenta fresca → `setTimeout(180)` → simular → ensamblar → firmar con Wallets Kit → enviar → sondear `getTransaction` con límite. No marcar éxito sin `SUCCESS`. No enviar dos transacciones en paralelo desde la misma cuenta.
- `offer_id`: 32 bytes aleatorios, nunca derivados de la factura. Razón social, RUC y número de factura no van a la red.
- Solo facturas **no vencidas**; la vigencia de la oferta termina antes de la fecha de pago original y dura como máximo 30 días.
- Nunca pedir, leer ni escribir claves secretas. Los agentes no escriben archivos `.env*` reales (solo `.env.example`).
- Toca únicamente los archivos que tu brief autoriza. No ejecutar formateadores ni instalaciones globales fuera de tu carpeta.
- Commits: Conventional Commits, pequeños, sin atribución de IA en el mensaje.
- Idioma: interfaz y documentación en español neutro; identificadores de código en inglés.

## Comandos
| Qué | Comando | Dónde |
|---|---|---|
| Pruebas del contrato | `cargo test` | raíz |
| Análisis estático | `cargo scout-audit` | raíz |
| Compilar WASM | `stellar contract build` | raíz |
| Bindings TS | `stellar contract bindings typescript --network testnet --id <ID> --output-dir web/packages/pronto-offer` | raíz |
| Web (cuando exista) | `npm install` · `npm run dev` · `npm run build` · `npm test` | `web/` |

## Cómo se verifica
Un trabajo está listo solo con evidencia observada: comando + resultado (pruebas verdes, build verde), y para la UI un recorrido en el navegador. Leer el código no es verificar.
