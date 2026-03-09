"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const blog_1 = require("../controllers/blog");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.get("/blogs", blog_1.getBlogs);
    router.post("/blogs", middleware_1.isCourseAdmin, blog_1.createBlog);
    router.get("/blogs/:blogId", blog_1.getBlog);
    router.put("/blogs/:blogId", middleware_1.isCourseAdmin, blog_1.updateBlog);
    router.delete("/blogs/:blogId", middleware_1.isAdmin, blog_1.deleteBlog);
};
//# sourceMappingURL=blog.js.map