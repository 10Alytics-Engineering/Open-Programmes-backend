"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAssignmentQuizResults = exports.getAssignmentQuizSubmissions = exports.updateAssignment = exports.createQuizAssignment = exports.bulkGradeSubmissions = exports.gradeQuizSubmission = exports.gradeSubmission = exports.getAssignmentSubmissions = exports.submitAssignment = exports.getAssignmentSubmission = exports.getAssignment = void 0;
const prismadb_1 = require("../../lib/prismadb");
const slugify_1 = require("../../utils/slugify");
const mail_1 = require("../authentication/mail");
const notification_service_1 = require("../../services/notification.service");
// Updated getAssignment to include assignment quiz questions
const getAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const assignment = await prismadb_1.prismadb.assignment.findFirst({
            where: {
                OR: [{ id: assignmentId }, { slug: assignmentId }],
            },
            include: {
                attachments: true,
                assignmentQuizQuestions: {
                    include: {
                        assignmentQuizOptions: {
                            orderBy: { order: "asc" },
                        },
                    },
                    orderBy: { order: "asc" },
                },
                cohortCourse: {
                    include: {
                        cohort: true,
                        course: true,
                    },
                },
                classroomTopic: true,
                submissions: {
                    where: {
                        studentId: req.query.studentId,
                    },
                    include: {
                        student: true,
                    },
                },
                _count: {
                    select: {
                        assignmentQuizQuestions: true,
                    },
                },
            },
        });
        if (!assignment) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        // For quiz assignments, don't send correct answers to students
        if (assignment.type === "QUIZ" && req.query.studentId) {
            assignment.assignmentQuizQuestions =
                assignment.assignmentQuizQuestions.map((question) => ({
                    ...question,
                    assignmentQuizOptions: question.assignmentQuizOptions.map((option) => ({
                        ...option,
                        isCorrect: false,
                    })),
                }));
        }
        res.json({ assignment });
    }
    catch (error) {
        console.error("Get assignment error:", error);
        res.status(500).json({ error: "Failed to fetch assignment" });
    }
};
exports.getAssignment = getAssignment;
const getAssignmentSubmission = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { studentId } = req.query;
        if (!studentId) {
            return res.status(400).json({ error: "Student ID is required" });
        }
        const targetAssignment = await prismadb_1.prismadb.assignment.findFirst({
            where: {
                OR: [{ id: assignmentId }, { slug: assignmentId }],
            },
        });
        if (!targetAssignment) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        const submission = await prismadb_1.prismadb.assignmentSubmission.findUnique({
            where: {
                assignmentId_studentId: {
                    assignmentId: targetAssignment.id,
                    studentId: studentId,
                },
            },
            include: {
                student: true,
                gradedBy: true,
            },
        });
        res.json({ submission });
    }
    catch (error) {
        console.error("Get submission error:", error);
        res.status(500).json({ error: "Failed to fetch submission" });
    }
};
exports.getAssignmentSubmission = getAssignmentSubmission;
// helper function to handle quiz submissions
const handleAssignmentQuizSubmission = async (assignment, quizAnswers, studentId, res) => {
    if (assignment.isLocked) {
        return res.status(403).json({ error: "Quiz submissions are locked." });
    }
    // Check if already submitted
    const existingSubmission = await prismadb_1.prismadb.assignmentQuizSubmission.findUnique({
        where: {
            assignmentId_studentId: {
                assignmentId: assignment.id,
                studentId,
            },
        },
    });
    if (existingSubmission) {
        return res.status(400).json({ error: "Quiz already submitted" });
    }
    // Calculate score
    let totalScore = 0;
    const maxScore = assignment.assignmentQuizQuestions.reduce((sum, q) => sum + (q.points || 1), 0);
    const answerResults = await Promise.all(quizAnswers.map(async (answer) => {
        const question = assignment.assignmentQuizQuestions.find((q) => q.id === answer.questionId);
        const selectedOption = question.assignmentQuizOptions.find((opt) => opt.id === answer.selectedOptionId);
        const isCorrect = selectedOption?.isCorrect || false;
        const pointsEarned = isCorrect ? question.points || 1 : 0;
        totalScore += pointsEarned;
        return {
            assignmentQuizQuestionId: answer.questionId,
            selectedAssignmentQuizOptionId: answer.selectedOptionId,
            isCorrect,
            pointsEarned,
        };
    }));
    // Create quiz submission with answers
    const result = await prismadb_1.prismadb.$transaction(async (tx) => {
        const submission = await tx.assignmentQuizSubmission.create({
            data: {
                assignmentId: assignment.id,
                studentId,
                totalScore,
                maxScore,
                assignmentQuizAnswers: {
                    create: answerResults.map((result) => ({
                        assignmentQuizQuestionId: result.assignmentQuizQuestionId,
                        selectedAssignmentQuizOptionId: result.selectedAssignmentQuizOptionId,
                        isCorrect: result.isCorrect,
                        pointsEarned: result.pointsEarned,
                    })),
                },
            },
            include: {
                assignmentQuizAnswers: {
                    include: {
                        assignmentQuizQuestion: {
                            include: {
                                assignmentQuizOptions: true,
                            },
                        },
                        selectedAssignmentQuizOption: true,
                    },
                },
            },
        });
        await tx.courseCohortLeaderboard.upsert({
            where: {
                userId_courseId_cohortId: {
                    cohortId: assignment.cohortCourse?.cohort?.id,
                    courseId: assignment.cohortCourse?.course?.id,
                    userId: studentId,
                },
            },
            create: {
                assignmentPoints: totalScore,
                points: totalScore,
                lessonQuizPoints: 0,
                lessonVideoPoints: 0,
                cohortId: assignment.cohortCourse?.cohort?.id,
                courseId: assignment.cohortCourse?.course?.id,
                userId: studentId,
            },
            update: {
                assignmentPoints: { increment: totalScore || 0 },
                points: { increment: totalScore || 0 },
            },
        });
        const assignmentSubmission = await tx.assignmentSubmission.create({
            data: {
                assignmentId: assignment.id,
                studentId,
                content: `Quiz submitted - Score: ${totalScore}/${maxScore}`,
                submittedAt: new Date(),
            },
        });
        return {
            submission,
            assignmentSubmission,
        };
    });
    if (!result.submission.id) {
        return res.status(500).json({ error: "Failed to submit quiz" });
    }
    // Create Notification about new quiz submission
    await Promise.all([
        await notification_service_1.NotificationService.create({
            userId: studentId,
            type: "CLASSROOM_ASSIGNMENT_SUBMITTED",
            payload: {
                assignmentId: assignment.id,
                assignmentTitle: assignment.title,
                cohortId: assignment.cohortCourse.cohort.id,
                cohortName: assignment.cohortCourse.cohort.name,
                courseTitle: assignment.cohortCourse.course.title,
                topicId: assignment.classroomTopic?.id,
                topicTitle: assignment.classroomTopic?.title,
                courseId: assignment.cohortCourse.course.id,
            },
            relatedUserId: studentId,
        }),
        await notification_service_1.NotificationService.create({
            userId: studentId,
            type: "CLASSROOM_ASSIGNMENT_GRADED",
            payload: {
                assignmentId: assignment.id,
                assignmentTitle: assignment.title,
                cohortId: assignment.cohortCourse.cohort.id,
                cohortName: assignment.cohortCourse.cohort.name,
                courseTitle: assignment.cohortCourse.course.title,
                courseId: assignment.cohortCourse.course.id,
                topicId: assignment.classroomTopic?.id,
                topicTitle: assignment.classroomTopic?.title,
                assignmentMaxScore: maxScore,
                assignmentScore: totalScore,
            },
            relatedUserId: studentId,
        }),
    ]);
    res.json({
        submission: result.submission,
        score: totalScore,
        maxScore,
        percentage: Math.round((totalScore / maxScore) * 100),
        message: "Quiz submitted successfully",
    });
};
// Updated submitAssignment to handle quiz submissions
const submitAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { content, fileUrl, quizAnswers } = req.body;
        const user = req.user;
        const studentId = user.id;
        // Check if assignment exists
        const assignment = await prismadb_1.prismadb.assignment.findFirst({
            where: {
                OR: [{ id: assignmentId }, { slug: assignmentId }],
            },
            include: {
                assignmentQuizQuestions: {
                    include: {
                        assignmentQuizOptions: true,
                    },
                },
                cohortCourse: {
                    include: {
                        cohort: { select: { id: true, name: true } },
                        course: { select: { id: true, title: true } },
                    },
                },
                classroomTopic: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });
        if (!assignment) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        // Handle quiz submission
        if (assignment.type === "QUIZ" && quizAnswers) {
            return await handleAssignmentQuizSubmission(assignment, quizAnswers, studentId, res);
        }
        if (assignment.isLocked) {
            return res
                .status(403)
                .json({ error: "Submissions for this assignment are locked." });
        }
        // Handle regular assignment submission
        const existingSubmission = await prismadb_1.prismadb.assignmentSubmission.findUnique({
            where: {
                assignmentId_studentId: {
                    assignmentId: assignment.id,
                    studentId: studentId,
                },
            },
        });
        if (existingSubmission) {
            return res.status(400).json({ error: "Assignment already submitted" });
        }
        // Create submission with Cloudinary URL
        const submission = await prismadb_1.prismadb.assignmentSubmission.create({
            data: {
                assignmentId: assignment.id,
                studentId,
                content: content || null,
                fileUrl: fileUrl || null,
                submittedAt: new Date(),
            },
            include: {
                student: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
            },
        });
        if (!submission.id) {
            return res.status(500).json({ error: "Failed to submit assignment" });
        }
        // Create Notification about new submission
        await notification_service_1.NotificationService.create({
            userId: user.id,
            type: "CLASSROOM_ASSIGNMENT_SUBMITTED",
            payload: {
                assignmentId: assignment.id,
                assignmentTitle: assignment.title,
                cohortId: assignment.cohortCourse.cohort.id,
                cohortName: assignment.cohortCourse.cohort.name,
                courseTitle: assignment.cohortCourse.course.title,
                topicId: assignment.classroomTopic?.id,
                topicTitle: assignment.classroomTopic?.title,
                courseId: assignment.cohortCourse.course.id,
            },
            relatedUserId: user.id,
        });
        res.json({
            submission,
            message: "Assignment submitted successfully",
        });
    }
    catch (error) {
        console.error("Submit assignment error:", error);
        res.status(500).json({ error: "Failed to submit assignment" });
    }
};
exports.submitAssignment = submitAssignment;
// Get all submissions for an assignment
const getAssignmentSubmissions = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const targetAssignment = await prismadb_1.prismadb.assignment.findFirst({
            where: {
                OR: [{ id: assignmentId }, { slug: assignmentId }],
            },
        });
        if (!targetAssignment) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        const submissions = await prismadb_1.prismadb.assignmentSubmission.findMany({
            where: { assignmentId: targetAssignment.id },
            include: {
                student: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
                gradedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: { submittedAt: "desc" },
        });
        res.json({ submissions });
    }
    catch (error) {
        console.error("Get submissions error:", error);
        res.status(500).json({ error: "Failed to fetch submissions" });
    }
};
exports.getAssignmentSubmissions = getAssignmentSubmissions;
// Grade a single submission
const gradeSubmission = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { grade, feedback, gradedById } = req.body;
        // Validate grade
        const assignment = await prismadb_1.prismadb.assignment.findFirst({
            where: {
                submissions: {
                    some: { id: submissionId },
                },
            },
            select: {
                points: true,
                id: true,
                title: true,
                cohortCourse: {
                    select: {
                        cohort: { select: { id: true, name: true } },
                        course: { select: { id: true, title: true } },
                    },
                },
                classroomTopic: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });
        if (!assignment) {
            return res.status(404).json({ error: "Submission not found" });
        }
        const maxPoints = assignment.points || 100;
        if (grade < 0 || grade > maxPoints) {
            return res
                .status(400)
                .json({ error: `Grade must be between 0 and ${maxPoints}` });
        }
        const submission = await prismadb_1.prismadb.assignmentSubmission.update({
            where: { id: submissionId },
            data: {
                grade: parseInt(grade),
                feedback: feedback || null,
                gradedById,
                gradedAt: new Date(),
            },
            include: {
                student: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
                gradedBy: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                assignment: {
                    include: {
                        cohortCourse: {
                            include: { cohort: true },
                        },
                    },
                },
            },
        });
        const adminUser = req?.user;
        // Send Notification to the specific student
        try {
            if (submission?.student?.email) {
                await Promise.all([
                    await (0, mail_1.sendClassroomNotificationEmail)([submission.student.email], submission.assignment.cohortCourse.cohort.name, "grade", submission.assignment.title, `Your submission has been graded. Grade: ${grade}/${maxPoints}. Feedback: ${feedback || "No feedback provided."}`, submission.gradedBy?.name || "Instructor"),
                    await notification_service_1.NotificationService.create({
                        userId: submission.student.id,
                        type: "CLASSROOM_ASSIGNMENT_GRADED",
                        payload: {
                            assignmentId: assignment.id,
                            assignmentTitle: assignment.title,
                            cohortId: assignment.cohortCourse.cohort.id,
                            cohortName: assignment.cohortCourse.cohort.name,
                            courseTitle: assignment.cohortCourse.course.title,
                            courseId: assignment.cohortCourse.course.id,
                            topicId: assignment.classroomTopic?.id,
                            topicTitle: assignment.classroomTopic?.title,
                            assignmentMaxScore: maxPoints,
                            assignmentScore: grade,
                        },
                        relatedUserId: adminUser?.id,
                    }),
                    await prismadb_1.prismadb.courseCohortLeaderboard.upsert({
                        where: {
                            userId_courseId_cohortId: {
                                cohortId: assignment.cohortCourse?.cohort?.id,
                                courseId: assignment.cohortCourse?.course?.id,
                                userId: submission.student.id,
                            },
                        },
                        create: {
                            assignmentPoints: grade,
                            points: grade,
                            lessonQuizPoints: 0,
                            lessonVideoPoints: 0,
                            cohortId: assignment.cohortCourse?.cohort?.id,
                            courseId: assignment.cohortCourse?.course?.id,
                            userId: submission.student.id,
                        },
                        update: {
                            assignmentPoints: { increment: grade || 0 },
                            points: { increment: grade || 0 },
                        },
                    }),
                ]);
            }
        }
        catch (notifError) {
            console.error("Failed to send grade notification:", notifError);
        }
        res.json({
            submission,
            message: "Submission graded successfully",
        });
    }
    catch (error) {
        console.error("Grade submission error:", error);
        res.status(500).json({ error: "Failed to grade submission" });
    }
};
exports.gradeSubmission = gradeSubmission;
const gradeQuizSubmission = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const { grade, feedback, gradedById } = req.body;
        const adminUser = req.user;
        const [existingSubmission] = await Promise.all([
            prismadb_1.prismadb.assignmentQuizSubmission.findUnique({
                where: {
                    id: submissionId,
                },
                include: {
                    assignment: {
                        select: {
                            id: true,
                            title: true,
                            cohortCourse: {
                                include: {
                                    cohort: { select: { id: true, name: true } },
                                    course: { select: { id: true, title: true } },
                                },
                            },
                            classroomTopic: {
                                select: {
                                    id: true,
                                    title: true,
                                },
                            },
                        },
                    },
                },
            }),
        ]);
        if (!existingSubmission?.id) {
            return res
                .status(404)
                .json({ status: "error", message: "Assignment submission not found" });
        }
        const userLeadboard = await prismadb_1.prismadb.courseCohortLeaderboard.findUnique({
            where: {
                userId_courseId_cohortId: {
                    courseId: existingSubmission.assignment.cohortCourse.course.id,
                    cohortId: existingSubmission.assignment.cohortCourse.cohort.id,
                    userId: existingSubmission.studentId,
                },
            },
            select: {
                id: true,
                points: true,
                assignmentPoints: true,
            },
        });
        let newAssignmentPoints = parseInt(grade), newTotalPoints = parseInt(grade);
        if (userLeadboard?.id &&
            userLeadboard?.assignmentPoints &&
            existingSubmission.totalScore) {
            newAssignmentPoints =
                (userLeadboard.assignmentPoints || 0) -
                    (existingSubmission.totalScore || 0) +
                    parseInt(grade);
            newTotalPoints =
                userLeadboard.points -
                    (existingSubmission.totalScore || 0) +
                    parseInt(grade);
        }
        const submission = await prismadb_1.prismadb.assignmentQuizSubmission.update({
            where: { id: submissionId },
            data: {
                totalScore: parseInt(grade),
                feedback: feedback || null,
                gradedById,
                gradedAt: new Date(),
            },
        });
        if (!submission.id) {
            return res.status(400).json({
                status: "error",
                message: "Failed to grade assignment submission quiz",
            });
        }
        await Promise.all([
            await notification_service_1.NotificationService.create({
                userId: existingSubmission.studentId,
                type: "CLASSROOM_ASSIGNMENT_GRADED",
                payload: {
                    assignmentId: existingSubmission.assignment.id,
                    assignmentTitle: existingSubmission.assignment.title,
                    cohortId: existingSubmission.assignment.cohortCourse.cohort.id,
                    cohortName: existingSubmission.assignment.cohortCourse.cohort.name,
                    courseTitle: existingSubmission.assignment.cohortCourse.course.title,
                    courseId: existingSubmission.assignment.cohortCourse.course.id,
                    topicId: existingSubmission.assignment.classroomTopic?.id,
                    topicTitle: existingSubmission.assignment.classroomTopic?.id,
                    assignmentMaxScore: existingSubmission.maxScore,
                    assignmentScore: parseInt(grade),
                },
                relatedUserId: adminUser?.id,
            }),
            await prismadb_1.prismadb.courseCohortLeaderboard.upsert({
                where: {
                    userId_courseId_cohortId: {
                        cohortId: existingSubmission.assignment.cohortCourse?.cohort?.id,
                        courseId: existingSubmission.assignment.cohortCourse?.course?.id,
                        userId: existingSubmission.studentId,
                    },
                },
                create: {
                    assignmentPoints: parseInt(grade),
                    points: parseInt(grade),
                    lessonQuizPoints: 0,
                    lessonVideoPoints: 0,
                    cohortId: existingSubmission.assignment.cohortCourse?.cohort?.id,
                    courseId: existingSubmission.assignment.cohortCourse?.course?.id,
                    userId: existingSubmission.studentId,
                },
                update: {
                    assignmentPoints: newAssignmentPoints,
                    points: newTotalPoints,
                },
            }),
        ]);
        res.json({ submission });
    }
    catch (error) {
        console.error("Grade quiz error:", error);
        res.status(500).json({ error: "Failed to grade quiz" });
    }
};
exports.gradeQuizSubmission = gradeQuizSubmission;
// Bulk grade multiple submissions
const bulkGradeSubmissions = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { grades, gradedById } = req.body;
        const adminUser = req.user;
        if (!Array.isArray(grades) || grades.length === 0) {
            return res.status(400).json({ error: "No grades provided" });
        }
        // Get assignment to validate points
        const assignment = await prismadb_1.prismadb.assignment.findFirst({
            where: {
                OR: [{ id: assignmentId }, { slug: assignmentId }],
            },
            select: {
                points: true,
                id: true,
                title: true,
                cohortCourse: {
                    select: {
                        cohort: { select: { id: true, name: true } },
                        course: { select: { id: true, title: true } },
                    },
                },
                classroomTopic: {
                    select: {
                        id: true,
                        title: true,
                    },
                },
            },
        });
        if (!assignment) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        const maxPoints = assignment.points || 100;
        // Validate all grades first
        for (const gradeData of grades) {
            if (gradeData.grade < 0 || gradeData.grade > maxPoints) {
                return res.status(400).json({
                    error: `Grade for submission ${gradeData.submissionId} must be between 0 and ${maxPoints}`,
                });
            }
        }
        // Update all submissions in a transaction
        const results = await prismadb_1.prismadb.$transaction(grades.map((gradeData) => prismadb_1.prismadb.assignmentSubmission.update({
            where: { id: gradeData.submissionId },
            data: {
                grade: parseInt(gradeData.grade),
                feedback: gradeData.feedback || null,
                gradedById,
                gradedAt: new Date(),
            },
            include: {
                student: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        })));
        if (Array.isArray(results)) {
            const cohortId = assignment.cohortCourse?.cohort?.id;
            const cohortName = assignment.cohortCourse?.cohort?.name;
            const courseId = assignment.cohortCourse?.course?.id;
            const courseTitle = assignment.cohortCourse?.course?.title;
            void Promise.all(results.map(async (studentSubmission) => {
                const gradeData = grades.find((grade) => grade.submissionId === studentSubmission.id);
                const finalGrade = Number(gradeData?.grade || 0);
                return Promise.all([
                    notification_service_1.NotificationService.create({
                        userId: studentSubmission.studentId,
                        type: "CLASSROOM_ASSIGNMENT_GRADED",
                        payload: {
                            assignmentId: assignment.id,
                            assignmentTitle: assignment.title,
                            cohortId,
                            cohortName,
                            courseId,
                            courseTitle,
                            topicId: assignment.classroomTopic?.id,
                            topicTitle: assignment.classroomTopic?.title,
                            assignmentMaxScore: maxPoints,
                            assignmentScore: finalGrade,
                        },
                        relatedUserId: adminUser?.id,
                    }),
                    prismadb_1.prismadb.courseCohortLeaderboard.upsert({
                        where: {
                            userId_courseId_cohortId: {
                                userId: studentSubmission.studentId,
                                courseId,
                                cohortId,
                            },
                        },
                        create: {
                            userId: studentSubmission.studentId,
                            courseId,
                            cohortId,
                            assignmentPoints: finalGrade,
                            points: finalGrade,
                            lessonQuizPoints: 0,
                            lessonVideoPoints: 0,
                        },
                        update: {
                            assignmentPoints: {
                                increment: finalGrade,
                            },
                            points: {
                                increment: finalGrade,
                            },
                        },
                    }),
                ]);
            }));
        }
        res.json({
            submissions: results,
            message: `${results.length} submissions graded successfully`,
        });
    }
    catch (error) {
        console.error("Bulk grade error:", error);
        res.status(500).json({ error: "Failed to grade submissions" });
    }
};
exports.bulkGradeSubmissions = bulkGradeSubmissions;
//create quiz assignment
const createQuizAssignment = async (req, res) => {
    try {
        const { title, description, instructions, dueDate, points, classroomTopicId, cohortCourseId: bodyCohortCourseId, questions, } = req.body;
        // Validate required fields
        if (!title) {
            return res.status(400).json({
                error: "Title is required",
            });
        }
        let finalCohortCourseId = bodyCohortCourseId;
        if (classroomTopicId) {
            // Get the topic to get the cohortCourseId (same as in addSubItem)
            const topic = await prismadb_1.prismadb.classroomTopic.findUnique({
                where: { id: classroomTopicId },
                select: {
                    id: true,
                    cohortCourseId: true,
                    cohortCourse: {
                        select: {
                            id: true,
                            cohortId: true,
                        },
                    },
                },
            });
            if (!topic) {
                return res.status(404).json({ error: "Topic not found" });
            }
            if (!topic.cohortCourseId) {
                return res.status(400).json({
                    error: "Topic is not associated with a valid cohort course",
                });
            }
            finalCohortCourseId = topic.cohortCourseId;
        }
        if (!finalCohortCourseId) {
            return res.status(400).json({
                error: "Either classroomTopicId or cohortCourseId must be provided",
            });
        }
        // Validate questions
        if (!questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({
                error: "At least one question is required",
            });
        }
        // Validate each question
        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            if (!question.question?.trim()) {
                return res.status(400).json({
                    error: `Question ${i + 1} text is required`,
                });
            }
            if (!question.options ||
                !Array.isArray(question.options) ||
                question.options.length === 0) {
                return res.status(400).json({
                    error: `Question ${i + 1} must have at least one option`,
                });
            }
            const correctOptions = question.options.filter((opt) => opt.isCorrect);
            if (correctOptions.length !== 1) {
                return res.status(400).json({
                    error: `Question ${i + 1} must have exactly one correct answer`,
                });
            }
            for (let j = 0; j < question.options.length; j++) {
                if (!question.options[j].text?.trim()) {
                    return res.status(400).json({
                        error: `Option ${j + 1} for question ${i + 1} is required`,
                    });
                }
            }
        }
        // Calculate total points
        const totalPoints = points ||
            questions.reduce((sum, q) => sum + (q.points || 1), 0);
        // Create the quiz assignment using the same pattern as regular assignments
        const assignment = await prismadb_1.prismadb.assignment.create({
            data: {
                title: title.trim(),
                description: description?.trim(),
                instructions: instructions?.trim(),
                dueDate: dueDate ? new Date(dueDate) : null,
                points: parseInt(totalPoints) || 100,
                type: "QUIZ",
                slug: await (0, slugify_1.generateUniqueAssignmentSlug)(title, prismadb_1.prismadb),
                classroomTopicId: classroomTopicId || null,
                cohortCourseId: finalCohortCourseId, // Use the finalCohortCourseId
                assignmentQuizQuestions: {
                    create: questions.map((q, index) => ({
                        question: q.question.trim(),
                        order: index,
                        points: q.points || 1,
                        assignmentQuizOptions: {
                            create: q.options.map((opt, optIndex) => ({
                                text: opt.text.trim(),
                                isCorrect: opt.isCorrect,
                                order: optIndex,
                            })),
                        },
                    })),
                },
            },
            include: {
                assignmentQuizQuestions: {
                    include: {
                        assignmentQuizOptions: true,
                    },
                    orderBy: { order: "asc" },
                },
                cohortCourse: {
                    include: {
                        course: true,
                        cohort: true,
                    },
                },
            },
        });
        // Send Notifications to all students in the cohort
        try {
            const students = await prismadb_1.prismadb.userCohort.findMany({
                where: { cohortId: assignment.cohortCourse.cohortId, isActive: true },
                include: { user: { select: { email: true } } },
            });
            const emails = students
                .map((s) => s.user.email)
                .filter(Boolean);
            const currentUser = req.user;
            if (emails.length > 0) {
                await (0, mail_1.sendClassroomNotificationEmail)(emails, assignment.cohortCourse.cohort.name, "quiz assignment", title, description || instructions || "", currentUser?.name || "Instructor");
            }
        }
        catch (notifError) {
            console.error("Failed to send quiz assignment notification:", notifError);
        }
        res.status(201).json({
            assignment,
            message: "Quiz assignment created successfully",
        });
    }
    catch (error) {
        console.error("Create quiz assignment error:", error);
        if (error instanceof Error && "code" in error) {
            const prismaError = error;
            switch (prismaError.code) {
                case "P2003":
                    return res.status(400).json({
                        error: "Invalid reference: One of the provided IDs does not exist",
                    });
                case "P2002":
                    return res.status(400).json({
                        error: "A assignment with similar details already exists",
                    });
            }
        }
        res.status(500).json({ error: "Failed to create quiz assignment" });
    }
};
exports.createQuizAssignment = createQuizAssignment;
const updateAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const data = req.body;
        const assignment = await prismadb_1.prismadb.assignment.update({
            where: { id: assignmentId },
            data: data,
        });
        res.json({ assignment, message: "Assignment updated successfully" });
    }
    catch (error) {
        console.error("Update assignment error:", error);
        res.status(500).json({ error: "Failed to update assignment" });
    }
};
exports.updateAssignment = updateAssignment;
// Get all quiz submissions for an assignment (Instructor view)
const getAssignmentQuizSubmissions = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const quizSubmissions = await prismadb_1.prismadb.assignmentQuizSubmission.findMany({
            where: { assignmentId },
            include: {
                assignment: true,
                student: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
                assignmentQuizAnswers: {
                    include: {
                        assignmentQuizQuestion: {
                            include: {
                                assignmentQuizOptions: true,
                            },
                        },
                        selectedAssignmentQuizOption: true,
                    },
                },
            },
            orderBy: { submittedAt: "desc" },
        });
        res.json({ submissions: quizSubmissions });
    }
    catch (error) {
        console.error("Get quiz submissions error:", error);
        res.status(500).json({ error: "Failed to fetch quiz submissions" });
    }
};
exports.getAssignmentQuizSubmissions = getAssignmentQuizSubmissions;
// Get quiz results for a student
const getAssignmentQuizResults = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { studentId } = req.query;
        const targetAssignment = await prismadb_1.prismadb.assignment.findFirst({
            where: {
                OR: [{ id: assignmentId }, { slug: assignmentId }],
            },
        });
        if (!targetAssignment) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        const assignmentQuizSubmission = await prismadb_1.prismadb.assignmentQuizSubmission.findUnique({
            where: {
                assignmentId_studentId: {
                    assignmentId: targetAssignment.id,
                    studentId: studentId,
                },
            },
            include: {
                assignmentQuizAnswers: {
                    include: {
                        assignmentQuizQuestion: {
                            include: {
                                assignmentQuizOptions: true,
                            },
                        },
                        selectedAssignmentQuizOption: true,
                    },
                },
            },
        });
        if (!assignmentQuizSubmission) {
            return res.status(404).json({ error: "Quiz submission not found" });
        }
        res.json({ assignmentQuizSubmission });
    }
    catch (error) {
        console.error("Get quiz results error:", error);
        res.status(500).json({ error: "Failed to fetch quiz results" });
    }
};
exports.getAssignmentQuizResults = getAssignmentQuizResults;
//# sourceMappingURL=index.js.map