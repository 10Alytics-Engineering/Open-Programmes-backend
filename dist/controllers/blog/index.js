"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBlog = exports.updateBlog = exports.createBlog = exports.getBlog = exports.getBlogs = exports.sendBlogNotificationsOnce = void 0;
const prismadb_1 = require("../../lib/prismadb");
const upload_service_1 = require("../../services/upload.service");
const blog_mails_1 = require("../../mails/blog-mails");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const sendBlogNotificationsOnce = async (blogId) => {
    try {
        const blog = await prismadb_1.prismadb.blog.findUnique({
            where: { id: blogId },
            include: { images: true },
        });
        if (!blog) {
            console.log("Blog not found for notification:", blogId);
            return;
        }
        const subscribers = await prismadb_1.prismadb.emailSubscription.findMany({
            where: { notifyNewBlogs: true },
            select: { id: true, email: true, unsubscribeToken: true },
        });
        if (!subscribers.length) {
            console.log("No active blog subscribers found");
            return;
        }
        // fire-and-forget so request doesn't hang
        const results = await Promise.allSettled(subscribers.map((subscriber) => (0, blog_mails_1.sendBlogNotificationEmail)({
            email: subscriber.email,
            blogTitle: blog.title,
            blogId: blog.id,
            unsubscribeToken: subscriber.unsubscribeToken,
        })));
        console.log("Blog notification results:", {
            blogId: blog.id,
            total: results.length,
            sent: results.filter((r) => r.status === "fulfilled").length,
            failed: results.filter((r) => r.status === "rejected").length,
        });
        await prismadb_1.prismadb.blog.update({
            where: { id: blog.id },
            data: {
                notificationSentAt: new Date(),
            },
        });
    }
    catch (error) {
        console.log("Failed to send blog notifications");
    }
};
exports.sendBlogNotificationsOnce = sendBlogNotificationsOnce;
const getBlogs = async (req, res) => {
    try {
        const { limit, offset, search } = req.query;
        const findOptions = {
            include: {
                images: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        };
        const take = Number(limit);
        const skip = Number(offset);
        const where = search
            ? {
                OR: [
                    {
                        title: {
                            contains: String(search),
                            mode: "insensitive",
                        },
                    },
                    {
                        content: {
                            contains: String(search),
                            mode: "insensitive",
                        },
                    },
                ],
            }
            : {};
        if (limit) {
            findOptions.take = take;
        }
        if (offset) {
            findOptions.skip = skip;
        }
        findOptions.where = where;
        const [blogs, total] = await Promise.all([
            prismadb_1.prismadb.blog.findMany({ ...findOptions, include: { images: true } }),
            prismadb_1.prismadb.blog.count({
                where,
            }),
        ]);
        const blogsWithSignedImages = await Promise.all(blogs.map(async (blog) => {
            const images = await Promise.all((blog?.images || []).map(async (image) => {
                const signedUrl = image.key
                    ? await (0, upload_service_1.generateSignedFileUrl)(image.key)
                    : image.url || null;
                return {
                    ...image,
                    url: signedUrl,
                };
            }));
            return {
                ...blog,
                images,
            };
        }));
        res.status(200).json({
            status: "success",
            message: null,
            data: blogsWithSignedImages,
            pagination: {
                total: total || 0,
                limit: take || 0,
                offset: skip || 0,
                hasMore: skip + blogs.length < total,
            },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getBlogs = getBlogs;
const getBlog = async (req, res) => {
    const { blogId } = req.params;
    try {
        const existingBlog = await prismadb_1.prismadb.blog.findUnique({
            where: {
                id: blogId,
            },
            include: {
                images: true,
            },
        });
        if (!existingBlog?.id)
            return res.status(404).json({ error: "Blog not found" });
        const images = await Promise.all(existingBlog.images.map(async (image) => {
            if (image.url) {
                return image;
            }
            else {
                const url = (await (0, upload_service_1.generateSignedFileUrl)(image.key || "")) || "";
                return { ...image, url: url };
            }
        }));
        res.status(200).json({
            status: "success",
            message: existingBlog ? null : "Nonexistent Blog!",
            data: { ...existingBlog, images },
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
    try {
        const blog = await prismadb_1.prismadb.blog.create({
            data: {
                title,
                content,
                mins_read,
                images: images && images.length
                    ? {
                        create: images.map((image) => ({
                            key: image.key,
                        })),
                    }
                    : undefined,
            },
        });
        if (!blog.notificationSentAt) {
            void (0, exports.sendBlogNotificationsOnce)(blog.id);
        }
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
        const existingBlog = await prismadb_1.prismadb.blog.findUnique({
            where: {
                id: blogId,
            },
        });
        if (!existingBlog) {
            return res.status(404).json({ message: "Nonexistent Blog!" });
        }
        await prismadb_1.prismadb.blog.update({
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
        const blog = await prismadb_1.prismadb.blog.update({
            where: {
                id: existingBlog.id,
            },
            data: {
                title,
                content,
                mins_read,
                images: images && images.length
                    ? {
                        create: images.map((image) => ({
                            key: image.key,
                        })),
                    }
                    : undefined,
            },
            include: {
                images: true,
            },
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
        const existingBlog = await prismadb_1.prismadb.blog.findUnique({
            where: {
                id: blogId,
            },
        });
        if (!existingBlog) {
            return res.status(404).json({ message: "Nonexistent Blog!" });
        }
        await prismadb_1.prismadb.blog.delete({
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