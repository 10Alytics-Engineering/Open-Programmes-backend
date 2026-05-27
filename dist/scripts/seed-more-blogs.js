"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prismadb_1 = require("../lib/prismadb");
async function seed60Blogs() {
    console.log("🌱 Seeding 60 additional blogs for pagination/infinite scroll testing...\n");
    const count = 60;
    for (let i = 1; i <= count; i++) {
        const title = `Insightful Data Strategy & Analytics Article #${i}`;
        const mins_read = `${3 + (i % 8)} mins read`;
        const content = `
      <h2>The Importance of Modern Analytics (#${i})</h2>
      <p>Data analytics has evolved from standard spreadsheet tracking to automated, multi-pipeline predictive models. In this article, we cover key strategies to scale operations.</p>
      <h3>Key Pillars:</h3>
      <ul>
        <li>Pipeline Automation: Automating ELT processes.</li>
        <li>Data Quality: Implementing robust sanity checks and unit tests.</li>
        <li>Data Literacy: Ensuring stakeholders understand KPI derivations.</li>
      </ul>
      <p>As organisations grow, these steps become critical to maintain high intelligence accuracy.</p>
    `;
        // Pick from a set of curated Unsplash images to make it look premium
        const imageIds = [
            "photo-1551288049-bebda4e38f71",
            "photo-1558494949-ef010cbdcc31",
            "photo-1526374965328-7f61d4dc18c5",
            "photo-1521791136368-1a8b27503462",
            "photo-1544383835-bda2bc66a55d",
            "photo-1527474305487-b87b222841cc",
            "photo-1551836022-d5d88e9218df",
            "photo-1460925895917-afdab827c52f",
            "photo-1563986768609-322da13575f3"
        ];
        const imageId = imageIds[(i - 1) % imageIds.length];
        const imageUrl = `https://images.unsplash.com/${imageId}?q=80&w=600&auto=format&fit=crop`;
        await prismadb_1.prismadb.blog.create({
            data: {
                title,
                mins_read,
                content,
                images: {
                    create: [{ url: imageUrl }]
                }
            }
        });
        if (i % 10 === 0) {
            console.log(`  Added ${i} blogs...`);
        }
    }
    console.log("\n✅ Completed seeding 60 blogs!");
    await prismadb_1.prismadb.$disconnect();
}
seed60Blogs().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=seed-more-blogs.js.map