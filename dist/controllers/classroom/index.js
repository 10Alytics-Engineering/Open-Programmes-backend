"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRecording = exports.deleteMaterial = exports.deleteAssignment = exports.getStreamActivities = exports.createStreamPost = exports.getStreamPosts = exports.addSubItem = exports.deleteTopic = exports.updateTopic = exports.createTopic = exports.getClassroomTopics = exports.getClassroomData = void 0;
const index_1 = require("../../index");
const getClassroomData = async (req, res) => {
    try {
        const { cohortId } = req.params;
        const cohort = await index_1.prismadb.cohort.findUnique({
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
        const topics = await index_1.prismadb.classroomTopic.findMany({
            where: {
                cohortCourse: {
                    cohortId: cohortId,
                },
            },
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
            },
            orderBy: [{ isPinned: "desc" }, { order: "asc" }, { createdAt: "desc" }],
        });
        res.json({ topics });
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
        const cohortCourse = await index_1.prismadb.cohortCourse.findFirst({
            where: { id: cohortCourseId },
        });
        if (!cohortCourse) {
            return res.status(404).json({ error: "Cohort course not found" });
        }
        // Get the highest order number
        const highestOrderTopic = await index_1.prismadb.classroomTopic.findFirst({
            where: { cohortCourseId },
            orderBy: { order: "desc" },
        });
        const topic = await index_1.prismadb.classroomTopic.create({
            data: {
                title,
                description,
                isPinned: isPinned || false,
                order: (highestOrderTopic?.order || 0) + 1,
                cohortCourseId,
            },
        });
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
        const topic = await index_1.prismadb.classroomTopic.update({
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
        const topic = await index_1.prismadb.classroomTopic.findUnique({
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
        await index_1.prismadb.classroomTopic.delete({
            where: { id: topicId },
        });
        res.json({
            message: "Topic and all related items deleted successfully",
            deletedItems: {
                topic: topic.title,
                assignmentsCount: topic.assignments.length,
                materialsCount: topic.classMaterials.length,
                recordingsCount: topic.classRecordings.length,
            }
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
        const { topicId, type, data } = req.body;
        const topic = await index_1.prismadb.classroomTopic.findUnique({
            where: { id: topicId },
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
            return res
                .status(400)
                .json({ error: "Topic is not associated with a valid cohort course" });
        }
        let result;
        switch (type) {
            case "assignment":
                result = await index_1.prismadb.assignment.create({
                    data: {
                        ...data,
                        classroomTopicId: topicId,
                        cohortCourseId: topic.cohortCourseId,
                    },
                });
                break;
            case "material":
                result = await index_1.prismadb.classMaterial.create({
                    data: {
                        ...data,
                        classroomTopicId: topicId,
                        cohortCourseId: topic.cohortCourseId,
                    },
                });
                break;
            case "recording":
                result = await index_1.prismadb.classRecording.create({
                    data: {
                        ...data,
                        classroomTopicId: topicId,
                        cohortCourseId: topic.cohortCourseId,
                    },
                });
                break;
            default:
                return res.status(400).json({ error: "Invalid item type" });
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
        const posts = await index_1.prismadb.streamPost.findMany({
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
        const { title, content, authorId } = req.body;
        // Find the cohort course for this cohort
        const cohortCourse = await index_1.prismadb.cohortCourse.findFirst({
            where: { cohortId: cohortId },
        });
        if (!cohortCourse) {
            return res.status(404).json({ error: "Cohort course not found" });
        }
        const post = await index_1.prismadb.streamPost.create({
            data: {
                title,
                content,
                authorId,
                cohortCourseId: cohortCourse.id,
            },
            include: {
                author: true,
                comments: true,
            },
        });
        res.json({ post });
    }
    catch (error) {
        console.error("Create stream post error:", error);
        res.status(500).json({ error: "Failed to create post" });
    }
};
exports.createStreamPost = createStreamPost;
const getStreamActivities = async (req, res) => {
    try {
        const { cohortId } = req.params;
        // Get all activities from different sources and combine them
        const [topics, assignments, materials, recordings, announcements, streamPosts] = await Promise.all([
            // Topics
            index_1.prismadb.classroomTopic.findMany({
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
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
            // Assignments - only those that still exist
            index_1.prismadb.assignment.findMany({
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
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
            // Materials - only those that still exist
            index_1.prismadb.classMaterial.findMany({
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
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
            // Recordings - only those that still exist
            index_1.prismadb.classRecording.findMany({
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
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
            // Announcements
            index_1.prismadb.announcement.findMany({
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
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
            // Stream Posts
            index_1.prismadb.streamPost.findMany({
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
                orderBy: { createdAt: 'desc' },
                take: 50,
            }),
        ]);
        // Combine all activities into one stream
        const activities = [
            ...topics.map(topic => ({
                id: `topic-${topic.id}`,
                type: 'topic',
                title: topic.title,
                description: topic.description,
                author: { id: 'system', name: 'Instructor' },
                createdAt: topic.createdAt.toISOString(),
                metadata: {
                    topicId: topic.id,
                },
            })),
            ...assignments.map(assignment => ({
                id: `assignment-${assignment.id}`,
                type: 'assignment',
                title: assignment.title,
                description: assignment.description || assignment.instructions,
                author: { id: 'system', name: 'Instructor' },
                createdAt: assignment.createdAt.toISOString(),
                metadata: {
                    assignmentId: assignment.id,
                    dueDate: assignment.dueDate?.toISOString(),
                    points: assignment.points,
                    topicTitle: assignment.classroomTopic?.title, // Include topic if exists
                },
            })),
            ...materials.map(material => ({
                id: `material-${material.id}`,
                type: 'material',
                title: material.title,
                description: material.description,
                author: { id: 'system', name: 'Instructor' },
                createdAt: material.createdAt.toISOString(),
                metadata: {
                    materialId: material.id,
                    fileUrl: material.fileUrl,
                    topicTitle: material.classroomTopic?.title, // Include topic if exists
                },
            })),
            ...recordings.map(recording => ({
                id: `recording-${recording.id}`,
                type: 'recording',
                title: recording.title,
                description: recording.description,
                author: { id: 'system', name: 'Instructor' },
                createdAt: recording.createdAt.toISOString(),
                metadata: {
                    recordingId: recording.id,
                    recordingUrl: recording.recordingUrl,
                    topicTitle: recording.classroomTopic?.title, // Include topic if exists
                },
            })),
            ...announcements.map(announcement => ({
                id: `announcement-${announcement.id}`,
                type: 'announcement',
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
            ...streamPosts.map(post => ({
                id: `post-${post.id}`,
                type: 'announcement',
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
        const assignment = await index_1.prismadb.assignment.findUnique({
            where: { id: assignmentId },
            include: {
                submissions: {
                    select: { id: true }
                },
                assignmentQuizQuestions: {
                    select: { id: true }
                }
            }
        });
        if (!assignment) {
            return res.status(404).json({ error: "Assignment not found" });
        }
        // Delete the assignment (cascade will handle related records)
        await index_1.prismadb.assignment.delete({
            where: { id: assignmentId }
        });
        res.json({
            message: "Assignment deleted successfully",
            deletedAssignment: {
                id: assignment.id,
                title: assignment.title,
                submissionsCount: assignment.submissions.length,
                quizQuestionsCount: assignment.assignmentQuizQuestions.length
            }
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
        const material = await index_1.prismadb.classMaterial.findUnique({
            where: { id: materialId }
        });
        if (!material) {
            return res.status(404).json({ error: "Material not found" });
        }
        // Delete the material
        await index_1.prismadb.classMaterial.delete({
            where: { id: materialId }
        });
        res.json({
            message: "Material deleted successfully",
            deletedMaterial: {
                id: material.id,
                title: material.title
            }
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
        const recording = await index_1.prismadb.classRecording.findUnique({
            where: { id: recordingId }
        });
        if (!recording) {
            return res.status(404).json({ error: "Recording not found" });
        }
        // Delete the recording
        await index_1.prismadb.classRecording.delete({
            where: { id: recordingId }
        });
        res.json({
            message: "Recording deleted successfully",
            deletedRecording: {
                id: recording.id,
                title: recording.title
            }
        });
    }
    catch (error) {
        console.error("Delete recording error:", error);
        res.status(500).json({ error: "Failed to delete recording" });
    }
};
exports.deleteRecording = deleteRecording;
//# sourceMappingURL=index.js.map