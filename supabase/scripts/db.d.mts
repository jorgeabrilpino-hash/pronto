import type { Client } from 'pg';

export const repoRoot: string;
export const migrationsDir: string;
export const seedFile: string;
export function loadEnvIfNeeded(): void;
export function createClient(): Client;
export function connect(): Promise<Client>;
