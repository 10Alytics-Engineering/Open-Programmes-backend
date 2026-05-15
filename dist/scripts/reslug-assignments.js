"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Re-slugs ALL assignments with clean, hash-free slugs.
 * Run with: npx ts-node src/scripts/reslug-assignments.ts
 */
const prismadb_1 = require("../lib/prismadb");
const slugify_1 = require("../utils/slugify");
async function reslugAll() {
    console.log("🔄 Re-slugging ALL assignments with clean slugs...\n");
    const assignments = await prismadb_1.prismadb.assignment.findMany({
        select: { id: true, title: true, slug: true },
        orderBy: { createdAt: "asc" },
    });
    console.log(`📋 Found ${assignments.length} assignments\n`);
    // Step 1: Clear all slugs so uniqueness checks start fresh
    await prismadb_1.prismadb.assignment.updateMany({ data: { slug: null } });
    console.log("🧹 Cleared all existing slugs\n");
    let updated = 0;
    let failed = 0;
    for (const assignment of assignments) {
        try {
            const slug = await (0, slugify_1.generateUniqueAssignmentSlug)(assignment.title, prismadb_1.prismadb);
            await prismadb_1.prismadb.assignment.update({
                where: { id: assignment.id },
                data: { slug },
            });
            console.log(`  ✅  "${assignment.title}"  →  ${slug}`);
            updated++;
        }
        catch (error) {
            console.error(`  ❌ Failed for "${assignment.title}" (${assignment.id}): ${error.message}`);
            failed++;
        }
    }
    console.log(`\n✅ Done!  Updated: ${updated},  Failed: ${failed}`);
    await prismadb_1.prismadb.$disconnect();
}
reslugAll().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=reslug-assignments.js.map