# NEXO-STATUS — Pronto

## 📍 Estado actual (18 nov 2026)
- Fase: **Ola 0 cerrada** (análisis + paquete base). Siguiente: Ola 1 (S1–S4 en paralelo), bloqueada por los pendientes 1, 2 y 3 de Jorge.
- Idea validada con ajustes: ver `docs/ANALISIS.md` §6 (USDC testnet como activo principal, solo facturas no vencidas, Supabase sin login con la red como verdad).
- Contrato `contracts/pronto_offer` escrito con 11 pruebas; **no ejecutadas aquí** (no hay Rust ni Stellar CLI en la máquina). Sin desplegar.
- Repo git local iniciado en `main`, sin commits ni remoto. `gh` CLI no instalado.

## ⏸️ Pendientes de Jorge
1. Inscripción en el Hub (cierre 24 nov).
2. Repo público en GitHub + registrarlo en el Hub (cierre 25 nov).
3. Instalar Rust + `wasm32v1-none` + Stellar CLI.
4. Dos cuentas Varial de testnet (direcciones públicas), proyecto Supabase, OK de Vercel.

## 🗺️ Roadmap
`docs/ROADMAP.md` — olas 1 a 4, briefs de sesión S1–S10, congelar funciones el 30 nov, entrega 4 dic.
