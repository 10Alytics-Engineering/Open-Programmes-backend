"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteModule = exports.updateModule = exports.createModule = exports.getModule = exports.getModules = void 0;
const prismadb_1 = require("../../lib/prismadb");
const upload_service_1 = require("../../services/upload.service");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getModules = async (req, res) => {
    try {
        const { courseId, weekId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        const existingCourseWeek = await prismadb_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        const modules = await prismadb_1.prismadb.module.findMany({
            where: {
                courseWeekId: weekId,
            },
            include: {
                projectVideos: true,
                quizzes: {
                    include: {
                        answers: true,
                    },
                },
            },
            orderBy: {
                createdAt: "asc",
            },
        });
        const modulesWithIconUrls = await (0, upload_service_1.attachSignedUrls)({
            items: modules,
            keyField: "iconKey",
            urlField: "iconUrl",
        });
        return res
            .status(200)
            .json({ status: "success", message: null, data: modulesWithIconUrls });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getModules = getModules;
const getModule = async (req, res) => {
    try {
        const { courseId, weekId, moduleId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        if (!moduleId) {
            return res.status(400).json({ message: "ModuleId is required" });
        }
        const existingCourseWeek = await prismadb_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        const module = await prismadb_1.prismadb.module.findUnique({
            where: {
                id: moduleId,
                courseWeekId: weekId,
            },
            include: {
                projectVideos: true,
                quizzes: {
                    include: {
                        answers: true,
                    },
                },
            },
        });
        if (!module) {
            return res.status(404).json({ message: "Module does not exist" });
        }
        const iconUrl = module.iconKey
            ? await (0, upload_service_1.generateSignedFileUrl)(module.iconKey || "")
            : module.iconUrl || "";
        const projectVideosWithThumbnails = await (0, upload_service_1.attachSignedUrls)({
            items: module.projectVideos,
            keyField: "thumbnailKey",
            urlField: "thumbnailUrl",
        });
        return res
            .status(200)
            .json({
            status: "success",
            message: null,
            data: {
                ...module,
                iconUrl,
                projectVideos: projectVideosWithThumbnails,
            },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getModule = getModule;
const createModule = async (req, res) => {
    try {
        const { title } = req.body;
        const { courseId, weekId } = req.params;
        if (!title) {
            return res.status(400).json({ message: "Title is required" });
        }
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        const existingCourseWeek = await prismadb_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        const module = await prismadb_1.prismadb.module.create({
            data: {
                title,
                courseWeekId: weekId,
            },
            select: {
                id: true,
                title: true,
            },
        });
        return res
            .status(201)
            .json({ status: "Course module created", message: null, data: module });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.createModule = createModule;
const updateModule = async (req, res) => {
    try {
        const body = req.body;
        const { courseId, weekId, moduleId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        if (!moduleId) {
            return res.status(400).json({ message: "ModuleId is required" });
        }
        const existingCourseWeek = await prismadb_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        await prismadb_1.prismadb.module.update({
            where: {
                id: moduleId,
            },
            data: {
                ...body,
            },
        });
        return res.status(200).json({ status: "Module updated" });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateModule = updateModule;
const deleteModule = async (req, res) => {
    try {
        const { courseId, weekId, moduleId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        if (!moduleId) {
            return res.status(400).json({ message: "ModuleId is required" });
        }
        const existingCourseWeek = await prismadb_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        await prismadb_1.prismadb.module.delete({
            where: {
                id: moduleId,
            },
        });
        return res.status(200).json({ status: "Module deleted" });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteModule = deleteModule;
//# sourceMappingURL=index.js.map