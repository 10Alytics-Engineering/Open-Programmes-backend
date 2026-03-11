import { Request, Response } from "express";
import { prismadb } from "../../index";
import { sendClassroomNotificationEmail } from "../authentication/mail";
import { NebiantUser } from "../../middleware";

export const getClassroomData = async (req: Request, res: Response) => {
  try {
    const { cohortId } = req.params;

    const cohort = await prismadb.cohort.findUnique({
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
  } catch (error) {
    console.error("Classroom data error:", error);
    res.status(500).json({ error: "Failed to fetch classroom data" });
  }
};

export const getClassroomTopics = async (req: Request, res: Response) => {
  try {
    const { cohortId } = req.params;

    const topics = await prismadb.classroomTopic.findMany({
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
  } catch (error) {
    console.error("Topics error:", error);
    res.status(500).json({ error: "Failed to fetch topics" });
  }
};

export const createTopic = async (req: Request, res: Response) => {
  try {
    const { cohortCourseId, title, description, isPinned } = req.body;

    // First, find the cohort course to ensure it exists
    const cohortCourse = await prismadb.cohortCourse.findFirst({
      where: { id: cohortCourseId },
    });

    if (!cohortCourse) {
      return res.status(404).json({ error: "Cohort course not found" });
    }

    // Get the highest order number
    const highestOrderTopic = await prismadb.classroomTopic.findFirst({
      where: { cohortCourseId },
      orderBy: { order: "desc" },
    });

    const topic = await prismadb.classroomTopic.create({
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
            cohort: true
          }
        }
      }
    });

    // Send Notification to all students in the cohort
    try {
      const students = await prismadb.userCohort.findMany({
        where: { cohortId: topic.cohortCourse.cohortId, isActive: true },
        include: { user: { select: { email: true } } }
      });

      const emails = students.map(s => s.user.email).filter(Boolean) as string[];
      const currentUser = req.user as NebiantUser;

      if (emails.length > 0) {
        await sendClassroomNotificationEmail(
          emails,
          topic.cohortCourse.cohort.name,
          "topic",
          title,
          description || "",
          currentUser?.name || "Instructor"
        );
      }
    } catch (notifError) {
      console.error("Failed to send topic notification:", notifError);
    }

    res.json({ topic });
  } catch (error) {
    console.error("Create topic error:", error);
    res.status(500).json({ error: "Failed to create topic" });
  }
};

export const updateTopic = async (req: Request, res: Response) => {
  try {
    const { topicId } = req.params;
    const { title, description, isPinned, order } = req.body;

    const topic = await prismadb.classroomTopic.update({
      where: { id: topicId },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(isPinned !== undefined && { isPinned }),
        ...(order && { order }),
      },
    });

    res.json({ topic });
  } catch (error) {
    console.error("Update topic error:", error);
    res.status(500).json({ error: "Failed to update topic" });
  }
};

export const deleteTopic = async (req: Request, res: Response) => {
  try {
    const { topicId } = req.params;

    // First, verify the topic exists and get its related items for logging
    const topic = await prismadb.classroomTopic.findUnique({
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
    await prismadb.classroomTopic.delete({
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
  } catch (error) {
    console.error("Delete topic error:", error);
    res.status(500).json({ error: "Failed to delete topic" });
  }
};

export const addSubItem = async (req: Request, res: Response) => {
  try {
    const { topicId, type, data } = req.body;

    const topic = await prismadb.classroomTopic.findUnique({
      where: { id: topicId },
      select: {
        id: true,
        cohortCourseId: true,
        cohortCourse: {
          select: {
            id: true,
            cohortId: true,
            cohort: {
              select: {
                name: true
              }
            }
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
        result = await prismadb.assignment.create({
          data: {
            ...data,
            classroomTopicId: topicId,
            cohortCourseId: topic.cohortCourseId,
          },
        });
        break;
      case "material":
        result = await prismadb.classMaterial.create({
          data: {
            ...data,
            classroomTopicId: topicId,
            cohortCourseId: topic.cohortCourseId,
          },
        });
        break;
      case "recording":
        result = await prismadb.classRecording.create({
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

    // Send Notification to all students in the cohort
    try {
      const students = await prismadb.userCohort.findMany({
        where: { cohortId: topic.cohortCourse.cohortId, isActive: true },
        include: { user: { select: { email: true } } }
      });

      const emails = students.map(s => s.user.email).filter(Boolean) as string[];
      const user = req.user as NebiantUser;

      if (emails.length > 0) {
        await sendClassroomNotificationEmail(
          emails,
          topic.cohortCourse.cohort.name,
          type,
          data.title,
          data.description || data.instructions || "",
          user?.name || "Instructor"
        );
      }
    } catch (notifError) {
      console.error("Failed to send classroom notification:", notifError);
    }

    res.json({ item: result });
  } catch (error) {
    console.error("Add sub item error:", error);
    res.status(500).json({ error: "Failed to add item" });
  }
};

// New function to get stream posts
export const getStreamPosts = async (req: Request, res: Response) => {
  try {
    const { cohortId } = req.params;

    const posts = await prismadb.streamPost.findMany({
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
  } catch (error) {
    console.error("Stream posts error:", error);
    res.status(500).json({ error: "Failed to fetch stream posts" });
  }
};

// New function to create stream post
export const createStreamPost = async (req: Request, res: Response) => {
  try {
    const { cohortId } = req.params;
    const { title, content, authorId } = req.body;

    // Find the cohort course for this cohort
    const cohortCourse = await prismadb.cohortCourse.findFirst({
      where: { cohortId: cohortId },
      include: { cohort: true }
    });

    if (!cohortCourse) {
      return res.status(404).json({ error: "Cohort course not found" });
    }

    const post = await prismadb.streamPost.create({
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

    // Send Notification to all students in the cohort
    try {
      const students = await prismadb.userCohort.findMany({
        where: { cohortId: cohortId, isActive: true },
        include: { user: { select: { email: true } } }
      });

      const emails = students.map(s => s.user.email).filter(Boolean) as string[];

      if (emails.length > 0) {
        await sendClassroomNotificationEmail(
          emails,
          cohortCourse.cohort.name,
          "announcement",
          title,
          content,
          post.author.name || "Instructor"
        );
      }
    } catch (notifError) {
      console.error("Failed to send stream post notification:", notifError);
    }

    res.json({ post });
  } catch (error) {
    console.error("Create stream post error:", error);
    res.status(500).json({ error: "Failed to create post" });
  }
};

export const getStreamActivities = async (req: Request, res: Response) => {
  try {
    const { cohortId } = req.params;

    // Get all activities from different sources and combine them
    const [
      topics,
      assignments,
      materials,
      recordings,
      announcements,
      streamPosts
    ] = await Promise.all([
      // Topics
      prismadb.classroomTopic.findMany({
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
      prismadb.assignment.findMany({
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
      prismadb.classMaterial.findMany({
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
      prismadb.classRecording.findMany({
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
      prismadb.announcement.findMany({
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
      prismadb.streamPost.findMany({
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
        type: 'topic' as const,
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
        type: 'assignment' as const,
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
        type: 'material' as const,
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
        type: 'recording' as const,
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
        type: 'announcement' as const,
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
        type: 'announcement' as const,
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
  } catch (error) {
    console.error("Stream activities error:", error);
    res.status(500).json({ error: "Failed to fetch stream activities" });
  }
};

export const deleteAssignment = async (req: Request, res: Response) => {
  try {
    const { assignmentId } = req.params;

    // Check if assignment exists
    const assignment = await prismadb.assignment.findUnique({
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
    await prismadb.assignment.delete({
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
  } catch (error) {
    console.error("Delete assignment error:", error);
    res.status(500).json({ error: "Failed to delete assignment" });
  }
};

export const deleteMaterial = async (req: Request, res: Response) => {
  try {
    const { materialId } = req.params;

    // Check if material exists
    const material = await prismadb.classMaterial.findUnique({
      where: { id: materialId }
    });

    if (!material) {
      return res.status(404).json({ error: "Material not found" });
    }

    // Delete the material
    await prismadb.classMaterial.delete({
      where: { id: materialId }
    });

    res.json({
      message: "Material deleted successfully",
      deletedMaterial: {
        id: material.id,
        title: material.title
      }
    });
  } catch (error) {
    console.error("Delete material error:", error);
    res.status(500).json({ error: "Failed to delete material" });
  }
};

export const deleteRecording = async (req: Request, res: Response) => {
  try {
    const { recordingId } = req.params;

    // Check if recording exists
    const recording = await prismadb.classRecording.findUnique({
      where: { id: recordingId }
    });

    if (!recording) {
      return res.status(404).json({ error: "Recording not found" });
    }

    // Delete the recording
    await prismadb.classRecording.delete({
      where: { id: recordingId }
    });

    res.json({
      message: "Recording deleted successfully",
      deletedRecording: {
        id: recording.id,
        title: recording.title
      }
    });
  } catch (error) {
    console.error("Delete recording error:", error);
    res.status(500).json({ error: "Failed to delete recording" });
  }
};