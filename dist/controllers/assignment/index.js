"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAssignmentQuizResults = exports.createQuizAssignment = exports.bulkGradeSubmissions = exports.gradeSubmission = exports.getAssignmentSubmissions = exports.submitAssignment = exports.getAssignmentSubmission = exports.getAssignment = void 0;
const index_1 = require("../../index");
// Updated getAssignment to include assignment quiz questions
const getAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const assignment = await index_1.prismadb.assignment.findUnique({
            where: { id: assignmentId },
            include: {
                attachments: true,
                assignmentQuizQuestions: {
                    include: {
                        assignmentQuizOptions: {
                            orderBy: { order: "asc" }
                        }
                    },
                    orderBy: { order: "asc" }
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
                        assignmentQuizQuestions: true
                    }
                }
            },
        });
        if (!assignment) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        // For quiz assignments, don't send correct answers to students
        if (assignment.type === "QUIZ" && req.query.studentId) {
            assignment.assignmentQuizQuestions = assignment.assignmentQuizQuestions.map(question => ({
                ...question,
                assignmentQuizOptions: question.assignmentQuizOptions.map(option => ({
                    ...option,
                    isCorrect: undefined
                }))
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
        const submission = await index_1.prismadb.assignmentSubmission.findUnique({
            where: {
                assignmentId_studentId: {
                    assignmentId,
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
// Updated submitAssignment to handle quiz submissions
const submitAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { content, fileUrl, quizAnswers } = req.body;
        const user = req.user;
        const studentId = user.id;
        // Check if assignment exists
        const assignment = await index_1.prismadb.assignment.findUnique({
            where: { id: assignmentId },
            include: {
                assignmentQuizQuestions: {
                    include: {
                        assignmentQuizOptions: true
                    }
                }
            }
        });
        if (!assignment) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        // Handle quiz submission
        if (assignment.type === "QUIZ" && quizAnswers) {
            return await handleAssignmentQuizSubmission(assignment, quizAnswers, studentId, res);
        }
        // Handle regular assignment submission (existing code)
        const existingSubmission = await index_1.prismadb.assignmentSubmission.findUnique({
            where: {
                assignmentId_studentId: {
                    assignmentId,
                    studentId,
                },
            },
        });
        if (existingSubmission) {
            return res.status(400).json({ error: "Assignment already submitted" });
        }
        // Check if assignment is past due date
        if (assignment.dueDate && new Date() > new Date(assignment.dueDate)) {
            return res.status(400).json({ error: "Assignment submission is overdue" });
        }
        // Create submission with Cloudinary URL
        const submission = await index_1.prismadb.assignmentSubmission.create({
            data: {
                content: content || null,
                fileUrl: fileUrl || null,
                assignmentId,
                studentId,
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
        // Log the submission for tracking
        console.log(`Assignment submitted: ${assignmentId} by student: ${studentId}`);
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
        const submissions = await index_1.prismadb.assignmentSubmission.findMany({
            where: { assignmentId },
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
        const assignment = await index_1.prismadb.assignment.findFirst({
            where: {
                submissions: {
                    some: { id: submissionId }
                }
            },
            select: { points: true }
        });
        if (!assignment) {
            return res.status(404).json({ error: "Submission not found" });
        }
        const maxPoints = assignment.points || 100;
        if (grade < 0 || grade > maxPoints) {
            return res.status(400).json({ error: `Grade must be between 0 and ${maxPoints}` });
        }
        const submission = await index_1.prismadb.assignmentSubmission.update({
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
            },
        });
        res.json({
            submission,
            message: "Submission graded successfully"
        });
    }
    catch (error) {
        console.error("Grade submission error:", error);
        res.status(500).json({ error: "Failed to grade submission" });
    }
};
exports.gradeSubmission = gradeSubmission;
// Bulk grade multiple submissions
const bulkGradeSubmissions = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { grades, gradedById } = req.body;
        if (!Array.isArray(grades) || grades.length === 0) {
            return res.status(400).json({ error: "No grades provided" });
        }
        // Get assignment to validate points
        const assignment = await index_1.prismadb.assignment.findUnique({
            where: { id: assignmentId },
            select: { points: true }
        });
        if (!assignment) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        const maxPoints = assignment.points || 100;
        // Validate all grades first
        for (const gradeData of grades) {
            if (gradeData.grade < 0 || gradeData.grade > maxPoints) {
                return res.status(400).json({
                    error: `Grade for submission ${gradeData.submissionId} must be between 0 and ${maxPoints}`
                });
            }
        }
        // Update all submissions in a transaction
        const results = await index_1.prismadb.$transaction(grades.map(gradeData => index_1.prismadb.assignmentSubmission.update({
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
        res.json({
            submissions: results,
            message: `${results.length} submissions graded successfully`
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
        const { title, description, instructions, dueDate, points, classroomTopicId, questions } = req.body;
        // Validate required fields
        if (!title || !classroomTopicId) {
            return res.status(400).json({
                error: "Title and topic ID are required"
            });
        }
        // Get the topic to get the cohortCourseId (same as in addSubItem)
        const topic = await index_1.prismadb.classroomTopic.findUnique({
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
            return res.status(400).json({ error: "Topic is not associated with a valid cohort course" });
        }
        // Validate questions
        if (!questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({
                error: "At least one question is required"
            });
        }
        // Validate each question
        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            if (!question.question?.trim()) {
                return res.status(400).json({
                    error: `Question ${i + 1} text is required`
                });
            }
            if (!question.options || !Array.isArray(question.options) || question.options.length === 0) {
                return res.status(400).json({
                    error: `Question ${i + 1} must have at least one option`
                });
            }
            const correctOptions = question.options.filter((opt) => opt.isCorrect);
            if (correctOptions.length !== 1) {
                return res.status(400).json({
                    error: `Question ${i + 1} must have exactly one correct answer`
                });
            }
            for (let j = 0; j < question.options.length; j++) {
                if (!question.options[j].text?.trim()) {
                    return res.status(400).json({
                        error: `Option ${j + 1} for question ${i + 1} is required`
                    });
                }
            }
        }
        // Calculate total points
        const totalPoints = points || questions.reduce((sum, q) => sum + (q.points || 1), 0);
        // Create the quiz assignment using the same pattern as regular assignments
        const assignment = await index_1.prismadb.assignment.create({
            data: {
                title: title.trim(),
                description: description?.trim(),
                instructions: instructions?.trim(),
                dueDate: dueDate ? new Date(dueDate) : null,
                points: parseInt(totalPoints) || 100,
                type: "QUIZ",
                classroomTopicId: classroomTopicId,
                cohortCourseId: topic.cohortCourseId, // Use the cohortCourseId from the topic
                assignmentQuizQuestions: {
                    create: questions.map((q, index) => ({
                        question: q.question.trim(),
                        order: index,
                        points: q.points || 1,
                        assignmentQuizOptions: {
                            create: q.options.map((opt, optIndex) => ({
                                text: opt.text.trim(),
                                isCorrect: opt.isCorrect,
                                order: optIndex
                            }))
                        }
                    }))
                }
            },
            include: {
                assignmentQuizQuestions: {
                    include: {
                        assignmentQuizOptions: true
                    },
                    orderBy: { order: 'asc' }
                },
                cohortCourse: {
                    include: {
                        course: true,
                        cohort: true
                    }
                },
                classroomTopic: true
            }
        });
        res.status(201).json({
            assignment,
            message: "Quiz assignment created successfully"
        });
    }
    catch (error) {
        console.error("Create quiz assignment error:", error);
        if (error instanceof Error && 'code' in error) {
            const prismaError = error;
            switch (prismaError.code) {
                case 'P2003':
                    return res.status(400).json({
                        error: "Invalid reference: One of the provided IDs does not exist"
                    });
                case 'P2002':
                    return res.status(400).json({
                        error: "A assignment with similar details already exists"
                    });
            }
        }
        res.status(500).json({ error: "Failed to create quiz assignment" });
    }
};
exports.createQuizAssignment = createQuizAssignment;
// Helper function for quiz submission
const handleAssignmentQuizSubmission = async (assignment, quizAnswers, studentId, res) => {
    // Check if already submitted
    const existingSubmission = await index_1.prismadb.assignmentQuizSubmission.findUnique({
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
        const pointsEarned = isCorrect ? (question.points || 1) : 0;
        totalScore += pointsEarned;
        return {
            assignmentQuizQuestionId: answer.questionId,
            selectedAssignmentQuizOptionId: answer.selectedOptionId,
            isCorrect,
            pointsEarned,
        };
    }));
    // Create quiz submission with answers
    const submission = await index_1.prismadb.assignmentQuizSubmission.create({
        data: {
            assignmentId: assignment.id,
            studentId,
            totalScore,
            maxScore,
            assignmentQuizAnswers: {
                create: answerResults.map(result => ({
                    assignmentQuizQuestionId: result.assignmentQuizQuestionId,
                    selectedAssignmentQuizOptionId: result.selectedAssignmentQuizOptionId,
                    isCorrect: result.isCorrect,
                    pointsEarned: result.pointsEarned,
                }))
            }
        },
        include: {
            assignmentQuizAnswers: {
                include: {
                    assignmentQuizQuestion: true,
                    selectedAssignmentQuizOption: true
                }
            }
        }
    });
    // Also create a regular assignment submission for consistency
    await index_1.prismadb.assignmentSubmission.create({
        data: {
            assignmentId: assignment.id,
            studentId,
            content: `Quiz submitted - Score: ${totalScore}/${maxScore}`,
            submittedAt: new Date(),
        }
    });
    res.json({
        submission,
        score: totalScore,
        maxScore,
        percentage: Math.round((totalScore / maxScore) * 100),
        message: "Quiz submitted successfully"
    });
};
// Get quiz results for a student
const getAssignmentQuizResults = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        const { studentId } = req.query;
        const assignmentQuizSubmission = await index_1.prismadb.assignmentQuizSubmission.findUnique({
            where: {
                assignmentId_studentId: {
                    assignmentId,
                    studentId: studentId,
                },
            },
            include: {
                assignmentQuizAnswers: {
                    include: {
                        assignmentQuizQuestion: {
                            include: {
                                assignmentQuizOptions: true
                            }
                        },
                        selectedAssignmentQuizOption: true
                    }
                }
            }
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