import { getDatabase } from "../src/db/index";
import { seedPrecedents } from "../src/db/seed";
import { embedWithOpenAI } from "../src/lib/embedding";

/**
 * Embeds the synthetic adjudicated corpus in `fixtures/precedents/` and writes it to the
 * precedents table. Run with `npm run seed:precedents`, with DATABASE_URL and
 * OPENAI_API_KEY set.
 */
async function main() {
  const seeded = await seedPrecedents(getDatabase(), embedWithOpenAI);
  process.stdout.write(`Seeded ${seeded} adjudicated precedents.\n`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
