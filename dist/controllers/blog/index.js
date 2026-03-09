"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBlog = exports.updateBlog = exports.createBlog = exports.getBlog = exports.getBlogs = void 0;
const index_1 = require("../../index");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getBlogs = async (req, res) => {
    try {
        const blogs = await index_1.prismadb.blog.findMany({
            include: {
                images: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        res.status(200).json({ status: "success", message: null, data: blogs });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getBlogs = getBlogs;
const getBlog = async (req, res) => {
    const { blogId } = req.params;
    try {
        const existingBlog = await index_1.prismadb.blog.findUnique({
            where: {
                id: blogId,
            },
            include: {
                images: true,
            },
        });
        res
            .status(200)
            .json({
            status: "success",
            message: existingBlog ? "Nonexistent Blog!" : null,
            data: existingBlog,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getBlog = getBlog;
const createBlog = async (req, res) => {
    const { title, content, mins_read, images, } = req.body;
    if (!title || !content) {
        return res.status(400).json({ message: "Title and Content is required" });
    }
    if (!images || !images.length) {
        return res.status(400).json({ message: "Image is required" });
    }
    try {
        const blog = await index_1.prismadb.blog.create({
            data: {
                title,
                content,
                mins_read,
                images: {
                    createMany: {
                        //@ts-ignore
                        data: [...images.map((image) => image)],
                    },
                },
            },
        });
        res.status(200).json({
            status: "success",
            message: "Blog created successfully",
            data: blog,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.createBlog = createBlog;
const updateBlog = async (req, res) => {
    const { blogId } = req.params;
    const { title, content, mins_read, images, } = req.body;
    try {
        const existingBlog = await index_1.prismadb.blog.findUnique({
            where: {
                id: blogId,
            },
        });
        if (!existingBlog) {
            return res.status(404).json({ message: "Nonexistent Blog!" });
        }
        await index_1.prismadb.blog.update({
            where: {
                id: existingBlog.id,
            },
            data: {
                title,
                content,
                mins_read,
                images: {
                    deleteMany: {},
                },
            },
        });
        const blog = await index_1.prismadb.blog.update({
            where: {
                id: existingBlog.id,
            },
            data: {
                title,
                content,
                mins_read,
                images: {
                    createMany: {
                        //@ts-ignore
                        data: [...images.map((image) => image)],
                    },
                },
            },
            include: {
                images: true
            }
        });
        res.status(200).json({
            status: "success",
            message: "Blog updated successfully",
            data: blog,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateBlog = updateBlog;
const deleteBlog = async (req, res) => {
    const { blogId } = req.params;
    try {
        const existingBlog = await index_1.prismadb.blog.findUnique({
            where: {
                id: blogId,
            },
        });
        if (!existingBlog) {
            return res.status(404).json({ message: "Nonexistent Blog!" });
        }
        await index_1.prismadb.blog.delete({
            where: {
                id: existingBlog.id,
            },
        });
        res
            .status(200)
            .json({ status: "success", message: "Blog deleted sucessfully" });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteBlog = deleteBlog;
//# sourceMappingURL=index.js.map