import { prismadb } from "../lib/prismadb";
import { generateUniqueAssignmentSlug } from "../utils/slugify";

async function backfillSlugs() {
  console.log("🔄 Starting assignment slug backfill...");

  const assignments = await prismadb.assignment.findMany({
    where: { slug: null },
    select: { id: true, title: true },
  });

  console.log(`📋 Found ${assignments.length} assignments without slugs`);

  let updated = 0;
  let failed = 0;

  for (const assignment of assignments) {
    try {
      const slug = await generateUniqueAssignmentSlug(assignment.title, prismadb, assignment.id);

      await prismadb.assignment.update({
        where: { id: assignment.id },
        data: { slug },
      });

      console.log(`  ✅ "${assignment.title}" → ${slug}`);
      updated++;
    } catch (error: any) {
      console.error(`  ❌ Failed for "${assignment.title}" (${assignment.id}): ${error.message}`);
      failed++;
    }
  }

  console.log(`\n✅ Done! Updated: ${updated}, Failed: ${failed}`);
  await prismadb.$disconnect();
}

backfillSlugs().catch((e) => {
  console.error(e);
  process.exit(1);
});
