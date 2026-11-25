import { handle } from 'hono/vercel';
import { vercel } from '../src/adapters/http';
import { createApp } from '../src/composition';

/**
 * Vercel function: every path is rewritten here (vercel.json) and Hono routes it.
 * Environment variables come from the Vercel project; a missing one fails the cold start
 * with its NAME only. TESTNET only. The caller IP comes from the platform header
 * x-vercel-forwarded-for (set by Vercel's edge), never from the raw x-forwarded-for.
 */
const { app } = createApp(process.env, { clientIp: vercel });
const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const OPTIONS = handler;
export default handler;
