"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCourseVideosByCourseId = exports.deleteCourseVideo = exports.updateCourseVideo = exports.createCourseVideo = exports.getCourseVideo = exports.getCourseVideos = void 0;
const index_1 = require("../../index");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getCourseVideos = async (req, res) => {
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
        const existingModule = await index_1.prismadb.module.findUnique({
            where: {
                id: moduleId,
                courseWeekId: weekId,
            },
        });
        if (!existingModule) {
            return res.status(404).json({ message: "Module does not exist" });
        }
        const courseVideos = await index_1.prismadb.projectVideo.findMany({
            where: {
                moduleId,
                courseId,
            },
            orderBy: {
                createdAt: "asc"
            }
        });
        return res
            .status(200)
            .json({ status: "success", message: null, data: courseVideos });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourseVideos = getCourseVideos;
const getCourseVideo = async (req, res) => {
    try {
        const { courseId, weekId, moduleId, videoId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        if (!moduleId) {
            return res.status(400).json({ message: "ModuleId is required" });
        }
        if (!videoId) {
            return res.status(400).json({ message: "VideoId is required" });
        }
        const existingModule = await index_1.prismadb.module.findUnique({
            where: {
                id: moduleId,
                courseWeekId: weekId,
            },
        });
        if (!existingModule) {
            return res.status(404).json({ message: "Module does not exist" });
        }
        const video = await index_1.prismadb.projectVideo.findUnique({
            where: {
                id: videoId,
                moduleId,
                courseId,
            },
        });
        if (!video) {
            return res.status(404).json({ message: "Video does not exist" });
        }
        return res
            .status(200)
            .json({ status: "success", message: null, data: video });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourseVideo = getCourseVideo;
const createCourseVideo = async (req, res) => {
    try {
        const { title, videoUrl, thumbnailUrl, duration, videoType, } = req.body;
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
        const existingCourse = await index_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
        });
        if (!existingCourse) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        const existingModule = await index_1.prismadb.module.findUnique({
            where: {
                id: moduleId,
                courseWeekId: weekId,
            },
        });
        if (!existingModule) {
            return res.status(404).json({ message: "Module does not exist" });
        }
        const courseVideo = await index_1.prismadb.projectVideo.create({
            data: {
                title,
                videoUrl,
                thumbnailUrl,
                duration,
                videoType: videoType || "VIMEO",
                moduleId,
                courseId,
            },
            select: {
                id: true,
                title: true,
                videoType: true,
            },
        });
        return res.status(201).json({
            status: "Course video created",
            message: null,
            data: courseVideo,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.createCourseVideo = createCourseVideo;
const updateCourseVideo = async (req, res) => {
    try {
        const body = req.body;
        const { courseId, weekId, moduleId, videoId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        if (!moduleId) {
            return res.status(400).json({ message: "ModuleId is required" });
        }
        if (!videoId) {
            return res.status(400).json({ message: "VideoId is required" });
        }
        const existingCourse = await index_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
        });
        if (!existingCourse) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        const existingModule = await index_1.prismadb.module.findUnique({
            where: {
                id: moduleId,
                courseWeekId: weekId,
            },
        });
        if (!existingModule) {
            return res.status(404).json({ message: "Module does not exist" });
        }
        const existingVideo = await index_1.prismadb.projectVideo.findUnique({
            where: {
                id: videoId,
                moduleId,
                courseId,
            },
        });
        if (!existingVideo) {
            return res.status(404).json({ message: "Video does not exist" });
        }
        await index_1.prismadb.projectVideo.update({
            where: {
                id: videoId,
                moduleId,
                courseId,
            },
            data: {
                ...body,
            },
        });
        return res.status(200).json({ status: "Course video updated" });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateCourseVideo = updateCourseVideo;
const deleteCourseVideo = async (req, res) => {
    try {
        const { courseId, weekId, moduleId, videoId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        if (!moduleId) {
            return res.status(400).json({ message: "ModuleId is required" });
        }
        if (!videoId) {
            return res.status(400).json({ message: "VideoId is required" });
        }
        const existingCourse = await index_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
        });
        if (!existingCourse) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        const existingModule = await index_1.prismadb.module.findUnique({
            where: {
                id: moduleId,
                courseWeekId: weekId,
            },
        });
        if (!existingModule) {
            return res.status(404).json({ message: "Module does not exist" });
        }
        const existingVideo = await index_1.prismadb.projectVideo.findUnique({
            where: {
                id: videoId,
                moduleId,
                courseId,
            },
        });
        if (!existingVideo) {
            return res.status(404).json({ message: "Video does not exist" });
        }
        await index_1.prismadb.projectVideo.delete({
            where: {
                id: videoId,
                moduleId,
                courseId,
            },
        });
        return res.status(200).json({ status: "Course video deleted" });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteCourseVideo = deleteCourseVideo;
const getCourseVideosByCourseId = async (req, res) => {
    try {
        const { courseId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        const existingCourse = await index_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
        });
        if (!existingCourse) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        const courseVideosId = await index_1.prismadb.projectVideo.findMany({
            where: {
                courseId,
            },
            orderBy: {
                createdAt: "asc"
            },
            select: {
                id: true,
            }
        });
        return res
            .status(200)
            .json({ status: "success", message: null, data: courseVideosId });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourseVideosByCourseId = getCourseVideosByCourseId;
//# sourceMappingURL=index.js.map