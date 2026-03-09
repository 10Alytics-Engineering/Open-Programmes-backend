"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserCourseProgress = exports.updateUserCohort = exports.removeUserCourse = exports.addUserCourse = exports.updateUserRole = exports.deleteUser = exports.updateUserImage = exports.updateUser = exports.getUserWithoutAuth = exports.getUserByEmail = exports.getUser = exports.searchUsers = exports.getUsers = void 0;
const index_1 = require("../../../src/index");
const mail_1 = require("./mail");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const getUsers = async (req, res) => {
    try {
        const { page = 1, limit = 20, search = "", role = "", course = "", cohort = "", sortBy = "createdAt", sortOrder = "asc", } = req.query;
        const pageNumber = parseInt(page);
        const limitNumber = parseInt(limit);
        const skip = (pageNumber - 1) * limitNumber;
        // Build where clause for filtering
        const whereClause = {};
        // Search functionality
        if (search) {
            whereClause.OR = [
                { name: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
            ];
        }
        // Role filter
        if (role) {
            whereClause.role = role;
        }
        // Course filter
        if (course) {
            whereClause.course_purchased = {
                some: {
                    courseId: course,
                },
            };
        }
        // Cohort filter
        if (cohort) {
            whereClause.cohorts = {
                some: {
                    cohortId: cohort,
                },
            };
        }
        // Build orderBy clause
        const orderBy = {};
        orderBy[sortBy] = sortOrder;
        // Get total count for pagination
        const totalUsers = await index_1.prismadb.user.count({
            where: whereClause,
        });
        // Get paginated users
        const users = await index_1.prismadb.user.findMany({
            where: whereClause,
            include: {
                course_purchased: {
                    include: {
                        course: {
                            include: {
                                course_weeks: {
                                    include: {
                                        courseModules: {
                                            include: {
                                                projectVideos: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                cohorts: {
                    include: {
                        cohort: true,
                    },
                },
                completed_videos: true,
            },
            orderBy,
            skip,
            take: limitNumber,
        });
        // Enhance users with progress data
        const usersWithProgress = users.map((user) => {
            // Calculate total videos across all courses
            const totalVideos = user.course_purchased.reduce((acc, purchase) => {
                return (acc +
                    (purchase.course?.course_weeks?.reduce((weekAcc, week) => {
                        return (weekAcc +
                            week.courseModules.reduce((moduleAcc, module) => moduleAcc + module.projectVideos.length, 0));
                    }, 0) || 0));
            }, 0);
            // Count completed videos
            const videosCompleted = user.completed_videos?.length || 0;
            // Calculate expected progress based on account age
            const accountAgeDays = Math.floor((new Date().getTime() - new Date(user.createdAt).getTime()) /
                (1000 * 60 * 60 * 24));
            const expectedProgress = Math.min(Math.floor(accountAgeDays / 7) * 10, 100);
            return {
                ...user,
                totalVideos,
                videosCompleted,
                expectedVideoProgress: expectedProgress,
            };
        });
        const totalPages = Math.ceil(totalUsers / limitNumber);
        return res.status(200).json({
            status: "success",
            message: null,
            data: {
                users: usersWithProgress,
                pagination: {
                    currentPage: pageNumber,
                    totalPages,
                    totalUsers,
                    limit: limitNumber,
                    hasNextPage: pageNumber < totalPages,
                    hasPreviousPage: pageNumber > 1,
                },
            },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getUsers = getUsers;
//search endpoint for faster searches
const searchUsers = async (req, res) => {
    try {
        const { query = "", limit = 10 } = req.query;
        if (!query || query.length < 2) {
            return res.status(200).json({
                status: "success",
                data: [],
            });
        }
        const users = await index_1.prismadb.user.findMany({
            where: {
                OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { email: { contains: query, mode: "insensitive" } },
                ],
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
            },
            take: parseInt(limit),
            orderBy: {
                name: "asc",
            },
        });
        return res.status(200).json({
            status: "success",
            data: users,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.searchUsers = searchUsers;
const getUser = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ message: "UserId is required" });
        }
        const user = await index_1.prismadb.user.findUnique({
            where: { id: userId },
            include: {
                completed_videos: true,
                course_purchased: {
                    select: {
                        id: true,
                        userId: true,
                        courseId: true,
                        course: true,
                    },
                },
                cohorts: {
                    select: {
                        cohortId: true,
                        userId: true,
                        isPaymentActive: true,
                        cohort: {
                            select: {
                                id: true,
                                name: true,
                                startDate: true,
                                endDate: true,
                                courseId: true,
                                createdAt: true,
                                updatedAt: true,
                            },
                        },
                    },
                },
                quiz_answers: {
                    include: {
                        quizAnswer: true,
                    },
                },
                paymentStatus: true,
                quiz_leaderboard: {
                    select: {
                        points: true,
                        quizId: true,
                        userId: true,
                    },
                },
            },
        });
        if (!user) {
            return res.status(404).json({ message: "Nonexistent User!" });
        }
        return res
            .status(200)
            .json({ status: "success", message: null, data: user });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getUser = getUser;
const getUserByEmail = async (req, res) => {
    try {
        const { email } = req.params;
        const user = await index_1.prismadb.user.findFirst({
            where: { email },
        });
        if (!user) {
            return res.status(404).json({ message: "Nonexistent User!" });
        }
        return res
            .status(200)
            .json({ status: "success", message: null, data: user });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getUserByEmail = getUserByEmail;
const getUserWithoutAuth = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await index_1.prismadb.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            return res.status(404).json({ message: "Nonexistent User!" });
        }
        return res
            .status(200)
            .json({ status: "success", message: null, data: user });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getUserWithoutAuth = getUserWithoutAuth;
const updateUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, email, password, image } = req.body;
        if (!userId) {
            return res.status(400).json({ message: "UserId is required" });
        }
        // Check if the user exists
        const existingUser = await index_1.prismadb.user.findUnique({
            where: { id: userId },
        });
        if (!existingUser) {
            return res.status(404).json({ message: "User not found" });
        }
        // Check if email is already in use by another user
        if (email && email !== existingUser.email) {
            const emailExists = await index_1.prismadb.user.findUnique({
                where: { email },
            });
            if (emailExists && emailExists.id !== userId) {
                return res.status(403).json({ message: "Email already in use" });
            }
        }
        // Update user data
        const updateData = {};
        if (name)
            updateData.name = name;
        if (email)
            updateData.email = email;
        if (password) {
            const salt = await bcryptjs_1.default.genSalt(10);
            const hashedPassword = await bcryptjs_1.default.hash(password, salt);
            updateData.password = hashedPassword;
        }
        if (image !== undefined) {
            updateData.image = image;
        }
        // Update the user
        const updatedUser = await index_1.prismadb.user.update({
            where: { id: userId },
            data: updateData,
            include: {
                completed_videos: true,
                course_purchased: {
                    select: {
                        id: true,
                        userId: true,
                        courseId: true,
                        course: true,
                    },
                },
                cohorts: {
                    select: {
                        cohortId: true,
                        userId: true,
                        isPaymentActive: true,
                        cohort: {
                            select: {
                                id: true,
                                name: true,
                                startDate: true,
                                endDate: true,
                                courseId: true,
                                createdAt: true,
                                updatedAt: true,
                            },
                        },
                    },
                },
                quiz_answers: {
                    include: {
                        quizAnswer: true,
                    },
                },
                paymentStatus: true,
                quiz_leaderboard: {
                    select: {
                        points: true,
                        quizId: true,
                        userId: true,
                    },
                },
            },
        });
        return res.status(200).json({
            status: "success",
            message: "User updated successfully",
            data: updatedUser,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateUser = updateUser;
const updateUserImage = async (req, res) => {
    try {
        const { userId } = req.params;
        const { image } = req.body;
        if (!userId) {
            return res.status(400).json({ message: "UserId is required" });
        }
        // Check if the user exists
        const existingUser = await index_1.prismadb.user.findUnique({
            where: { id: userId },
        });
        if (!existingUser) {
            return res.status(404).json({ message: "User not found" });
        }
        // Update just the image field
        const updatedUser = await index_1.prismadb.user.update({
            where: { id: userId },
            data: { image },
            include: {
                completed_videos: true,
                course_purchased: {
                    select: {
                        id: true,
                        userId: true,
                        courseId: true,
                        course: true,
                    },
                },
                cohorts: {
                    select: {
                        cohortId: true,
                        userId: true,
                        isPaymentActive: true,
                        cohort: {
                            select: {
                                id: true,
                                name: true,
                                startDate: true,
                                endDate: true,
                                courseId: true,
                                createdAt: true,
                                updatedAt: true,
                            },
                        },
                    },
                },
                quiz_answers: {
                    include: {
                        quizAnswer: true,
                    },
                },
                paymentStatus: true,
                quiz_leaderboard: {
                    select: {
                        points: true,
                        quizId: true,
                        userId: true,
                    },
                },
            },
        });
        return res.status(200).json({
            status: "success",
            message: "Profile image updated successfully",
            data: updatedUser,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateUserImage = updateUserImage;
const deleteUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const existingUser = await index_1.prismadb.user.findUnique({
            where: { id: userId },
        });
        if (!existingUser) {
            return res.status(404).json({ message: "Nonexistent User!" });
        }
        await index_1.prismadb.$transaction(async (prisma) => {
            await prisma.purchase.deleteMany({
                where: {
                    userId,
                },
            });
            console.log("Purchased courses attached to this user has been deleted");
            const user = await prisma.user.delete({
                where: { id: userId },
            });
            console.log("User has been deleted");
            return user;
        }, {
            maxWait: 15000, // 15 seconds
            timeout: 60000, // 60 seconds
        });
        // Example of how to call the function
        await (0, mail_1.sendAccountDeletionEmail)({
            email: existingUser.email,
            name: existingUser.name,
        });
        return res.status(200).json({
            status: "success",
            message: `User with id: ${userId} deleted`,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteUser = deleteUser;
const updateUserRole = async (req, res) => {
    try {
        const userId = req.params?.userId;
        const { role } = req.body;
        if (!role) {
            return res.status(400).json({ message: "Invalid field" });
        }
        const existingUser = await index_1.prismadb.user.findUnique({
            where: { id: userId },
        });
        if (!existingUser) {
            return res.status(404).json({ message: "Nonexistent User!" });
        }
        await index_1.prismadb.user.update({
            data: {
                role: role,
            },
            where: {
                id: existingUser.id,
            },
        });
        return res
            .status(200)
            .json({ status: "success", message: "User role updated!" });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateUserRole = updateUserRole;
const addUserCourse = async (req, res) => {
    try {
        const { userId } = req.params;
        const { courseId } = req.body;
        if (!userId || !courseId) {
            return res
                .status(400)
                .json({ message: "UserId and CourseId are required" });
        }
        const user = await index_1.prismadb.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const course = await index_1.prismadb.course.findUnique({
            where: { id: courseId },
        });
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }
        // Checking if user already has this course
        const existingPurchase = await index_1.prismadb.purchase.findFirst({
            where: {
                userId,
                courseId,
            },
        });
        if (existingPurchase) {
            return res.status(400).json({ message: "User already has this course" });
        }
        // Finding the latest cohort for this course
        const latestCohort = await index_1.prismadb.cohort.findFirst({
            where: {
                courseId,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        // Add the course to user
        const purchase = await index_1.prismadb.purchase.create({
            data: {
                userId,
                courseId,
            },
        });
        // Update user's ongoing courses if not included
        await index_1.prismadb.user.update({
            where: { id: userId },
            data: {
                ongoing_courses: {
                    push: courseId,
                },
            },
        });
        // if the cohort exists, the user is added to that cohort
        if (latestCohort) {
            await index_1.prismadb.userCohort.create({
                data: {
                    userId,
                    cohortId: latestCohort.id,
                    courseId,
                    isPaymentActive: true,
                },
            });
        }
        return res.status(200).json({
            status: "success",
            message: latestCohort
                ? "Course added and user enrolled in latest cohort"
                : "Course added (no cohorts available for this course)",
            data: {
                purchase,
                cohort: latestCohort || null,
            },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.addUserCourse = addUserCourse;
const removeUserCourse = async (req, res) => {
    try {
        const { userId } = req.params;
        const { courseId } = req.body;
        if (!userId || !courseId) {
            return res
                .status(400)
                .json({ message: "UserId and CourseId are required" });
        }
        const user = await index_1.prismadb.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const course = await index_1.prismadb.course.findUnique({
            where: { id: courseId },
        });
        if (!course) {
            return res.status(404).json({ message: "Course not found" });
        }
        const existingPurchase = await index_1.prismadb.purchase.findFirst({
            where: {
                userId,
                courseId,
            },
        });
        if (!existingPurchase) {
            return res.status(400).json({ message: "User doesn't have this course" });
        }
        // Remove user from any cohorts associated with this course
        await index_1.prismadb.userCohort.deleteMany({
            where: {
                userId,
                courseId,
            },
        });
        // Remove the course purchase
        await index_1.prismadb.purchase.deleteMany({
            where: {
                userId,
                courseId,
            },
        });
        // Update user's ongoing and completed courses arrays
        await index_1.prismadb.user.update({
            where: { id: userId },
            data: {
                ongoing_courses: {
                    set: user.ongoing_courses.filter((id) => id !== courseId),
                },
                completed_courses: {
                    set: user.completed_courses.filter((id) => id !== courseId),
                },
            },
        });
        return res.status(200).json({
            status: "success",
            message: "Course removed from user successfully",
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.removeUserCourse = removeUserCourse;
const updateUserCohort = async (req, res) => {
    try {
        const { userId } = req.params;
        const { currentCohortId, newCohortId } = req.body;
        if (!userId || !currentCohortId || !newCohortId) {
            return res.status(400).json({
                message: "UserId, currentCohortId and newCohortId are required",
            });
        }
        // Check if user exists
        const user = await index_1.prismadb.user.findUnique({
            where: { id: userId },
            include: {
                cohorts: {
                    where: { cohortId: currentCohortId },
                    include: { cohort: true },
                },
            },
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Check if current cohort exists and user is enrolled
        const currentCohortEnrollment = user.cohorts.find((c) => c.cohortId === currentCohortId);
        if (!currentCohortEnrollment) {
            return res.status(404).json({
                message: "User is not enrolled in the specified current cohort",
            });
        }
        // Check if new cohort exists
        const newCohort = await index_1.prismadb.cohort.findUnique({
            where: { id: newCohortId },
            include: { course: true },
        });
        if (!newCohort) {
            return res.status(404).json({ message: "New cohort not found" });
        }
        // Verify new cohort is for the same course
        if (newCohort.courseId !== currentCohortEnrollment.cohort.courseId) {
            return res.status(400).json({
                message: "New cohort must be for the same course",
            });
        }
        // Archive current enrollment (don't delete to preserve data)
        await index_1.prismadb.userCohort.update({
            where: { id: currentCohortEnrollment.id },
            data: {
                //  isActive: false,
                // archivedAt: new Date()
                isPaymentActive: false,
            },
        });
        // Create new enrollment
        const newEnrollment = await index_1.prismadb.userCohort.create({
            data: {
                userId,
                cohortId: newCohortId,
                courseId: newCohort.courseId,
                isPaymentActive: currentCohortEnrollment.isPaymentActive,
                // previousEnrollmentId: currentCohortEnrollment.id // Tracking previous enrollment
            },
        });
        return res.status(200).json({
            status: "success",
            message: "User cohort updated successfully",
            data: {
                previousCohort: currentCohortEnrollment,
                newCohort: newEnrollment,
            },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.updateUserCohort = updateUserCohort;
// Add this to your user controller file
const getUserCourseProgress = async (req, res) => {
    try {
        const { userId, courseId } = req.params;
        if (!userId || !courseId) {
            return res
                .status(400)
                .json({ message: "UserId and CourseId are required" });
        }
        // Get user with their completed videos for this course
        const user = await index_1.prismadb.user.findUnique({
            where: { id: userId },
            include: {
                completed_videos: {
                    where: { courseId },
                    select: { videoId: true, isCompleted: true },
                },
                cohorts: {
                    where: { courseId },
                    include: {
                        cohort: {
                            select: {
                                startDate: true,
                                cohortCourses: {
                                    where: { courseId },
                                    include: {
                                        cohortWeeks: {
                                            include: {
                                                cohortModules: {
                                                    include: {
                                                        cohortProjectVideos: true,
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                course_purchased: {
                    where: { courseId },
                    include: {
                        course: {
                            include: {
                                course_weeks: {
                                    include: {
                                        courseModules: {
                                            include: {
                                                projectVideos: true,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Get the course purchase
        const coursePurchase = user.course_purchased.find((p) => p.courseId === courseId);
        if (!coursePurchase) {
            return res
                .status(404)
                .json({ message: "User hasn't purchased this course" });
        }
        // Calculate progress data
        const course = coursePurchase.course;
        const cohort = user.cohorts[0]?.cohort;
        const cohortCourse = cohort?.cohortCourses[0];
        // Calculate total videos in course
        const totalVideos = course?.course_weeks?.reduce((weekAcc, week) => {
            return (weekAcc +
                week.courseModules.reduce((moduleAcc, module) => moduleAcc + module.projectVideos.length, 0));
        }, 0) || 0;
        // Calculate completed videos
        const completedVideos = user.completed_videos.filter((v) => v.isCompleted).length;
        // Calculate progress percentage
        const progressPercentage = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;
        // Calculate expected progress based on cohort start date
        let expectedWeek = 1;
        let expectedProgress = 0;
        let weeksBehind = 0;
        if (cohort && cohortCourse) {
            const cohortStartDate = new Date(cohort.startDate);
            const now = new Date();
            const daysSinceStart = Math.floor((now.getTime() - cohortStartDate.getTime()) / (1000 * 60 * 60 * 24));
            expectedWeek = Math.min(Math.floor(daysSinceStart / 7) + 1, // +1 because first week is week 1
            cohortCourse.cohortWeeks.length);
            // Calculate expected progress based on weeks
            if (cohortCourse.cohortWeeks.length > 0) {
                const videosPerWeek = totalVideos / cohortCourse.cohortWeeks.length;
                expectedProgress = Math.min(Math.round(((expectedWeek * videosPerWeek) / totalVideos) * 100), 100);
            }
            // Calculate how many weeks behind
            if (cohortCourse.cohortWeeks.length > 0) {
                // Find the last week where the user has completed all videos
                let actualWeek = 0;
                for (const week of cohortCourse.cohortWeeks) {
                    const weekVideos = week.cohortModules.flatMap((m) => m.cohortProjectVideos);
                    const completedWeekVideos = weekVideos.filter((v) => user.completed_videos.some((cv) => cv.videoId === v.id && cv.isCompleted)).length;
                    if (completedWeekVideos >= weekVideos.length * 0.8) {
                        // 80% completion to count as "done"
                        actualWeek++;
                    }
                    else {
                        break;
                    }
                }
                weeksBehind = Math.max(0, expectedWeek - actualWeek - 1);
            }
        }
        // Get module-level progress
        const modulesProgress = course?.course_weeks?.flatMap((week) => week.courseModules.map((module) => ({
            id: module.id,
            title: module.title,
            totalVideos: module.projectVideos.length,
            completedVideos: module.projectVideos.filter((video) => user.completed_videos.some((cv) => cv.videoId === video.id && cv.isCompleted)).length,
            iconUrl: module.iconUrl,
            status: module.projectVideos.length > 0
                ? user.completed_videos.filter((cv) => module.projectVideos.some((v) => v.id === cv.videoId && cv.isCompleted)).length /
                    module.projectVideos.length >=
                    0.8
                    ? "Completed"
                    : "Ongoing"
                : "N/A",
        }))) || [];
        return res.status(200).json({
            status: "success",
            data: {
                userId,
                courseId,
                courseTitle: course?.title,
                totalVideos,
                completedVideos,
                progressPercentage,
                expectedProgress,
                weeksBehind,
                expectedWeek,
                currentWeek: cohortCourse?.cohortWeeks?.length
                    ? Math.min(expectedWeek, cohortCourse.cohortWeeks.length)
                    : 1,
                totalWeeks: cohortCourse?.cohortWeeks?.length || 0,
                modulesProgress,
                cohortStartDate: cohort?.startDate,
                isOnTrack: weeksBehind <= 1,
            },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getUserCourseProgress = getUserCourseProgress;
//# sourceMappingURL=index.js.map