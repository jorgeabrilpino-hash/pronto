import { handle } from 'hono/vercel';
import { createApp } from '../src/composition';

/**
 * Vercel function: every path is rewritten here (vercel.json) and Hono routes it.
 * Environment variables come from the Vercel project; a missing one fails the cold start
 * with its NAME only. TESTNET only.
 */
const { app } = createApp(process.env);
const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const OPTIONS = handler;
export default handler;
