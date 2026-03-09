"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOverview = void 0;
const index_1 = require("../../index");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getOverview = async (req, res) => {
    try {
        const courses = await index_1.prismadb.course.findMany();
        const users = await index_1.prismadb.user.findMany();
        const cohorts = await index_1.prismadb.cohort.findMany();
        const blogs = await index_1.prismadb.blog.findMany();
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