"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCohortLiveClasses = exports.getLiveClassAttendance = exports.joinLiveClass = exports.deleteLiveClass = exports.deleteRecording = exports.deleteMaterial = exports.deleteAssignment = exports.getStreamActivities = exports.createStreamPost = exports.getStreamPosts = exports.addSubItem = exports.deleteTopic = exports.updateTopic = exports.createTopic = exports.getClassroomTopics = exports.getClassroomData = void 0;
const prismadb_1 = require("../../lib/prismadb");
const mail_1 = require("../authentication/mail");
const slugify_1 = require("../../utils/slugify");
const liveClassNotifications_1 = require("../../utils/liveClassNotifications");
const getClassroomData = async (req, res) => {
    try {
        const { cohortId } = req.params;
        const cohort = await prismadb_1.prismadb.cohort.findUnique({
            where: { id: cohortId },
            include: {
                course: true,
                cohortCourses: {
                    include: {
                        assignments: true,
                        classMaterial: true,
                        classRecording: true,
                        classroomTopic: {
                            include: {
                                assignments: true,
                                classMaterials: true,
                                classRecordings: true,
                            },
                        },
                        streamPost: {
                            include: {
                                author: true,
                                comments: {
                                    include: {
                                        author: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!cohort) {
            return res.status(404).json({ error: "Cohort not found" });
        }
        res.json({
            cohortId: cohort.id,
            cohortName: cohort.name,
            course: cohort.course, // This should now work
            cohortCourses: cohort.cohortCourses, // This should now work
        });
    }
    catch (error) {
        console.error("Classroom data error:", error);
        res.status(500).json({ error: "Failed to fetch classroom data" });
    }
};
exports.getClassroomData = getClassroomData;
const getClassroomTopics = async (req, res) => {
    try {
        const { cohortId } = req.params;
        const { cohortCourseId } = req.query;
        let topicsWhere = {};
        let itemsWhere = {};
        if (cohortId) {
            topicsWhere = { cohortCourse: { cohortId } };
            itemsWhere = { cohortCourse: { cohortId }, classroomTopicId: null };
        }
        else if (cohortCourseId) {
            topicsWhere = { cohortCourseId: cohortCourseId };
            itemsWhere = {
                cohortCourseId: cohortCourseId,
                classroomTopicId: null,
            };
        }
        else {
            return res.status(400).json({
                error: "Missing identifying parameter (cohortId or cohortCourseId)",
            });
        }
        const [topics, unassignedAssignments, unassignedMaterials, unassignedRecordings, unassignedLiveClasses,] = await Promise.all([
            prismadb_1.prismadb.classroomTopic.findMany({
                where: topicsWhere,
                include: {
                    assignments: {
                        orderBy: { createdAt: "asc" },
                    },
                    classMaterials: {
                        orderBy: { createdAt: "asc" },
                    },
                    classRecordings: {
                        orderBy: { createdAt: "asc" },
                    },
                    LiveClass: {
                        orderBy: { createdAt: "asc" },
                    },
                },
                orderBy: [
                    { isPinned: "desc" },
                    { order: "asc" },
                    { createdAt: "desc" },
                ],
            }),
            prismadb_1.prismadb.assignment.findMany({
                where: itemsWhere,
                orderBy: { createdAt: "desc" },
            }),
            prismadb_1.prismadb.classMaterial.findMany({
                where: itemsWhere,
                orderBy: { createdAt: "desc" },
            }),
            prismadb_1.prismadb.classRecording.findMany({
                where: itemsWhere,
                orderBy: { createdAt: "desc" },
            }),
            // @ts-ignore
            prismadb_1.prismadb.liveClass.findMany({
                where: itemsWhere,
                orderBy: { createdAt: "desc" },
            }),
        ]);
        const user = req.user;
        const userId = user?.id;
        const isAdmin = user?.role === "ADMIN" || user?.role === "COURSE_ADMIN";
        // Fetch user progress and submissions for unlocking logic
        const [userProgress, submissions] = await Promise.all([
            prismadb_1.prismadb.userProgress.findMany({
                where: { userId },
            }),
            prismadb_1.prismadb.assignmentSubmission.findMany({
                where: { studentId: userId },
            }),
        ]);
        const completedVideoIds = new Set(userProgress.filter((p) => p.isCompleted).map((p) => p.videoId));
        const submittedAssignmentIds = new Set(submissions.map((s) => s.assignmentId));
        // Process topics to add isCompleted and isLocked status
        let previousTopicCompleted = true; // The first topic is always unlocked
        const processedTopics = topics.map((topic) => {
            const processedAssignments = topic.assignments.map((a) => ({
                ...a,
                isCompleted: submittedAssignmentIds.has(a.id),
            }));
            const processedRecordings = topic.classRecordings.map((r) => ({
                ...r,
                isCompleted: completedVideoIds.has(r.id),
            }));
            const allVideosCompleted = processedRecordings.length === 0 ||
                processedRecordings.every((r) => r.isCompleted);
            const allAssignmentsSubmitted = processedAssignments.length === 0 ||
                processedAssignments.every((a) => a.isCompleted);
            const isCompleted = allVideosCompleted && allAssignmentsSubmitted;
            // A topic is locked if the previous topic was NOT completed
            // Except for the first topic which is always unlocked
            const isLocked = !previousTopicCompleted;
            // Update previousTopicCompleted for the next iteration
            previousTopicCompleted = isCompleted;
            return {
                ...topic,
                assignments: processedAssignments,
                classRecordings: processedRecordings,
                isCompleted,
                isLocked: isAdmin ? false : isLocked,
            };
        });
        res.json({
            topics: processedTopics,
            unassignedItems: {
                assignments: unassignedAssignments,
                materials: unassignedMaterials,
                recordings: unassignedRecordings,
                liveClasses: unassignedLiveClasses,
            },
        });
    }
    catch (error) {
        console.error("Topics error:", error);
        res.status(500).json({ error: "Failed to fetch topics" });
    }
};
exports.getClassroomTopics = getClassroomTopics;
const createTopic = async (req, res) => {
    try {
        const { cohortCourseId, title, description, isPinned } = req.body;
        // First, find the cohort course to ensure it exists
        const cohortCourse = await prismadb_1.prismadb.cohortCourse.findFirst({
            where: { id: cohortCourseId },
        });
        if (!cohortCourse) {
            return res.status(404).json({ error: "Cohort course not found" });
        }
        // Get the highest order number
        const highestOrderTopic = await prismadb_1.prismadb.classroomTopic.findFirst({
            where: { cohortCourseId },
            orderBy: { order: "desc" },
        });
        const topic = await prismadb_1.prismadb.classroomTopic.create({
            data: {
                title,
                description,
                isPinned: isPinned || false,
                order: (highestOrderTopic?.order || 0) + 1,
                cohortCourseId,
            },
            include: {
                cohortCourse: {
                    include: {
                        cohort: true,
                    },
                },
            },
        });
        // Send Notification to all students in the cohort
        try {
            const students = await prismadb_1.prismadb.userCohort.findMany({
                where: { cohortId: topic.cohortCourse.cohortId, isActive: true },
                include: { user: { select: { email: true } } },
            });
            const emails = students
                .map((s) => s.user.email)
                .filter(Boolean);
            const currentUser = req.user;
            if (emails.length > 0) {
                await (0, mail_1.sendClassroomNotificationEmail)(emails, topic.cohortCourse.cohort.name, "topic", title, description || "", currentUser?.name || "Instructor");
            }
        }
        catch (notifError) {
            console.error("Failed to send topic notification:", notifError);
        }
        res.json({ topic });
    }
    catch (error) {
        console.error("Create topic error:", error);
        res.status(500).json({ error: "Failed to create topic" });
    }
};
exports.createTopic = createTopic;
const updateTopic = async (req, res) => {
    try {
        const { topicId } = req.params;
        const { title, description, isPinned, order } = req.body;
        const topic = await prismadb_1.prismadb.classroomTopic.update({
            where: { id: topicId },
            data: {
                ...(title && { title }),
                ...(description && { description }),
                ...(isPinned !== undefined && { isPinned }),
                ...(order && { order }),
            },
        });
        res.json({ topic });
    }
    catch (error) {
        console.error("Update topic error:", error);
        res.status(500).json({ error: "Failed to update topic" });
    }
};
exports.updateTopic = updateTopic;
const deleteTopic = async (req, res) => {
    try {
        const { topicId } = req.params;
        // First, verify the topic exists and get its related items for logging
        const topic = await prismadb_1.prismadb.classroomTopic.findUnique({
            where: { id: topicId },
            include: {
                assignments: { select: { id: true, title: true } },
                classMaterials: { select: { id: true, title: true } },
                classRecordings: { select: { id: true, title: true } },
            },
        });
        if (!topic) {
            return res.status(404).json({ error: "Topic not found" });
        }
        // Log what will be deleted
        console.log(`Deleting topic "${topic.title}" and its related items:`, {
            assignments: topic.assignments.length,
            materials: topic.classMaterials.length,
            recordings: topic.classRecordings.length,
        });
        // Delete the topic - this will cascade delete all related items
        // due to the onDelete: Cascade in the Prisma schema
        await prismadb_1.prismadb.classroomTopic.delete({
            where: { id: topicId },
        });
        res.json({
            message: "Topic and all related items deleted successfully",
            deletedItems: {
                topic: topic.title,
                assignmentsCount: topic.assignments.length,
                materialsCount: topic.classMaterials.length,
                recordingsCount: topic.classRecordings.length,
            },
        });
    }
    catch (error) {
        console.error("Delete topic error:", error);
        res.status(500).json({ error: "Failed to delete topic" });
    }
};
exports.deleteTopic = deleteTopic;
const addSubItem = async (req, res) => {
    try {
        const { topicId, cohortCourseId, type, data } = req.body;
        let targetCohortCourseId = cohortCourseId;
        let cohortId = "";
        let cohortName = "Classroom";
        if (topicId) {
            const topic = await prismadb_1.prismadb.classroomTopic.findUnique({
                where: { id: topicId },
                select: {
                    cohortCourseId: true,
                    cohortCourse: {
                        select: {
                            cohortId: true,
                            cohort: { select: { name: true } },
                        },
                    },
                },
            });
            if (!topic)
                return res.status(404).json({ error: "Topic not found" });
            targetCohortCourseId = topic.cohortCourseId;
            cohortId = topic.cohortCourse.cohortId;
            cohortName = topic.cohortCourse.cohort.name;
        }
        else {
            // If no topic and no cohortCourseId, we can't proceed
            if (!targetCohortCourseId) {
                return res
                    .status(400)
                    .json({ error: "Either topicId or cohortCourseId must be provided" });
            }
            // Fetch cohort name for notification
            const cohortCourse = await prismadb_1.prismadb.cohortCourse.findUnique({
                where: { id: targetCohortCourseId },
                include: { cohort: { select: { id: true, name: true } } },
            });
            if (!cohortCourse)
                return res.status(404).json({ error: "Cohort course not found" });
            cohortId = cohortCourse.cohort.id;
            cohortName = cohortCourse.cohort.name;
        }
        let result;
        switch (type) {
            case "assignment":
                result = await prismadb_1.prismadb.assignment.create({
                    data: {
                        ...data,
                        classroomTopicId: topicId || null,
                        cohortCourseId: targetCohortCourseId,
                        slug: await (0, slugify_1.generateUniqueAssignmentSlug)(data.title, prismadb_1.prismadb),
                    },
                });
                break;
            case "material":
                result = await prismadb_1.prismadb.classMaterial.create({
                    data: {
                        ...data,
                        classroomTopicId: topicId || null,
                        cohortCourseId: targetCohortCourseId,
                    },
                });
                break;
            case "recording":
                result = await prismadb_1.prismadb.classRecording.create({
                    data: {
                        ...data,
                        classroomTopicId: topicId || null,
                        cohortCourseId: targetCohortCourseId,
                    },
                });
                break;
            case "liveClass":
                // @ts-ignore - Prisma might be generating locally
                result = await prismadb_1.prismadb.liveClass.create({
                    data: {
                        ...data,
                        classroomTopicId: topicId || null,
                        cohortCourseId: targetCohortCourseId,
                    },
                });
                // Trigger notification asynchronously
                (0, liveClassNotifications_1.notifyCohortMembers)(result.id, "creation").catch((err) => console.error("Failed to send creation notification:", err));
                break;
            default:
                return res.status(400).json({ error: "Invalid item type" });
        }
        // Send Notification to all students in the cohort
        try {
            const students = await prismadb_1.prismadb.userCohort.findMany({
                where: { cohortId: cohortId, isActive: true },
                include: { user: { select: { email: true } } },
            });
            const emails = students
                .map((s) => s.user.email)
                .filter(Boolean);
            const user = req.user;
            if (emails.length > 0) {
                await (0, mail_1.sendClassroomNotificationEmail)(emails, cohortName, type, data.title, data.description || data.instructions || "", user?.name || "Instructor");
            }
        }
        catch (notifError) {
            console.error("Failed to send classroom notification:", notifError);
        }
        res.json({ item: result });
    }
    catch (error) {
        console.error("Add sub item error:", error);
        res.status(500).json({ error: "Failed to add item" });
    }
};
exports.addSubItem = addSubItem;
// New function to get stream posts
const getStreamPosts = async (req, res) => {
    try {
        const { cohortId } = req.params;
        const posts = await prismadb_1.prismadb.streamPost.findMany({
            where: {
                cohortCourse: {
                    cohortId: cohortId,
                },
            },
            include: {
                author: true,
                comments: {
                    include: {
                        author: true,
                    },
                    orderBy: { createdAt: "asc" },
                },
            },
            orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        });
        res.json({ posts });
    }
    catch (error) {
        console.error("Stream posts error:", error);
        res.status(500).json({ error: "Failed to fetch stream posts" });
    }
};
exports.getStreamPosts = getStreamPosts;
// New function to create stream post
const createStreamPost = async (req, res) => {
    try {
        const { cohortId } = req.params;
        const { title, content } = req.body;
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        // Find the cohort course for this cohort
        const cohortCourse = await prismadb_1.prismadb.cohortCourse.findFirst({
            where: { cohortId: cohortId },
            include: { cohort: true },
        });
        if (!cohortCourse) {
            return res.status(404).json({ error: "Cohort course not found" });
        }
        const post = await prismadb_1.prismadb.streamPost.create({
            data: {
                title,
                content,
                authorId: user.id,
                cohortCourseId: cohortCourse.id,
            },
            include: {
                author: true,
                comments: true,
            },
        });
        // Send Notification to all students in the cohort
        try {
            const students = await prismadb_1.prismadb.userCohort.findMany({
                where: { cohortId: cohortId, isActive: true },
                include: { user: { select: { email: true } } },
            });
            const emails = students
                .map((s) => s.user.email)
                .filter(Boolean);
            if (emails.length > 0) {
                await (0, mail_1.sendClassroomNotificationEmail)(emails, cohortCourse.cohort.name, "announcement", title, content, post.author.name || "Instructor");
            }
        }
        catch (notifError) {
            console.error("[STREAM_POST] Failed to send notification:", notifError);
        }
        res.json({ post });
    }
    catch (error) {
        console.error("Create stream post error:", error);
        res.status(500).json({
            error: "Failed to create post",
            details: error instanceof Error ? error.message : String(error),
        });
    }
};
exports.createStreamPost = createStreamPost;
const getStreamActivities = async (req, res) => {
    try {
        const { cohortId } = req.params;
        // Get all activities from different sources and combine them
        const [topics, assignments, materials, recordings, announcements, streamPosts, liveClasses,] = await Promise.all([
            // Topics
            prismadb_1.prismadb.classroomTopic.findMany({
                where: {
                    cohortCourse: {
                        cohortId: cohortId,
                    },
                },
                include: {
                    cohortCourse: {
                        include: {
                            cohort: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            }),
            // Assignments - only those that still exist
            prismadb_1.prismadb.assignment.findMany({
                where: {
                    cohortCourse: {
                        cohortId: cohortId,
                    },
                },
                include: {
                    cohortCourse: {
                        include: {
                            cohort: true,
                        },
                    },
                    classroomTopic: true, // Include topic info if it exists
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            }),
            // Materials - only those that still exist
            prismadb_1.prismadb.classMaterial.findMany({
                where: {
                    cohortCourse: {
                        cohortId: cohortId,
                    },
                },
                include: {
                    cohortCourse: {
                        include: {
                            cohort: true,
                        },
                    },
                    classroomTopic: true, // Include topic info if it exists
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            }),
            // Recordings - only those that still exist
            prismadb_1.prismadb.classRecording.findMany({
                where: {
                    cohortCourse: {
                        cohortId: cohortId,
                    },
                },
                include: {
                    cohortCourse: {
                        include: {
                            cohort: true,
                        },
                    },
                    classroomTopic: true, // Include topic info if it exists
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            }),
            // Announcements
            prismadb_1.prismadb.announcement.findMany({
                where: {
                    cohortCourse: {
                        cohortId: cohortId,
                    },
                },
                include: {
                    author: true,
                    cohortCourse: {
                        include: {
                            cohort: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            }),
            // Stream Posts
            prismadb_1.prismadb.streamPost.findMany({
                where: {
                    cohortCourse: {
                        cohortId: cohortId,
                    },
                },
                include: {
                    author: true,
                    cohortCourse: {
                        include: {
                            cohort: true,
                        },
                    },
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            }),
            // Live Classes
            prismadb_1.prismadb.liveClass.findMany({
                where: {
                    cohortCourse: {
                        cohortId: cohortId,
                    },
                },
                include: {
                    cohortCourse: {
                        include: {
                            cohort: true,
                        },
                    },
                    classroomTopic: true,
                },
                orderBy: { createdAt: "desc" },
                take: 50,
            }),
        ]);
        // Combine all activities into one stream
        const activities = [
            ...topics.map((topic) => ({
                id: `topic-${topic.id}`,
                type: "topic",
                title: topic.title,
                description: topic.description,
                author: { id: "system", name: "Instructor" },
                createdAt: topic.createdAt.toISOString(),
                metadata: {
                    topicId: topic.id,
                },
            })),
            ...assignments.map((assignment) => ({
                id: `assignment-${assignment.id}`,
                type: "assignment",
                title: assignment.title,
                description: assignment.description || assignment.instructions,
                author: { id: "system", name: "Instructor" },
                createdAt: assignment.createdAt.toISOString(),
                metadata: {
                    assignmentId: assignment.slug || assignment.id,
                    dueDate: assignment.dueDate?.toISOString(),
                    points: assignment.points,
                    topicTitle: assignment.classroomTopic?.title, // Include topic if exists
                },
            })),
            ...materials.map((material) => ({
                id: `material-${material.id}`,
                type: "material",
                title: material.title,
                description: material.description,
                author: { id: "system", name: "Instructor" },
                createdAt: material.createdAt.toISOString(),
                metadata: {
                    materialId: material.id,
                    fileUrl: material.fileUrl,
                    imageUrl: material.imageUrl,
                    topicTitle: material.classroomTopic?.title, // Include topic if exists
                },
            })),
            ...recordings.map((recording) => ({
                id: `recording-${recording.id}`,
                type: "recording",
                title: recording.title,
                description: recording.description,
                author: { id: "system", name: "Instructor" },
                createdAt: recording.createdAt.toISOString(),
                metadata: {
                    recordingId: recording.id,
                    recordingUrl: recording.recordingUrl,
                    topicTitle: recording.classroomTopic?.title, // Include topic if exists
                },
            })),
            ...announcements.map((announcement) => ({
                id: `announcement-${announcement.id}`,
                type: "announcement",
                title: announcement.title,
                description: announcement.content,
                author: {
                    id: announcement.author.id,
                    name: announcement.author.name,
                    image: announcement.author.image,
                },
                createdAt: announcement.createdAt.toISOString(),
                metadata: {
                    announcementId: announcement.id,
                },
            })),
            ...streamPosts.map((post) => ({
                id: `post-${post.id}`,
                type: "announcement",
                title: post.title,
                description: post.content,
                author: {
                    id: post.author.id,
                    name: post.author.name,
                    image: post.author.image,
                },
                createdAt: post.createdAt.toISOString(),
                metadata: {
                    postId: post.id,
                },
            })),
            ...liveClasses.map((live) => ({
                id: `live-${live.id}`,
                type: "live",
                title: live.title,
                description: live.description || "Join our live session!",
                author: { id: "system", name: "Instructor" },
                createdAt: live.createdAt.toISOString(),
                metadata: {
                    liveClassId: live.id,
                    startTime: live.startTime.toISOString(),
                    endTime: live.endTime.toISOString(),
                    liveLink: live.liveLink,
                    topicTitle: live.classroomTopic?.title,
                },
            })),
        ];
        // Sort all activities by creation date (newest first)
        activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        res.json({ activities });
    }
    catch (error) {
        console.error("Stream activities error:", error);
        res.status(500).json({ error: "Failed to fetch stream activities" });
    }
};
exports.getStreamActivities = getStreamActivities;
const deleteAssignment = async (req, res) => {
    try {
        const { assignmentId } = req.params;
        // Check if assignment exists
        const assignment = await prismadb_1.prismadb.assignment.findUnique({
            where: { id: assignmentId },
            include: {
                submissions: {
                    select: { id: true },
                },
                assignmentQuizQuestions: {
                    select: { id: true },
                },
            },
        });
        if (!assignment) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        // Delete the assignment (cascade will handle related records)
        await prismadb_1.prismadb.assignment.delete({
            where: { id: assignmentId },
        });
        res.json({
            message: "Assignment deleted successfully",
            deletedAssignment: {
                id: assignment.id,
                title: assignment.title,
                submissionsCount: assignment.submissions.length,
                quizQuestionsCount: assignment.assignmentQuizQuestions.length,
            },
        });
    }
    catch (error) {
        console.error("Delete assignment error:", error);
        res.status(500).json({ error: "Failed to delete assignment" });
    }
};
exports.deleteAssignment = deleteAssignment;
const deleteMaterial = async (req, res) => {
    try {
        const { materialId } = req.params;
        // Check if material exists
        const material = await prismadb_1.prismadb.classMaterial.findUnique({
            where: { id: materialId },
        });
        if (!material) {
            return res.status(404).json({ error: "Material not found" });
        }
        // Delete the material
        await prismadb_1.prismadb.classMaterial.delete({
            where: { id: materialId },
        });
        res.json({
            message: "Material deleted successfully",
            deletedMaterial: {
                id: material.id,
                title: material.title,
            },
        });
    }
    catch (error) {
        console.error("Delete material error:", error);
        res.status(500).json({ error: "Failed to delete material" });
    }
};
exports.deleteMaterial = deleteMaterial;
const deleteRecording = async (req, res) => {
    try {
        const { recordingId } = req.params;
        // Check if recording exists
        const recording = await prismadb_1.prismadb.classRecording.findUnique({
            where: { id: recordingId },
        });
        if (!recording) {
            return res.status(404).json({ error: "Recording not found" });
        }
        // Delete the recording
        await prismadb_1.prismadb.classRecording.delete({
            where: { id: recordingId },
        });
        res.json({
            message: "Recording deleted successfully",
            deletedRecording: {
                id: recording.id,
                title: recording.title,
            },
        });
    }
    catch (error) {
        console.error("Delete recording error:", error);
        res.status(500).json({ error: "Failed to delete recording" });
    }
};
exports.deleteRecording = deleteRecording;
const deleteLiveClass = async (req, res) => {
    try {
        const { liveClassId } = req.params;
        const { reason } = req.body; // optional cancellation reason from instructor
        const liveClass = await prismadb_1.prismadb.liveClass.findUnique({
            where: { id: liveClassId },
            include: {
                cohortCourse: {
                    include: { cohort: true },
                },
            },
        });
        if (!liveClass) {
            return res.status(404).json({ error: "Live class not found" });
        }
        // Notify all cohort members of the cancellation BEFORE deleting
        (0, liveClassNotifications_1.notifyCohortMembersOfCancellation)(liveClass, reason).catch((err) => console.error("[LIVE_DELETE] Failed to send cancellation emails:", err));
        await prismadb_1.prismadb.liveClass.delete({
            where: { id: liveClassId },
        });
        res.json({
            message: "Live class deleted and students notified",
            deletedLiveClass: {
                id: liveClass.id,
                title: liveClass.title,
            },
        });
    }
    catch (error) {
        console.error("Delete live class error:", error);
        res.status(500).json({ error: "Failed to delete live class" });
    }
};
exports.deleteLiveClass = deleteLiveClass;
const joinLiveClass = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;
        if (!user) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        // Record attendance
        await prismadb_1.prismadb.liveClassAttendance.upsert({
            where: {
                liveClassId_userId: {
                    liveClassId: id,
                    userId: user.id,
                },
            },
            update: { joinedAt: new Date() },
            create: {
                liveClassId: id,
                userId: user.id,
            },
        });
        // Get live class link for redirection
        const liveClass = await prismadb_1.prismadb.liveClass.findUnique({
            where: { id },
        });
        if (!liveClass) {
            return res.status(404).json({ error: "Live class not found" });
        }
        res.json({ liveLink: liveClass.liveLink });
    }
    catch (error) {
        console.error("Join live class error:", error);
        res.status(500).json({ error: "Failed to join live class" });
    }
};
exports.joinLiveClass = joinLiveClass;
const getLiveClassAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        const attendance = await prismadb_1.prismadb.liveClassAttendance.findMany({
            where: { liveClassId: id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        image: true,
                    },
                },
            },
            orderBy: { joinedAt: "desc" },
        });
        const liveClass = await prismadb_1.prismadb.liveClass.findUnique({
            where: { id },
            select: { title: true, startTime: true },
        });
        res.json({ attendance, liveClass });
    }
    catch (error) {
        console.error("Get attendance error:", error);
        res.status(500).json({ error: "Failed to fetch attendance" });
    }
};
exports.getLiveClassAttendance = getLiveClassAttendance;
const getCohortLiveClasses = async (req, res) => {
    try {
        const { cohortId } = req.params;
        const liveClasses = await prismadb_1.prismadb.liveClass.findMany({
            where: {
                cohortCourse: {
                    cohortId: cohortId,
                },
            },
            include: {
                _count: {
                    select: { attendance: true },
                },
            },
            orderBy: { startTime: "desc" },
        });
        res.json({ liveClasses });
    }
    catch (error) {
        console.error("Get cohort live classes error:", error);
        res.status(500).json({ error: "Failed to fetch live classes" });
    }
};
exports.getCohortLiveClasses = getCohortLiveClasses;
//# sourceMappingURL=index.js.map