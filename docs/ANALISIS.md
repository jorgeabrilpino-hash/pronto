# Pronto — Análisis de validez para Stellar Codember Perú 2026

> Fecha: 18 nov 2026. Fuentes revisadas: bases oficiales (stellar.mintedinpe.com/codember/bases), página del evento, guía de construcción (stellar.mintedinpe.com/guia), `docs/PRONTO_BASE.md`, contrato `contracts/pronto_offer`.
> Veredicto corto: **la idea se mantiene**, con cinco ajustes obligatorios (sección 6). No se descarta nada del núcleo.

---

## 1. Encaje con las bases (requisitos duros)

| Requisito de las bases | Estado en Pronto | Acción |
|---|---|---|
| Equipo 1–4, al menos un peruano o residente | Jorge, participante único y peruano | Ninguna |
| Inscripción individual con GitHub (cierre 24 nov, 11:59 p. m.) | **Pendiente de confirmar** | Jorge se inscribe el 19 nov |
| Checkpoint: repo registrado en el Hub (25 nov, 11:59 p. m.) | Sin repo público aún | Crear repo y registrarlo el 19–20 nov |
| Interactúa con Stellar testnet (Soroban o SDK/RPC/Horizon) | Contrato Soroban + RPC desde el frontend | Ninguna |
| Desplegado en testnet, ID + enlace a stellar.expert | Contrato escrito, **sin desplegar** | M0 |
| Repo público con historial de commits del 14 nov al 4 dic | Repo local recién iniciado | Commits pequeños y diarios |
| Declarar código previo, librerías y uso de IA en el README | README tiene la sección con huecos | Completar en M13 |
| Entregables: repo, README, video ≤ 3 min, URL de la app | Pendientes | M12, M13 |
| Temática: nada especulativo, sin rendimientos prometidos, sin tokens especulativos | Cumple: financia el comprador, no hay inversionistas ni token propio | Mantener el mensaje |
| No elegible si ganó premios antes o recibió SCF/Instaward | Proyecto nuevo | Ninguna |

**Conclusión:** encaja en la línea "Stablecoins y comercio: facturación" y en "Inclusión financiera". No hay ningún bloqueo de elegibilidad; los únicos riesgos son de plazo (inscripción y checkpoint).

## 2. Puntaje esperado según los criterios del jurado

El jurado evalúa **repo + despliegue en testnet + video**. El Demo Day no puntúa.

| Criterio (peso) | Fortaleza de Pronto | Debilidad | Cómo subir el puntaje |
|---|---|---|---|
| Uso de Stellar (25 %) | Custodia en Soroban, pago atómico al aceptar, eventos, `require_auth` por rol | Con XLM envuelto el "descuento explícito" pierde sentido (XLM fluctúa) | Operar con **USDC de testnet vía SAC** (trustline incluida). Ver ajuste A |
| Funcionalidad y calidad técnica (25 %) | Contrato con 11 pruebas, invariantes claras, flujo de transacción bien definido | Las pruebas **no se pudieron ejecutar en esta máquina** (no hay Rust ni Stellar CLI) | Instalar toolchain, `cargo test` + `cargo scout-audit`, pruebas de utilidades TS |
| Problema e impacto (20 %) | Ley 31362, usuario objetivo claro (tesorería del comprador + MYPE proveedora) | Cero entrevistas; el encuadre actual roza "legitimar el pago tardío" | Reencuadre legal (ajuste B) + 3 conversaciones cortas antes del video |
| Innovación (15 %) | En Soroban abundan factoring con inversionistas (LiquiFact, Astera, StellarSettle); no encontramos descuento por pronto pago financiado por el comprador | Concepto conocido en banca (dynamic discounting) | Decirlo así: "lo que las grandes corporaciones hacen con plataformas de pronto pago, en 5 segundos y verificable, al alcance de una MYPE" |
| Presentación y UX (15 %) | Pantalla "esperar vs. cobrar hoy" con costo anualizado es un gran momento de demo | La MYPE necesita billetera y trustline: fricción | Onboarding guiado (activar USDC con un clic) y vista del proveedor mobile-first |

## 3. Problema: ¿está bien planteado?

**Lo que se sostiene (verificado):**
- La Ley 31362 fija un máximo de 30 días calendario para pagar facturas MYPE desde su emisión; el comprador cae en mora automática desde el día 31. Se puede pactar un plazo mayor solo de forma excepcional y con formalidades (escritura pública o firmas legalizadas). Reglamento: D. S. 120-2022-EF. Hubo modificaciones posteriores (Ley 31662) cuyo texto vigente conviene citar desde el consolidado del Congreso.
- El retraso real en los pagos a MYPE está documentado en prensa y gremios.

**Lo que hay que corregir:**
1. **Encuadre legal.** Si el comprador ya paga a 60 o 90 días, está en mora. Ofrecerle a la MYPE "cobrar hoy con descuento" sobre una deuda vencida sería pedirle que pague por un derecho que la ley ya le da. Un jurado peruano lo notará. **Pronto actúa dentro del plazo**: convierte el "día 30" (o el plazo pactado legalmente) en "día 1". Regla nueva: solo se ofertan facturas **no vencidas**.
2. **Los datos de PRODUCE de 2026** (S/ 27 019 millones, 84,5 % MYPE) no se pudieron verificar en esta sesión. Antes del video, citar la fuente exacta con enlace o retirarlos. Y nunca presentarlos como "mercado de Pronto" (el documento base ya lo advierte).
3. **Demanda sin validar.** Es una hipótesis. Con el tiempo disponible basta con 3 conversaciones de 15 minutos (1 comprador con tesorería, 2 proveedores MYPE) usando preguntas sobre lo que ya hicieron (Mom Test). Una cita real en el video vale más que una cifra macro.

**Problema reformulado (usar en README y video):**
> Una MYPE peruana factura, su cliente da la conformidad y tiene caja, pero paga el día 30 por política de tesorería. La MYPE necesita ese dinero hoy y su única salida es el factoring con un tercero. Pronto le permite al propio comprador ofrecer el pago inmediato con un descuento explícito, reservando los fondos en un contrato que paga en el mismo instante en que la MYPE acepta.

## 4. Solución: ¿por qué Stellar y no una transferencia bancaria?

Es la pregunta que hará el jurado (25 % del puntaje). Respuesta honesta, en orden de fuerza:

1. **Compromiso creíble antes de aceptar.** El proveedor ve en la red que el neto ya está reservado. Una promesa por correo no vale lo mismo; aquí aceptar y cobrar son la misma transacción (`accept` transfiere o revierte todo).
2. **Vencimiento y devolución programados.** Si nadie acepta, el comprador recupera la reserva sin intermediario ni conciliación manual.
3. **Verificable por ambas partes sin acceso al banco del otro.** Hash de transacción y eventos como comprobante compartido.
4. **Liquidación en segundos con comisiones mínimas**, 24/7, en una stablecoin (USDC) que mantiene el descuento expresado en una moneda estable.

Lo que **no** debemos afirmar: que es más barato que una transferencia CCE, ni que resuelve la conversión a soles (fuera de alcance en este MVP).

## 5. Viabilidad, escalabilidad y accesibilidad

**Viabilidad técnica (alta).** El contrato ya existe y es simple (4 funciones, 8 errores). El riesgo está en la integración del frontend (simulación, firma con Wallets Kit, sondeo de `getTransaction`) y en el tiempo de una sola persona: 16 días.

**Viabilidad legal y de negocio (media, declararla).** El pronto pago con descuento es una práctica comercial común entre dos partes. No hay captación de fondos de terceros. Pendientes reales para operar con dinero: tratamiento tributario del descuento (posible nota de crédito electrónica), facturas negociables registradas en CAVALI (si la factura ya fue cedida a un factor, pagarle al proveedor sería un error; verificar la cesión queda fuera de alcance y se declara) y salida a soles mediante un anchor. Todo esto requiere revisión con especialistas locales antes de operar con dinero real.

**Escalabilidad (alta).** Un despliegue por activo sirve a todos los compradores (las ofertas se indexan por `offer_id`). Crecimiento natural: más proveedores del mismo comprador, luego creación de ofertas en lote, integración con ERP y SUNAT. El costo por oferta en Soroban es despreciable frente al monto.

**Accesibilidad (el punto débil).** La MYPE necesita una billetera Stellar, una trustline de USDC y, en la vida real, una salida a soles. Para el MVP: onboarding guiado, lenguaje sin jerga cripto, vista del proveedor mobile-first, contraste WCAG AA y textos en español. Para después del evento: billeteras con passkeys (sin frase semilla) y anchor SEP-24 para retirar en soles.

## 6. Ajustes obligatorios (decisiones de este análisis)

| # | Ajuste | Por qué | Dónde impacta |
|---|---|---|---|
| A | **Activo principal: USDC de testnet** (SAC). Desplegar también una instancia con XLM envuelto como respaldo | Sube "Uso de Stellar" (stablecoin, trustline, SAC); el descuento queda en moneda estable. El contrato no cambia: el activo se fija en el constructor | M0, M5, UI (paso "Activar USDC"), README |
| B | **Solo facturas no vencidas**; la fecha de pago original no puede superar el plazo legal o el pactado | Evita el encuadre de "cobrar descuento sobre una deuda morosa" | Reglas de BD/UI (§4.2 del documento base), guion |
| C | **Corregir el comentario del contrato** sobre `offer_id` (decía que derivaba de la factura) | Contradecía la regla de privacidad 5.1 | Hecho en este análisis |
| D | **Verificar o retirar** los datos de PRODUCE 2026 | No verificados | README, video |
| E | **Supabase sin login**: RLS restrictiva + escritura acotada, y la red como única verdad del dinero | Una base sin autenticación puede ensuciarse, pero los fondos solo se mueven con la firma de la billetera; el reconciliador corrige la base leyendo el contrato | M6, M9, sección de seguridad del README |

**Se elimina del alcance:** M14 "activo propio" (lo reemplaza el ajuste A con USDC de testnet, que no requiere emitir nada).

## 7. Riesgos principales

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| No inscribirse o no registrar el repo a tiempo | Media | Descalificación | Hacerlo el 19–20 nov, no esperar al 24–25 |
| Toolchain Rust/Stellar CLI en Windows | Media | Bloquea M0 | Instalar hoy; alternativa: WSL |
| Integración Wallets Kit + simulación Soroban | Alta | Retrasa M5 | Hacer M5 temprano con una prueba de punta a punta mínima antes de la UI |
| Faucet de USDC de testnet limitado o caído | Media | Demo sin fondos | Instancia de respaldo con XLM; cargar saldo con días de anticipación |
| Reinicio del testnet | Baja (en 16 días) | Contrato desaparece | Script de despliegue reproducible; verificar en stellar.expert antes de grabar |
| Una sola persona, 16 días | Alta | Calidad | Sesiones en paralelo con archivos disjuntos; congelar funciones el 30 nov; plan de recorte |

## 8. Fuentes

- [Bases oficiales de la buildathon](https://stellar.mintedinpe.com/codember/bases) · [Guía de construcción](https://stellar.mintedinpe.com/guia)
- [Ley 31362, texto (Congreso)](https://www.congreso.gob.pe/Docs/DGP/DIDP/files/ley_31362.pdf) · [Texto consolidado](https://www.leyes.congreso.gob.pe/Documentos/2021_2026/ADLP/Texto_Consolidado/31362-TXM.pdf) · [Resumen en LP Derecho](https://lpderecho.pe/ley-31362-pago-facturas-mype-treinta-dias/)
- Competencia en Soroban (factoring con inversionistas): [LiquiFact](https://github.com/Liquifact) · [Astera](https://github.com/CmxTop/Astera) · [StellarState](https://github.com/StellarState) · [Trustless Work](https://docs.trustlesswork.com/trustless-work/eth-pura-vida-hackathon)
