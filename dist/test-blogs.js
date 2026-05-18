"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prismadb_1 = require("./lib/prismadb");
async function main() {
    try {
        console.log("DATABASE_URL:", process.env.DATABASE_URL);
        console.log("Fetching blogs from DB...");
        const blogs = await prismadb_1.prismadb.blog.findMany({
            include: {
                images: true,
            },
        });
        console.log("Successfully fetched blogs:", blogs);
    }
    catch (error) {
        console.error("CRITICAL PRISMA ERROR:", error);
    }
}
main();
//# sourceMappingURL=test-blogs.js.map