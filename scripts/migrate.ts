// Applies db/schema.sql (idempotent). Usage: DATABASE_URL=... npm run db:migrate
import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const local = /localhost|127\.0\.0\.1|\/tmp/.test(url);
const sql = postgres(url, { max: 1, ssl: local ? false : "require", onnotice: () => {} });
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");

try {
  await sql.unsafe(schema);
  console.log("Schema applied.");
} catch (err) {
  console.error("Migration failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
