"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCourseCohorts = exports.getCourseWithoutAuthWithSlug = exports.getCourseWithoutAuth = exports.deleteCourse = exports.updateCourse = exports.createCourse = exports.getCourse = exports.getCourses = void 0;
const prismadb_1 = require("../../lib/prismadb");
const handleServerError = (error, res) => {
    console.error("❌ [SERVER_ERROR]:", error);
    res.status(500).json({ status: "error", message: error.message || "Internal Server Error", details: error });
};
const getCourses = async (req, res) => {
    try {
        const courses = await prismadb_1.prismadb.course.findMany({
            include: {
                skills_you_will_learn: true,
                learning_Outcomes: true,
                prerequisites: true,
                tags: true,
                catalog_header_tags: true,
                course_weeks: {
                    orderBy: {
                        createdAt: "asc",
                    },
                    include: {
                        courseModules: {
                            orderBy: {
                                createdAt: "asc",
                            },
                            include: {
                                projectVideos: {
                                    select: {
                                        id: true,
                                        title: true,
                                        thumbnailUrl: true,
                                        duration: true,
                                        moduleId: true,
                                        courseId: true,
                                        createdAt: true,
                                        updatedAt: true,
                                    },
                                    orderBy: {
                                        createdAt: "asc",
                                    },
                                },
                                quizzes: {
                                    orderBy: {
                                        createdAt: "asc",
                                    },
                                    include: {
                                        answers: true,
                                    },
                                },
                            },
                        },
                    },
                },
                cohorts: true, // Modified from select: { id: true } to true
                timetable: true,
                pricingPlans: true,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        return res
            .status(200)
            .json({ status: "success", message: null, data: courses });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourses = getCourses;
const getCourse = async (req, res) => {
    try {
        const { courseId } = req.params;
        const user = req.user;
        const userId = user?.id;
        const isAdmin = user?.role === "ADMIN" || user?.role === "COURSE_ADMIN";
        if (!userId) {
            throw new Error("UserId not detected, cannot check if course has been purchased yet");
        }
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        let coursePurchased = null;
        let isCoursePurchased = false;
        if (userId) {
            const currentUser = await prismadb_1.prismadb.user.findUnique({
                where: {
                    id: userId,
                },
                select: {
                    id: true,
                    course_purchased: true,
                },
            });
            if (!currentUser) {
                return res.status(400).json({ message: "User does not exist" });
            }
            coursePurchased = currentUser.course_purchased.find((course) => course?.courseId === courseId && course.userId === userId);
            isCoursePurchased = coursePurchased || isAdmin ? true : false;
        }
        const course = await prismadb_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
            include: {
                skills_you_will_learn: true,
                learning_Outcomes: true,
                prerequisites: true,
                tags: true,
                catalog_header_tags: true,
                course_weeks: {
                    orderBy: {
                        createdAt: "asc",
                    },
                    include: {
                        attachments: isCoursePurchased ? true : false,
                        courseModules: {
                            orderBy: {
                                createdAt: "asc",
                            },
                            include: {
                                projectVideos: {
                                    select: {
                                        id: true,
                                        title: true,
                                        videoUrl: isCoursePurchased ? true : false,
                                        thumbnailUrl: true,
                                        duration: true,
                                        moduleId: true,
                                        courseId: true,
                                        createdAt: true,
                                        updatedAt: true,
                                    },
                                    orderBy: {
                                        createdAt: "asc",
                                    },
                                },
                                quizzes: {
                                    orderBy: {
                                        createdAt: "asc",
                                    },
                                    include: {
                                        answers: true,
                                    },
                                },
                            },
                        },
                    },
                },
                timetable: true,
                cohorts: true,
                pricingPlans: true,
            },
        });
        if (!course) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        return res.status(200).json({
            status: "success",
            message: `${user?.role === "USER" &&
                !coursePurchased &&
                "Course purchase not found, weekly attachments and video url is disabled"}`,
            data: course,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourse = getCourse;
const createCourse = async (req, res) => {
    try {
        const { title } = req.body;
        if (!title) {
            return res.status(400).json({ message: "Title is required" });
        }
        const course = await prismadb_1.prismadb.course.create({
            data: {
                title,
            },
            select: {
                id: true,
                title: true,
            },
        });
        return res
            .status(201)
            .json({ status: "Course created", message: null, data: course });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.createCourse = createCourse;
const updateCourse = async (req, res) => {
    try {
        const { pricingPlans, ...body } = req.body;
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
        const course = await prismadb_1.prismadb.$transaction(async (tx) => {
            // Update core course data
            const updatedCourse = await tx.course.update({
                where: { id: courseId },
                data: { ...body },
            });
            // Update pricing plans if provided
            if (pricingPlans && Array.isArray(pricingPlans)) {
                // Delete existing plans first to sync
                await tx.coursePricingPlan.deleteMany({
                    where: { courseId },
                });
                // Create new plans
                if (pricingPlans.length > 0) {
                    await tx.coursePricingPlan.createMany({
                        data: pricingPlans.map((plan) => ({
                            courseId,
                            planType: plan.planType,
                            amountPerInstallment: plan.amountPerInstallment,
                            installmentsCount: plan.installmentsCount,
                            discountPrice: plan.discountPrice || null,
                        })),
                    });
                }
            }
            return tx.course.findUnique({
                where: { id: courseId },
                include: { pricingPlans: true },
            });
        });
        return res
            .status(200)
            .json({ status: "Course updated", message: null, data: course });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateCourse = updateCourse;
const deleteCourse = async (req, res) => {
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
        // 1. Fetch related IDs for deep cleanup
        const cohortCourses = await prismadb_1.prismadb.cohortCourse.findMany({
            where: { courseId },
            select: { id: true }
        });
        const cohortCourseIds = cohortCourses.map(cc => cc.id);
        const courseWeeks = await prismadb_1.prismadb.courseWeek.findMany({
            where: { courseId },
            select: { id: true }
        });
        const courseWeekIds = courseWeeks.map(cw => cw.id);
        // 2. Delete deep children (Leaf Nodes) first
        // Cleanup for CohortCourse descendants
        if (cohortCourseIds.length > 0) {
            // Delete Comments linked to announcements/submissions/posts in these cohort courses
            await prismadb_1.prismadb.comment.deleteMany({
                where: {
                    OR: [
                        { announcement: { cohortCourseId: { in: cohortCourseIds } } },
                        { submission: { assignment: { cohortCourseId: { in: cohortCourseIds } } } },
                        { streamPost: { cohortCourseId: { in: cohortCourseIds } } }
                    ]
                }
            });
            // Delete Assignment Submissions
            await prismadb_1.prismadb.assignmentSubmission.deleteMany({
                where: { assignment: { cohortCourseId: { in: cohortCourseIds } } }
            });
            // Delete Assignment Quiz Submissions if the model exists in the Prisma client
            if (prismadb_1.prismadb.assignmentQuizSubmission) {
                await prismadb_1.prismadb.assignmentQuizSubmission.deleteMany({
                    where: { assignment: { cohortCourseId: { in: cohortCourseIds } } }
                });
            }
            // Delete Assignments
            await prismadb_1.prismadb.assignment.deleteMany({
                where: { cohortCourseId: { in: cohortCourseIds } }
            });
            // Delete Classroom Topics, Stream Posts, Announcements, Materials, Recordings
            await prismadb_1.prismadb.classroomTopic.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
            await prismadb_1.prismadb.streamPost.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
            await prismadb_1.prismadb.announcement.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
            await prismadb_1.prismadb.classMaterial.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
            await prismadb_1.prismadb.classRecording.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
            await prismadb_1.prismadb.cohortAttachment.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
            await prismadb_1.prismadb.cohortQuiz.deleteMany({ where: { cohortCourseId: { in: cohortCourseIds } } });
        }
        // Cleanup for CourseWeek descendants
        if (courseWeekIds.length > 0) {
            await prismadb_1.prismadb.module.deleteMany({
                where: { courseWeekId: { in: courseWeekIds } }
            });
        }
        // Cleanup for PaymentStatus descendants
        await prismadb_1.prismadb.paymentInstallment.deleteMany({
            where: { paymentStatus: { courseId: courseId } }
        });
        // 3. Delete intermediate models
        await prismadb_1.prismadb.purchase.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.cohortCourse.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.cohort.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.timeTable.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.courseWeek.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.coursePricingPlan.deleteMany({ where: { courseId } });
        // Cleanup ChangeRequests
        await prismadb_1.prismadb.changeRequest.deleteMany({
            where: {
                OR: [
                    { currentCourseId: courseId },
                    { desiredCourseId: courseId }
                ]
            }
        });
        // 4. Delete Course-related simple models
        await prismadb_1.prismadb.skillsYouWillLearn.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.learningOutcome.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.prerequisite.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.tag.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.catalogHeaderTags.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.projectVideo.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.userProgress.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.paymentStatus.deleteMany({ where: { courseId } });
        await prismadb_1.prismadb.paystackTransaction.deleteMany({ where: { courseId } });
        // 5. Final delete of the Course
        await prismadb_1.prismadb.course.delete({
            where: {
                id: courseId,
            },
        });
        return res.status(200).json({ status: "Course deleted" });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteCourse = deleteCourse;
const getCourseWithoutAuth = async (req, res) => {
    try {
        const { courseId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        const course = await prismadb_1.prismadb.course.findUnique({
            where: {
                id: courseId,
            },
            include: {
                skills_you_will_learn: true,
                learning_Outcomes: true,
                prerequisites: true,
                tags: true,
                catalog_header_tags: true,
                course_weeks: {
                    orderBy: {
                        createdAt: "asc",
                    },
                    include: {
                        courseModules: {
                            orderBy: {
                                createdAt: "asc",
                            },
                            include: {
                                projectVideos: {
                                    select: {
                                        id: true,
                                        title: true,
                                        thumbnailUrl: true,
                                        duration: true,
                                        moduleId: true,
                                        courseId: true,
                                        createdAt: true,
                                        updatedAt: true,
                                    },
                                    orderBy: {
                                        createdAt: "asc",
                                    },
                                },
                                quizzes: {
                                    orderBy: {
                                        createdAt: "asc",
                                    },
                                    include: {
                                        answers: true,
                                    },
                                },
                            },
                        },
                    },
                },
                timetable: true,
                cohorts: true,
                pricingPlans: true,
            },
        });
        if (!course) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        return res.status(200).json({
            status: "success",
            message: null,
            data: course,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourseWithoutAuth = getCourseWithoutAuth;
const getCourseWithoutAuthWithSlug = async (req, res) => {
    try {
        const { slug } = req.params;
        if (!slug) {
            return res.status(400).json({ message: "Slug is required" });
        }
        const course = await prismadb_1.prismadb.course.findFirst({
            where: {
                slug,
            },
            include: {
                skills_you_will_learn: true,
                learning_Outcomes: true,
                prerequisites: true,
                tags: true,
                catalog_header_tags: true,
                course_weeks: {
                    orderBy: {
                        createdAt: "asc",
                    },
                    include: {
                        courseModules: {
                            orderBy: {
                                createdAt: "asc",
                            },
                            include: {
                                projectVideos: {
                                    select: {
                                        id: true,
                                        title: true,
                                        thumbnailUrl: true,
                                        duration: true,
                                        moduleId: true,
                                        courseId: true,
                                        createdAt: true,
                                        updatedAt: true,
                                    },
                                    orderBy: {
                                        createdAt: "asc",
                                    },
                                },
                                quizzes: {
                                    orderBy: {
                                        createdAt: "asc",
                                    },
                                    include: {
                                        answers: true,
                                    },
                                },
                            },
                        },
                    },
                },
                timetable: true,
                cohorts: true,
                pricingPlans: true,
            },
        });
        if (!course) {
            return res.status(404).json({ message: "Course does not exist" });
        }
        return res.status(200).json({
            status: "success",
            message: null,
            data: course,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourseWithoutAuthWithSlug = getCourseWithoutAuthWithSlug;
const getCourseCohorts = async (req, res) => {
    try {
        const { courseId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        // Verifying course exists
        const course = await prismadb_1.prismadb.course.findUnique({
            where: { id: courseId },
        });
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }
        // Get cohorts for this course
        const cohorts = await prismadb_1.prismadb.cohort.findMany({
            where: { courseId },
            orderBy: {
                startDate: "desc",
            },
            include: {
                users: {
                    select: {
                        id: true,
                    },
                },
            },
        });
        return res.status(200).json({
            status: "success",
            message: null,
            data: cohorts,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getCourseCohorts = getCourseCohorts;
//# sourceMappingURL=index.js.map