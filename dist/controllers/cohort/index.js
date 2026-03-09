"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadOnboardingBrochure = exports.upload = exports.updateCohortCourseTimeTable = exports.updateCohortCourseWeekPublishStatus = exports.deleteCohort = exports.updateCohort = exports.createCohort = exports.getCohortsForChangeRequests = exports.getCohort = exports.getCohorts = void 0;
const index_1 = require("../../index");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getCohorts = async (req, res) => {
    try {
        const cohorts = await index_1.prismadb.cohort.findMany({
            include: {
                course: {
                    include: {
                        course_weeks: {
                            include: {
                                attachments: true,
                                courseModules: {
                                    include: {
                                        projectVideos: true,
                                    },
                                },
                            },
                        },
                    },
                },
                cohortCourses: {
                    include: {
                        cohortWeeks: {
                            include: {
                                attachments: true,
                                cohortModules: {
                                    include: {
                                        cohortQuizzes: {
                                            include: {
                                                cohortQuizAnswers: true,
                                            },
                                        },
                                        cohortProjectVideos: true,
                                    },
                                },
                            },
                        },
                        cohortTimeTable: true,
                    },
                },
                users: {
                    include: {
                        user: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        res.status(200).json({ status: "success", message: null, data: cohorts });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCohorts = getCohorts;
const getCohort = async (req, res) => {
    try {
        const user = req.user;
        const userId = user?.id;
        const isAdmin = user?.role === "ADMIN" || user?.role === "COURSE_ADMIN";
        const { cohortId } = req.params;
        if (!cohortId) {
            return res.status(400).json({ message: "CohortId is required" });
        }
        if (!userId) {
            return res
                .status(400)
                .json({ message: "Token is required, UserId is required" });
        }
        const cohort = await index_1.prismadb.cohort.findUnique({
            where: {
                id: cohortId,
            },
            include: {
                cohortCourses: {
                    include: {
                        cohortWeeks: {
                            include: {
                                attachments: true,
                                cohortModules: {
                                    include: {
                                        cohortQuizzes: {
                                            include: {
                                                cohortQuizAnswers: true,
                                            },
                                        },
                                        cohortProjectVideos: true,
                                    },
                                },
                            },
                        },
                        cohortTimeTable: true,
                    },
                },
                users: {
                    include: {
                        user: true,
                    },
                },
            },
        });
        //check if user is enrolled in cohort
        const userInCohort = await index_1.prismadb.userCohort.findFirst({
            where: {
                userId,
                cohortId,
                courseId: cohort?.courseId,
            },
        });
        const isUserInCohort = userInCohort ? true : false;
        if (!isUserInCohort && !isAdmin) {
            return res
                .status(403)
                .json({ message: "User is not allowed in this cohort" });
        }
        res.status(200).json({ status: "success", message: null, data: cohort });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCohort = getCohort;
const getCohortsForChangeRequests = async (req, res) => {
    try {
        const currentDate = new Date();
        const twoMonthsFromNow = new Date();
        twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
        // Only get cohorts from current date up to 2 months in the future
        const cohorts = await index_1.prismadb.cohort.findMany({
            where: {
                startDate: {
                    gte: currentDate, // Greater than or equal to current date
                    lte: twoMonthsFromNow, // Less than or equal to 2 months from now
                },
            },
            include: {
                course: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
            orderBy: {
                startDate: "asc",
            },
        });
        res.status(200).json({ status: "success", data: cohorts });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCohortsForChangeRequests = getCohortsForChangeRequests;
const createCohort = async (req, res) => {
    try {
        const { name, startDate, endDate, courseId, } = req.body;
        if (!name) {
            return res.status(400).json({ message: "Name is required" });
        }
        const result = await index_1.prismadb.$transaction(async (prisma) => {
            // Step 1: Create a new Cohort
            const cohort = await prisma.cohort.create({
                data: {
                    name,
                    startDate,
                    endDate,
                    courseId,
                },
            });
            // Step 2: Fetch the course and its related data
            const course = await prisma.course.findUnique({
                where: { id: courseId },
                include: {
                    timetable: true,
                    course_weeks: {
                        include: {
                            courseModules: {
                                include: {
                                    projectVideos: true,
                                    quizzes: {
                                        include: {
                                            answers: true,
                                        },
                                    },
                                },
                            },
                            attachments: true,
                        },
                    },
                },
            });
            if (!course) {
                throw new Error("Course not found");
            }
            // Step 3: Create a CohortCourse instance with the course data
            const cohortCourse = await prisma.cohortCourse.create({
                data: {
                    cohortId: cohort.id,
                    courseId: course.id,
                    title: course.title,
                    description: course.description,
                    price: course.price,
                    imageUrl: course.imageUrl,
                    course_duration: course.course_duration,
                    course_instructor_name: course.course_instructor_name,
                    course_instructor_image: course.course_instructor_image,
                    course_instructor_title: course.course_instructor_title,
                    course_instructor_description: course.course_instructor_description,
                    brochureUrl: course.brochureUrl,
                    course_preview_video: course.course_preview_video,
                },
            });
            // Step 4: Copy weeks, modules, videos, attachments, and quizzes to cohort-specific models
            for (const timetable of course.timetable) {
                await prisma.cohortCourseTimeTable.create({
                    data: {
                        name: timetable.name,
                        category: timetable.category,
                        date: timetable.date ? new Date(timetable.date) : new Date(),
                        cohortCourse: {
                            connect: {
                                id: cohortCourse.id,
                            },
                        },
                    },
                });
            }
            for (const week of course.course_weeks) {
                const cohortCourseWeek = await prisma.cohortCourseWeek.create({
                    data: {
                        title: week.title,
                        iconUrl: week.iconUrl,
                        cohortCourseId: cohortCourse.id,
                        isPublished: week.isPublished,
                    },
                });
                for (const attachment of week.attachments) {
                    await prisma.cohortAttachment.create({
                        data: {
                            name: attachment.name,
                            url: attachment.url,
                            cohortCourseWeekId: cohortCourseWeek.id,
                        },
                    });
                }
                for (const module of week.courseModules) {
                    const cohortCourseModule = await prisma.cohortCourseModule.create({
                        data: {
                            title: module.title,
                            description: module.description,
                            iconUrl: module.iconUrl,
                            cohortCourseWeekId: cohortCourseWeek.id,
                            cohortCourseId: cohortCourse.id,
                        },
                    });
                    for (const video of module.projectVideos) {
                        await prisma.cohortProjectVideo.create({
                            data: {
                                title: video.title,
                                videoUrl: video.videoUrl,
                                thumbnailUrl: video.thumbnailUrl,
                                duration: video.duration,
                                cohortCourseModuleId: cohortCourseModule.id,
                                cohortCourseId: cohortCourse.id,
                            },
                        });
                    }
                    for (const quiz of module.quizzes) {
                        const cohortQuiz = await prisma.cohortQuiz.create({
                            data: {
                                question: quiz.question,
                                cohortCourseModuleId: cohortCourseModule.id,
                                cohortCourseId: cohortCourse.id,
                                originalQuizId: quiz.id,
                            },
                        });
                        for (const answer of quiz.answers) {
                            await prisma.cohortQuizAnswer.create({
                                data: {
                                    answer: answer.name,
                                    isCorrect: answer.isCorrect,
                                    cohortQuizId: cohortQuiz.id,
                                    originalAnswerId: answer.id,
                                },
                            });
                        }
                    }
                }
            }
            return cohort;
        }, {
            maxWait: 15000, // 15 seconds
            timeout: 60000, // 60 seconds
        });
        res
            .status(201)
            .json({ status: "Cohort created", message: null, data: result });
    }
    catch (error) {
        console.error("Detailed error:", error);
        handleServerError(error, res);
    }
};
exports.createCohort = createCohort;
const updateCohort = async (req, res) => {
    try {
        const { cohortId } = req.params;
        const body = req.body;
        if (!cohortId) {
            return res.status(400).json({ message: "CohortId is required" });
        }
        const cohort = await index_1.prismadb.cohort.update({
            where: {
                id: cohortId,
            },
            data: {
                ...body,
            },
        });
        res
            .status(200)
            .json({ status: "Cohort updated", message: null, data: cohort });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateCohort = updateCohort;
const deleteCohort = async (req, res) => {
    try {
        const { cohortId } = req.params;
        if (!cohortId) {
            return res.status(400).json({ message: "CohortId is required" });
        }
        await index_1.prismadb.cohort.delete({
            where: {
                id: cohortId,
            },
        });
        res.status(200).json({ status: "Cohort deleted", message: null });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteCohort = deleteCohort;
const updateCohortCourseWeekPublishStatus = async (req, res) => {
    try {
        const { courseWeekId, isPublished, } = req.body;
        if (!courseWeekId) {
            return res.status(400).json({ message: "Course week ID is required" });
        }
        const updatedCohortCourseWeek = await index_1.prismadb.cohortCourseWeek.update({
            where: {
                id: courseWeekId,
            },
            data: {
                isPublished,
            },
        });
        res.status(200).json({
            status: "success",
            message: null,
            data: updatedCohortCourseWeek,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ UPDATE_COHORT_COURSE_WEEK_PUBLISH_STATUS: error });
    }
};
exports.updateCohortCourseWeekPublishStatus = updateCohortCourseWeekPublishStatus;
const updateCohortCourseTimeTable = async (req, res) => {
    try {
        const { cohortCourseTimeTableId, date, } = req.body;
        if (!cohortCourseTimeTableId) {
            return res
                .status(400)
                .json({ message: "Course Timetable ID is required" });
        }
        const updatedCohortCourseTimetable = await index_1.prismadb.cohortCourseTimeTable.update({
            where: {
                id: cohortCourseTimeTableId,
            },
            data: {
                date,
            },
        });
        res.status(200).json({
            status: "success",
            message: null,
            data: updatedCohortCourseTimetable,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ UPDATE_COHORT_COURSE_TIMETABLE_DATE: error });
    }
};
exports.updateCohortCourseTimeTable = updateCohortCourseTimeTable;
//#region File Upload
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uploadDir = path_1.default.resolve(__dirname, "../../../uploads/brochures");
// Ensuring upload directory exists
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
// Multer setup for PDF upload
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Saving file as cohortId + originalname for uniqueness
        cb(null, `${req.params.cohortId}_${Date.now()}${path_1.default.extname(file.originalname)}`);
    },
});
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== "application/pdf") {
            return cb(new Error("Only PDF files are allowed"));
        }
        cb(null, true);
    },
});
// Upload or update the brochure URL for a cohort course
const uploadOnboardingBrochure = async (req, res) => {
    try {
        const { cohortId } = req.params;
        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded" });
        }
        // Find the cohortCourse related to the cohortId
        const cohortCourse = await index_1.prismadb.cohortCourse.findFirst({
            where: { cohortId },
        });
        if (!cohortCourse) {
            return res.status(404).json({ message: "CohortCourse not found" });
        }
        // Save relative file path or URL to DB (assume files served from /uploads/brochures)
        const brochureUrl = `/uploads/brochures/${req.file.filename}`;
        // Update cohortCourse record
        const updated = await index_1.prismadb.cohortCourse.update({
            where: {
                id: cohortCourse.id,
            },
            data: {
                onboardingBrochureUrl: brochureUrl,
            },
        });
        res.status(200).json({
            message: "Brochure uploaded successfully",
            brochureUrl: updated.onboardingBrochureUrl,
        });
    }
    catch (error) {
        console.error("Brochure upload error:", error);
        res.status(500).json({ message: "Failed to upload brochure" });
    }
};
exports.uploadOnboardingBrochure = uploadOnboardingBrochure;
//# sourceMappingURL=index.js.map