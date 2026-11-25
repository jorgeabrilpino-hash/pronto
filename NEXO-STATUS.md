# NEXO-STATUS — Pronto

## 📍 Estado actual (23 nov 2026, noche)

- Rama de trabajo `feat/backend-foundation` con commits **locales** (sin push; `main` sigue como el 19 nov). Plan en `docs/BACKEND_PLAN.md`, brief del front en `docs/FRONT_PLAN.md`.
- **B0 hecho:** monorepo pnpm, Biome, Vitest, CI, `packages/shared` (contrato zod, 20 códigos de error con mensajes en español) y 17 puertos.
- **B2 hecho:** dominio puro, casos de uso 01 a 14 y 18 y adaptadores en memoria: 89 pruebas, cobertura 99,6 %. Tres hallazgos del revisor de seguridad (evidencia de transacción, ofertas `failed` sin releer la red, bloqueo por límite de uso) están en corrección.
- **B1 hecho:** 9 tablas con RLS y cero políticas, cero funciones expuestas a usuarios anónimos, cubo privado `invoices`, datos de demostración (2 empresas, 7 facturas, 5 ofertas) y tipos generados. 83 pruebas de restricciones pasan contra Supabase.
- **Red inestable resuelta:** los scripts de `supabase/` reintentan con espera creciente, tienen tiempos máximos y verifican el TLS con el certificado raíz de Supabase (fijado en `supabase/certs`). `pnpm db:ping` revisa la conexión. Las caídas eran cortes intermitentes del internet de casa.
- **Contrato** `contracts/pronto_offer` desplegado en testnet (identidad `pronto-deployer`):
  - USDC (principal): `CCEP3RMDUYCFD3GJPDTMH2OQGX3KTV4NX7VRCXLUIIU2ZZOSKL4M5BE4`, con el SAC de USDC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` (emisor de Circle en testnet `GBBD47IF…FLA5`).
  - XLM (respaldo y pruebas): `CDJLAF3FBQCMU35CPTAF3ICL5W3XSTMDOOLWKJU3K4GGC5WOWIRBY52S`.
  - Prueba real en la instancia XLM: crear reservó 9,85, cobrar pagó 9,85 y dejó el contrato en 0, un segundo cobro falló (error #5) y `get_offer` quedó `Accepted`.
- Supabase (cuenta aparte, proyecto `iasvqinlafmpqjkwckup`) con secretos en `C:\Buildathon\.secrets\pronto.env`, fuera del repo. Cuentas de testnet `comprador` y `proveedor` importadas en Varial.
- **Diseño C** (Stitch): 11 pantallas más correcciones; **aprobado por Jorge el 23 nov**; faltan en Stitch las vistas 4, 9, 10, 12 y 15, que se construyen en código con `DESIGN.md` (`docs/mockups/README.md`).

## ⏸️ Pendientes de Jorge

1. Registrar el repo en el Hub (cierre 25 nov, 11:59 p. m.) y decidir el **push del checkpoint**.
2. Activar el USDC en `comprador` y `proveedor` y pedir USDC de prueba en el grifo de Circle (para probar con USDC real).
3. Revisar en el celular las vistas 4, 9, 10, 12 y 15 cuando el front las construya.
4. Clave gratuita de Gemini (solo para la lectura de facturas con IA).
5. Borrar `Downloads\supabase-stellar.txt` y regenerar la clave secreta de Supabase tras la entrega.
6. Crear `.env.example` (nombres, sin valores): el permiso del proyecto bloqueó su creación.

## 🔜 Siguiente

B3 (adaptadores reales: Postgres, Storage, lector de Stellar, firma), B4 (rutas Hono, OpenAPI, despliegue en Vercel), B5 (integración en testnet) y el front en una sesión aparte. Calendario y definición de "backend listo" en `docs/BACKEND_PLAN.md`.

## 🗺️ Roadmap

`docs/ROADMAP.md` (olas y briefs) y `docs/BACKEND_PLAN.md` (backend B0 a B6). Congelar funciones el 30 nov, entrega 4 dic.
