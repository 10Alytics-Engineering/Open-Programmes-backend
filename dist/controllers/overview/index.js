"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOverview = void 0;
const prismadb_1 = require("../../lib/prismadb");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getOverview = async (req, res) => {
    try {
        const courses = await prismadb_1.prismadb.course.findMany();
        const users = await prismadb_1.prismadb.user.findMany();
        const cohorts = await prismadb_1.prismadb.cohort.findMany();
        const blogs = await prismadb_1.prismadb.blog.findMany();
        const modelOveriew = [
            { title: "Users", category: users, route: "/users" },
            { title: "Courses", category: courses, route: "/courses" },
            { title: "Cohorts", category: cohorts, route: "/cohort" },
            { title: "Blogs", category: blogs, route: "/blogs" },
        ];
        res
            .status(200)
            .json({ status: "success", message: null, data: modelOveriew });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getOverview = getOverview;
//# sourceMappingURL=index.js.map