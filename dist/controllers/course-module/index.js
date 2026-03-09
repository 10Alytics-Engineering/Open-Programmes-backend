"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteModule = exports.updateModule = exports.createModule = exports.getModule = exports.getModules = void 0;
const index_1 = require("../../index");
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
        const existingCourseWeek = await index_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        const modules = await index_1.prismadb.module.findMany({
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
                createdAt: "asc"
            }
        });
        return res
            .status(200)
            .json({ status: "success", message: null, data: modules });
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
        const existingCourseWeek = await index_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        const module = await index_1.prismadb.module.findUnique({
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
        return res
            .status(200)
            .json({ status: "success", message: null, data: module });
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
        const existingCourseWeek = await index_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        const module = await index_1.prismadb.module.create({
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
        const existingCourseWeek = await index_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        await index_1.prismadb.module.update({
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
        const existingCourseWeek = await index_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        await index_1.prismadb.module.delete({
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