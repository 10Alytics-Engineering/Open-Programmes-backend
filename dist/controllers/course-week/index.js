"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unPublishCourseWeek = exports.publishCourseWeek = exports.deleteCourseWeek = exports.updateCourseWeek = exports.createCourseWeek = exports.getCourseWeek = exports.getCourseWeeks = void 0;
const index_1 = require("../../index");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getCourseWeeks = async (req, res) => {
    const { courseId } = req.params;
    if (!courseId) {
        return res.status(400).json({ message: "CourseId is required" });
    }
    try {
        const courseWeeks = await index_1.prismadb.courseWeek.findMany({
            where: {
                courseId,
            },
            orderBy: {
                createdAt: "asc",
            },
        });
        return res
            .status(200)
            .json({ status: "success", message: null, data: courseWeeks });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourseWeeks = getCourseWeeks;
const getCourseWeek = async (req, res) => {
    try {
        const { courseId, weekId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        const course = await index_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
        });
        if (!course) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        const courseWeek = await index_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
            include: {
                attachments: true,
                courseModules: {
                    include: {
                        projectVideos: true,
                    },
                },
            },
        });
        if (!courseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        return res
            .status(200)
            .json({ status: "success", message: null, data: courseWeek });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourseWeek = getCourseWeek;
const createCourseWeek = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { title } = req.body;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!title) {
            return res.status(400).json({ message: "Title is required" });
        }
        const courseWeek = await index_1.prismadb.courseWeek.create({
            data: {
                title,
                courseId,
            },
            select: {
                id: true,
                title: true,
            },
        });
        return res
            .status(201)
            .json({ status: "Course week created", message: null, data: courseWeek });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.createCourseWeek = createCourseWeek;
const updateCourseWeek = async (req, res) => {
    try {
        const body = req.body;
        const { courseId, weekId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        const course = await index_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
        });
        if (!course) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        const updatedCourseWeek = await index_1.prismadb.courseWeek.update({
            where: {
                id: weekId,
            },
            data: {
                ...body,
            },
        });
        return res
            .status(200)
            .json({
            status: "Course week updated",
            message: null,
            data: updatedCourseWeek,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateCourseWeek = updateCourseWeek;
const deleteCourseWeek = async (req, res) => {
    try {
        const { courseId, weekId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        const course = await index_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
        });
        if (!course) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        // Use a transaction to ensure atomicity
        await index_1.prismadb.$transaction(async (tx) => {
            // First, delete all related Module records
            await tx.module.deleteMany({
                where: {
                    courseWeekId: weekId,
                },
            });
            // Then delete the CourseWeek
            await tx.courseWeek.delete({
                where: {
                    id: weekId,
                },
            });
        });
        return res.status(200).json({ status: "Course week and related modules deleted" });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteCourseWeek = deleteCourseWeek;
const publishCourseWeek = async (req, res) => {
    try {
        const { courseId, weekId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        const course = await index_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
        });
        if (!course) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        const updatedCourseWeek = await index_1.prismadb.courseWeek.update({
            where: {
                id: weekId,
            },
            data: {
                isPublished: true,
            },
        });
        return res
            .status(200)
            .json({
            status: "Course week updated",
            message: null,
            data: updatedCourseWeek,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.publishCourseWeek = publishCourseWeek;
const unPublishCourseWeek = async (req, res) => {
    try {
        const { courseId, weekId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        const course = await index_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
        });
        if (!course) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        const updatedCourseWeek = await index_1.prismadb.courseWeek.update({
            where: {
                id: weekId,
            },
            data: {
                isPublished: false,
            },
        });
        return res
            .status(200)
            .json({
            status: "Course week updated",
            message: null,
            data: updatedCourseWeek,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.unPublishCourseWeek = unPublishCourseWeek;
//# sourceMappingURL=index.js.map