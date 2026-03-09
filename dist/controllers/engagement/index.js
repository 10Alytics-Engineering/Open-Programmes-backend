"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserCourseVideos = exports.getCourseVideos = exports.getCourseEngagementOverview = exports.getVideoEngagementDetails = exports.getStudentEngagement = void 0;
const index_1 = require("../../index");
const getStudentEngagement = async (req, res) => {
    try {
        const { userId } = req.params;
        // Get all courses the student is enrolled in
        const enrolledCourses = await index_1.prismadb.purchase.findMany({
            where: { userId },
            include: {
                course: {
                    include: {
                        course_weeks: {
                            include: {
                                courseModules: {
                                    include: {
                                        projectVideos: true,
                                        quizzes: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        // Get all completed videos - FIXED: Use videoId instead of video relation
        const completedVideos = await index_1.prismadb.userProgress.findMany({
            where: { userId, isCompleted: true },
            select: {
                videoId: true,
                courseId: true,
                isCompleted: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        // Get video details separately
        const videoDetails = await index_1.prismadb.projectVideo.findMany({
            where: {
                id: { in: completedVideos.map((v) => v.videoId) },
            },
            include: {
                courseModule: {
                    include: {
                        CourseWeek: true,
                    },
                },
            },
        });
        // Get all completed quizzes - FIXED: Simplified query
        const quizAnswers = await index_1.prismadb.userQuizAnswer.findMany({
            where: { userId },
            include: {
                quizAnswer: {
                    include: {
                        quiz: {
                            include: {
                                courseModule: {
                                    include: {
                                        CourseWeek: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        // Calculate engagement metrics - FIXED: Use joined data
        const engagementData = enrolledCourses.map((course) => {
            const totalVideos = course.course.course_weeks.reduce((acc, week) => {
                return (acc +
                    week.courseModules.reduce((moduleAcc, module) => {
                        return moduleAcc + module.projectVideos.length;
                    }, 0));
            }, 0);
            const totalQuizzes = course.course.course_weeks.reduce((acc, week) => {
                return (acc +
                    week.courseModules.reduce((moduleAcc, module) => {
                        return moduleAcc + module.quizzes.length;
                    }, 0));
            }, 0);
            // FIXED: Filter using videoDetails instead of direct relation
            const videosCompleted = videoDetails.filter((v) => v.courseModule?.CourseWeek?.courseId === course.courseId &&
                completedVideos.some((cv) => cv.videoId === v.id)).length;
            const quizzesCompleted = quizAnswers.filter((q) => q.quizAnswer.quiz.courseModule?.CourseWeek?.courseId ===
                course.courseId).length;
            // FIXED: Get last activity without relying on video relation
            const lastActivity = [...completedVideos, ...quizAnswers].filter((item) => ("videoId" in item
                ? videoDetails.find((v) => v.id === item.videoId)?.courseModule
                    ?.CourseWeek?.courseId
                : item.quizAnswer.quiz.courseModule?.CourseWeek?.courseId) ===
                course.courseId);
            return {
                courseId: course.courseId,
                courseTitle: course.course.title,
                totalVideos,
                totalQuizzes,
                videosCompleted,
                quizzesCompleted,
                videoCompletionRate: totalVideos > 0 ? (videosCompleted / totalVideos) * 100 : 0,
                quizCompletionRate: totalQuizzes > 0 ? (quizzesCompleted / totalQuizzes) * 100 : 0,
                lastActivity,
            };
        });
        res.status(200).json(engagementData);
    }
    catch (error) {
        console.error("Error fetching student engagement:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getStudentEngagement = getStudentEngagement;
const getVideoEngagementDetails = async (req, res) => {
    try {
        const { videoId } = req.params;
        // First get video details
        const videoDetails = await index_1.prismadb.projectVideo.findUnique({
            where: { id: videoId },
            select: {
                id: true,
                title: true,
                courseModule: {
                    select: {
                        title: true,
                        CourseWeek: {
                            select: {
                                course: {
                                    select: {
                                        id: true,
                                        title: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!videoDetails) {
            return res.status(404).json({ message: "Video not found" });
        }
        // Get all user progress records for this video
        const videoEngagement = await index_1.prismadb.userProgress.findMany({
            where: { videoId },
            select: {
                id: true,
                userId: true,
                isCompleted: true,
                updatedAt: true,
                user: {
                    select: {
                        name: true,
                    },
                },
            },
        });
        if (!videoEngagement.length) {
            return res
                .status(404)
                .json({ message: "No engagement data found for this video" });
        }
        // Calculate engagement metrics
        const totalViews = videoEngagement.length;
        const completionRate = (videoEngagement.filter((v) => v.isCompleted).length / totalViews) * 100;
        res.status(200).json({
            videoDetails: {
                title: videoDetails.title,
                course: videoDetails.courseModule.CourseWeek.course.title,
                module: videoDetails.courseModule.title,
            },
            engagementMetrics: {
                totalViews,
                completionRate,
                lastViewed: videoEngagement[0].updatedAt,
            },
            userEngagement: videoEngagement.map((engagement) => ({
                userId: engagement.userId,
                userName: engagement.user.name,
                isCompleted: engagement.isCompleted,
                lastWatched: engagement.updatedAt,
            })),
        });
    }
    catch (error) {
        console.error("Error fetching video engagement details:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getVideoEngagementDetails = getVideoEngagementDetails;
const getCourseEngagementOverview = async (req, res) => {
    try {
        const { courseId } = req.params;
        // Get all students enrolled in the course
        const enrolledStudents = await index_1.prismadb.purchase.findMany({
            where: { courseId },
            select: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        });
        // Get all videos in the course
        const courseVideos = await index_1.prismadb.projectVideo.findMany({
            where: { courseId },
            select: {
                id: true,
            },
        });
        // Get all quizzes in the course
        const courseQuizzes = await index_1.prismadb.quiz.findMany({
            where: {
                moduleId: {
                    in: await index_1.prismadb.module
                        .findMany({
                        where: {
                            CourseWeek: {
                                courseId,
                            },
                        },
                        select: { id: true },
                    })
                        .then((modules) => modules.map((m) => m.id)),
                },
            },
            select: {
                id: true,
            },
        });
        // Get all engagement data for these students
        const engagementData = await Promise.all(enrolledStudents.map(async ({ user }) => {
            const completedVideos = await index_1.prismadb.userProgress.count({
                where: {
                    userId: user.id,
                    videoId: { in: courseVideos.map((v) => v.id) },
                    isCompleted: true,
                },
            });
            const quizAnswers = await index_1.prismadb.userQuizAnswer.count({
                where: {
                    userId: user.id,
                    quizAnswer: {
                        quizId: { in: courseQuizzes.map((q) => q.id) },
                    },
                },
            });
            const lastActivity = await index_1.prismadb.userProgress.findFirst({
                where: { userId: user.id },
                orderBy: { updatedAt: "desc" },
                select: { updatedAt: true },
            });
            return {
                userId: user.id,
                userName: user.name,
                email: user.email,
                videosCompleted: completedVideos,
                totalVideos: courseVideos.length,
                quizzesCompleted: quizAnswers,
                totalQuizzes: courseQuizzes.length,
                lastActivity: lastActivity?.updatedAt,
            };
        }));
        // Calculate overall course metrics
        const totalStudents = enrolledStudents.length;
        const averageVideoCompletion = engagementData.reduce((acc, curr) => acc + (curr.videosCompleted / curr.totalVideos) * 100, 0) / totalStudents;
        const averageQuizCompletion = engagementData.reduce((acc, curr) => acc + (curr.quizzesCompleted / curr.totalQuizzes) * 100, 0) / totalStudents;
        res.status(200).json({
            courseId,
            totalStudents,
            averageVideoCompletion,
            averageQuizCompletion,
            studentEngagement: engagementData.sort((a, b) => new Date(b.lastActivity || 0).getTime() -
                new Date(a.lastActivity || 0).getTime()),
        });
    }
    catch (error) {
        console.error("Error fetching course engagement overview:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getCourseEngagementOverview = getCourseEngagementOverview;
const getCourseVideos = async (req, res) => {
    try {
        const { courseId } = req.params;
        // Get all videos for the course with their module and week information
        const videos = await index_1.prismadb.projectVideo.findMany({
            where: { courseId },
            select: {
                id: true,
                title: true,
                duration: true,
                thumbnailUrl: true,
                createdAt: true,
                courseModule: {
                    select: {
                        title: true,
                        CourseWeek: {
                            select: {
                                title: true,
                                courseId: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'asc'
            }
        });
        if (!videos.length) {
            return res.status(404).json({ message: "No videos found for this course" });
        }
        // Transform the data to a simpler structure
        const formattedVideos = videos.map(video => ({
            id: video.id,
            title: video.title,
            duration: video.duration,
            thumbnailUrl: video.thumbnailUrl,
            moduleTitle: video.courseModule.title,
            weekTitle: video.courseModule.CourseWeek.title,
            createdAt: video.createdAt
        }));
        res.status(200).json(formattedVideos);
    }
    catch (error) {
        console.error("Error fetching course videos:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getCourseVideos = getCourseVideos;
const getUserCourseVideos = async (req, res) => {
    try {
        const { userId, courseId } = req.params;
        // First get all user progress records for this course
        const userProgress = await index_1.prismadb.userProgress.findMany({
            where: {
                userId,
                courseId
            },
            select: {
                videoId: true,
                isCompleted: true,
                updatedAt: true,
                createdAt: true
            },
            orderBy: {
                updatedAt: 'desc' // Show most recently watched first
            }
        });
        if (!userProgress.length) {
            return res.status(404).json({ message: "No video progress found for this user in the selected course" });
        }
        // Get details for all videos the user has progress for
        const videos = await index_1.prismadb.projectVideo.findMany({
            where: {
                id: { in: userProgress.map(p => p.videoId) },
                courseId
            },
            include: {
                courseModule: {
                    include: {
                        CourseWeek: {
                            select: {
                                title: true
                            }
                        }
                    }
                }
            }
        });
        // Combine the data
        const formattedVideos = userProgress.map(progress => {
            const video = videos.find(v => v.id === progress.videoId);
            if (!video)
                return null;
            return {
                id: progress.videoId,
                title: video.title,
                duration: video.duration,
                thumbnailUrl: video.thumbnailUrl,
                moduleTitle: video.courseModule.title,
                weekTitle: video.courseModule.CourseWeek.title,
                isCompleted: progress.isCompleted,
                lastWatched: progress.updatedAt
            };
        }).filter(video => video !== null);
        res.status(200).json(formattedVideos);
    }
    catch (error) {
        console.error("Error fetching user's course videos:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};
exports.getUserCourseVideos = getUserCourseVideos;
//# sourceMappingURL=index.js.map