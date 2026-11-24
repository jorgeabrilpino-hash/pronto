# NEXO-STATUS — Pronto

## 📍 Estado actual (23 nov 2026)

- Fase: **backend B0 hecho** (monorepo pnpm, Biome, CI, `packages/shared`, puertos de `apps/api`). Siguiente: B1 (migraciones en Supabase) en paralelo con B2 (dominio y casos de uso). Plan completo en `docs/BACKEND_PLAN.md` (**local, sin publicar**).
- Verificado el 23 nov: `pnpm lint`, `pnpm typecheck` y `pnpm test` en verde (11 pruebas en `shared`, 4 en `api`). El CI de GitHub aún no se ejecutó (no se ha subido).
- Contrato `contracts/pronto_offer`: 11 de 11 pruebas pasan y **desplegado en testnet el 23 nov** (identidad `pronto-deployer`):
  - USDC (principal): `CCEP3RMDUYCFD3GJPDTMH2OQGX3KTV4NX7VRCXLUIIU2ZZOSKL4M5BE4`, con el SAC de USDC `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` (emisor de Circle en testnet `GBBD47IF…FLA5`). `token()` devuelve ese SAC.
  - XLM (respaldo y pruebas): `CDJLAF3FBQCMU35CPTAF3ICL5W3XSTMDOOLWKJU3K4GGC5WOWIRBY52S`.
  - Prueba de humo real en la instancia XLM: `create_offer` reservó 9,85 XLM en el contrato, `accept` pagó 9,85 al proveedor y dejó el contrato en 0, un segundo `accept` falló con el error #5 y `get_offer` quedó en `Accepted`.
  - Falta probar con USDC: las cuentas necesitan activar el USDC y conseguir USDC de prueba en el grifo de Circle.
- Supabase (cuenta aparte, proyecto `iasvqinlafmpqjkwckup`): conexión por Session pooler probada, 0 tablas. Secretos en `C:\Buildathon\.secrets\pronto.env`, fuera del repo.
- Cuentas de testnet `comprador` y `proveedor` creadas, fondeadas e importadas en Varial.
- Repo público: https://github.com/jorgeabrilpino-hash/pronto (rama `main`).

## ⏸️ Pendientes de Jorge

1. Registrar el repo en el Hub (cierre 25 nov, 11:59 p. m.). Inscripción ya hecha.
2. `vercel login` y conectar el repo (con tu OK para desplegar).
3. `rustup target add wasm32v1-none`.
4. Clave gratuita de Gemini (solo para la lectura de facturas con IA, B6).
5. Crear `.env.example` (solo nombres, sin valores): el permiso del proyecto bloqueó su creación.

## 🗺️ Roadmap

`docs/ROADMAP.md` (olas y briefs) y `docs/BACKEND_PLAN.md` (backend B0 a B6). Congelar funciones el 30 nov, entrega 4 dic.
