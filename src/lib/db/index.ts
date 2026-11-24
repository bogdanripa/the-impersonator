import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

function makePool() {
  // Not validated here so `next build` works without a database; queries fail loudly instead.
  const url = process.env.DATABASE_URL ?? "";
  const local = !url || /localhost|127\.0\.0\.1/.test(url);
  return new Pool({ connectionString: url, max: 5, ssl: local ? false : { rejectUnauthorized: true } });
}

const pool = globalForDb.pool ?? makePool();
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
