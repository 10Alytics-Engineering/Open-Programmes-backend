/**
 * Re-slugs ALL assignments with clean, hash-free slugs.
 * Run with: npx ts-node src/scripts/reslug-assignments.ts
 */
import { prismadb } from "../lib/prismadb";
import { generateUniqueAssignmentSlug } from "../utils/slugify";

async function reslugAll() {
  console.log("🔄 Re-slugging ALL assignments with clean slugs...\n");

  const assignments = await prismadb.assignment.findMany({
    select: { id: true, title: true, slug: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`📋 Found ${assignments.length} assignments\n`);

  // Step 1: Clear all slugs so uniqueness checks start fresh
  await prismadb.assignment.updateMany({ data: { slug: null } });
  console.log("🧹 Cleared all existing slugs\n");

  let updated = 0;
  let failed = 0;

  for (const assignment of assignments) {
    try {
      const slug = await generateUniqueAssignmentSlug(assignment.title, prismadb);

      await prismadb.assignment.update({
        where: { id: assignment.id },
        data: { slug },
      });

      console.log(`  ✅  "${assignment.title}"  →  ${slug}`);
      updated++;
    } catch (error: any) {
      console.error(`  ❌ Failed for "${assignment.title}" (${assignment.id}): ${error.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Done!  Updated: ${updated},  Failed: ${failed}`);
  await prismadb.$disconnect();
}

reslugAll().catch((e) => {
  console.error(e);
  process.exit(1);
});
