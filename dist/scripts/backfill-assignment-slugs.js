"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prismadb_1 = require("../lib/prismadb");
const slugify_1 = require("../utils/slugify");
async function backfillSlugs() {
    console.log("🔄 Starting assignment slug backfill...");
    const assignments = await prismadb_1.prismadb.assignment.findMany({
        where: { slug: null },
        select: { id: true, title: true },
    });
    console.log(`📋 Found ${assignments.length} assignments without slugs`);
    let updated = 0;
    let failed = 0;
    for (const assignment of assignments) {
        try {
            const slug = await (0, slugify_1.generateUniqueAssignmentSlug)(assignment.title, prismadb_1.prismadb, assignment.id);
            await prismadb_1.prismadb.assignment.update({
                where: { id: assignment.id },
                data: { slug },
            });
            console.log(`  ✅ "${assignment.title}" → ${slug}`);
            updated++;
        }
        catch (error) {
            console.error(`  ❌ Failed for "${assignment.title}" (${assignment.id}): ${error.message}`);
            failed++;
        }
    }
    console.log(`\n✅ Done! Updated: ${updated}, Failed: ${failed}`);
    await prismadb_1.prismadb.$disconnect();
}
backfillSlugs().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=backfill-assignment-slugs.js.map