"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCourseVideosByCourseId = exports.deleteCourseVideo = exports.updateCourseVideo = exports.createCourseVideo = exports.getCourseVideo = exports.getCourseVideos = void 0;
const prismadb_1 = require("../../lib/prismadb");
const notification_service_1 = require("../../services/notification.service");
const upload_service_1 = require("../../services/upload.service");
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
        const existingModule = await prismadb_1.prismadb.module.findUnique({
            where: {
                id: moduleId,
                courseWeekId: weekId,
            },
        });
        if (!existingModule) {
            return res.status(404).json({ message: "Module does not exist" });
        }
        const courseVideos = await prismadb_1.prismadb.projectVideo.findMany({
            where: {
                moduleId,
                courseId,
            },
            orderBy: {
                createdAt: "asc",
            },
        });
        const videosWithThumbnailUrls = await (0, upload_service_1.attachSignedUrls)({
            items: courseVideos,
            keyField: "thumbnailKey",
            urlField: "thumbnailUrl",
        });
        return res.status(200).json({
            status: "success",
            message: null,
            data: videosWithThumbnailUrls,
        });
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
        const existingModule = await prismadb_1.prismadb.module.findUnique({
            where: {
                id: moduleId,
                courseWeekId: weekId,
            },
        });
        if (!existingModule) {
            return res.status(404).json({ message: "Module does not exist" });
        }
        const video = await prismadb_1.prismadb.projectVideo.findUnique({
            where: {
                id: videoId,
                moduleId,
                courseId,
            },
        });
        if (!video) {
            return res.status(404).json({ message: "Video does not exist" });
        }
        const thumbnailUrl = video.thumbnailKey
            ? await (0, upload_service_1.generateSignedFileUrl)(video.thumbnailKey || "")
            : video.thumbnailUrl || "";
        return res.status(200).json({
            status: "success",
            message: null,
            data: { ...video, thumbnailUrl },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourseVideo = getCourseVideo;
const createCourseVideo = async (req, res) => {
    try {
        const { title, videoUrl, thumbnailKey, duration, videoType, } = req.body;
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
        const existingCourse = await prismadb_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
        });
        if (!existingCourse) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        const existingModule = await prismadb_1.prismadb.module.findUnique({
            where: {
                id: moduleId,
                courseWeekId: weekId,
            },
            include: {
                CourseWeek: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });
        if (!existingModule) {
            return res.status(404).json({ message: "Module does not exist" });
        }
        const courseVideo = await prismadb_1.prismadb.projectVideo.create({
            data: {
                title,
                videoUrl,
                thumbnailKey,
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
        if (!courseVideo.id) {
            return res.status(422).json({
                status: "Failed to add course vidoe",
                message: "An error occured while saving course video",
            });
        }
        const students = await prismadb_1.prismadb.purchase.findMany({
            where: {
                courseId,
                user: {
                    inactive: false,
                },
            },
            select: {
                userId: true,
            },
        });
        const studentIds = students.map((purchase) => purchase.userId);
        const user = req.user;
        if (studentIds.length > 0) {
            await notification_service_1.NotificationService.createMany(studentIds, "COURSE_LESSON_VIDEO_ADDED", {
                courseId: existingCourse.id,
                courseTitle: existingCourse.title,
                weekId,
                weekName: existingModule.CourseWeek.title,
                moduleId,
                moduleTitle: existingModule.title,
                videoId: courseVideo.id,
                videoTitle: courseVideo.title,
                actionUrl: `/dashboard/lessons/${existingCourse.id}?videoId=${courseVideo.id}&weekId=${weekId}&moduleId=${moduleId}`,
            }, user.id);
        }
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
        const [existingCourse, existingModule, existingVideo] = await Promise.all([
            prismadb_1.prismadb.course.findUnique({
                where: {
                    id: courseId,
                },
            }),
            prismadb_1.prismadb.module.findFirst({
                where: {
                    id: moduleId,
                    courseWeekId: weekId,
                },
                include: {
                    CourseWeek: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                },
            }),
            prismadb_1.prismadb.projectVideo.findFirst({
                where: {
                    id: videoId,
                    moduleId,
                    courseId,
                },
            }),
        ]);
        if (!existingCourse) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        if (!existingModule) {
            return res.status(404).json({ message: "Module does not exist" });
        }
        if (!existingVideo) {
            return res.status(404).json({ message: "Video does not exist" });
        }
        const updatedVideo = await prismadb_1.prismadb.projectVideo.update({
            where: {
                id: videoId,
            },
            data: {
                ...body,
            },
        });
        if (!updatedVideo.id) {
            return res.status(422).json({
                status: "Failed to update course video",
                message: "An error occured while updating course video",
            });
        }
        const students = await prismadb_1.prismadb.purchase.findMany({
            where: {
                courseId,
                user: {
                    inactive: false,
                },
            },
            select: {
                userId: true,
            },
        });
        const studentIds = students.map((purchase) => purchase.userId);
        const user = req.user;
        if (studentIds.length > 0) {
            await notification_service_1.NotificationService.createMany(studentIds, "COURSE_LESSON_VIDEO_EDITED", {
                courseId: existingCourse.id,
                courseTitle: existingCourse.title,
                weekId,
                weekName: existingModule.CourseWeek.title,
                moduleId,
                moduleTitle: existingModule.title,
                videoId: existingVideo.id,
                videoTitle: existingVideo.title,
                actionUrl: `/dashboard/lessons/${existingCourse.id}?videoId=${existingVideo.id}&weekId=${weekId}&moduleId=${moduleId}`,
            }, user.id);
        }
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
        const [existingCourse, existingModule, existingVideo] = await Promise.all([
            prismadb_1.prismadb.course.findUnique({
                where: {
                    id: courseId,
                },
            }),
            prismadb_1.prismadb.module.findUnique({
                where: {
                    id: moduleId,
                    courseWeekId: weekId,
                },
                include: {
                    CourseWeek: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                },
            }),
            prismadb_1.prismadb.projectVideo.findUnique({
                where: {
                    id: videoId,
                    moduleId,
                    courseId,
                },
            }),
        ]);
        if (!existingCourse) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        if (!existingModule) {
            return res.status(404).json({ message: "Module does not exist" });
        }
        if (!existingVideo) {
            return res.status(404).json({ message: "Video does not exist" });
        }
        const deletedVideo = await prismadb_1.prismadb.projectVideo.delete({
            where: {
                id: videoId,
                moduleId,
                courseId,
            },
        });
        if (!deletedVideo.id) {
            return res.status(422).json({
                status: "Failed to delete course video",
                message: "An error occured while deleting course video",
            });
        }
        const students = await prismadb_1.prismadb.purchase.findMany({
            where: {
                courseId,
                user: {
                    inactive: false,
                },
            },
            select: {
                userId: true,
            },
        });
        const studentIds = students.map((purchase) => purchase.userId);
        const user = req.user;
        if (studentIds.length > 0) {
            await notification_service_1.NotificationService.createMany(studentIds, "COURSE_LESSON_VIDEO_REMOVED", {
                courseId: existingCourse.id,
                courseTitle: existingCourse.title,
                weekId,
                weekName: existingModule.CourseWeek.title,
                moduleId,
                moduleTitle: existingModule.title,
                videoId: deletedVideo.id,
                videoTitle: deletedVideo.title,
            }, user.id);
        }
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
        const existingCourse = await prismadb_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
        });
        if (!existingCourse) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        const courseVideosId = await prismadb_1.prismadb.projectVideo.findMany({
            where: {
                courseId,
            },
            orderBy: {
                createdAt: "asc",
            },
            select: {
                id: true,
            },
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