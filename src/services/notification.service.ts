import { NotificationType, PrismaClient } from "@prisma/client";

const prismadb = new PrismaClient();

type NotificationPayload = {
  courseId?: string;
  courseTitle?: string;
  previousCourseId?: String;
  previousCourseTitle?: String;

  cohortId?: string;
  cohortName?: string;
  previousCohortId?: string;
  previousCohortName?: string;

  videoId?: string;
  videoTitle?: string;

  weekId?: string;
  weekName?: string;

  moduleId?: string;
  moduleTitle?: string;

  quizId?: string;
  quizTitle?: string;

  topicId?: string;
  topicTitle?: string;

  materialId?: string;
  materialTitle?: string;

  recordingId?: string;
  recordingTitle?: string;

  assignmentId?: string;
  assignmentTitle?: string;
  assignmentScore?: number;
  assignmentMaxScore?: number;

  liveClassId?: string;
  liveClassTitle?: string;

  reason?: string;
  actionUrl?: string;

  paymentStatusId?: string | null;
  paymentTransactionId?: string | null;
};

type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  payload?: NotificationPayload;
  relatedUserId?: string;
};

const buildCourseContext = (payload: NotificationPayload) => {
  const parts = [];

  if (payload.courseTitle) parts.push(`Course: ${payload.courseTitle}`);
  if (payload.cohortName) parts.push(`Cohort: ${payload.cohortName}`);
  if (payload.weekName) parts.push(`Week: ${payload.weekName}`);
  if (payload.moduleTitle) parts.push(`Module: ${payload.moduleTitle}`);
  if (payload.topicTitle) parts.push(`Topic: ${payload.topicTitle}`);

  return parts.length ? ` (${parts.join(" • ")})` : "";
};

const buildReason = (payload: NotificationPayload) => {
  return payload.reason ? ` Reason: ${payload.reason}` : "";
};

const buildNotificationContent = (
  type: NotificationType,
  payload: NotificationPayload = {},
) => {
  switch (type) {
    case "COURSE_SWITCHED":
      return {
        title: "Course switched",
        message: `Your course has been switched from ${
          payload.previousCourseTitle || "your previous course"
        } to ${payload.courseTitle || "a new course"}${
          payload.cohortName ? ` under ${payload.cohortName}` : ""
        }.${buildReason(payload)}`,
        adminOnly: false,
      };

    case "COHORT_SWITCHED":
      return {
        title: "Cohort switched",
        message: `Your cohort for ${
          payload.courseTitle || "your course"
        } has been changed from ${
          payload.previousCohortName || "your previous cohort"
        } to ${payload.cohortName || "a new cohort"}.${buildReason(payload)}`,
        adminOnly: false,
      };

    case "COURSE_ADDED":
      return {
        title: "Course added",
        message: `${payload.courseTitle || "A new course"} has been added to your account${
          payload.cohortName ? ` under ${payload.cohortName}` : ""
        }.`,
        adminOnly: false,
      };

    case "COURSE_REMOVED":
      return {
        title: "Course removed",
        message: `${payload.courseTitle || "A course"}${
          payload.cohortName ? ` under ${payload.cohortName}` : ""
        } has been removed from your account.${buildReason(payload)}`,
        adminOnly: true,
      };

    case "COURSE_LESSON_VIDEO_ADDED":
      return {
        title: "New lesson video added",
        message: `${payload.videoTitle || "A new lesson video"} has been added${buildCourseContext(
          payload,
        )}.`,
        adminOnly: true,
      };

    case "COURSE_LESSON_VIDEO_EDITED":
      return {
        title: "Lesson video updated",
        message: `${payload.videoTitle || "A lesson video has"} been updated${buildCourseContext(
          payload,
        )}.`,
        adminOnly: true,
      };

    case "COURSE_LESSON_VIDEO_REMOVED":
      return {
        title: "Lesson video removed",
        message: `${payload.videoTitle || "A lesson video has"} been removed${buildCourseContext(
          payload,
        )}.`,
        adminOnly: true,
      };

    case "COURSE_QUIZ_ADDED":
      return {
        title: "New quiz added",
        message: `A new quiz has been added${buildCourseContext(payload)}.`,
        adminOnly: true,
      };

    case "COURSE_QUIZ_EDITED":
      return {
        title: "Quiz updated",
        message: `A quiz has been updated${buildCourseContext(payload)}.`,
        adminOnly: true,
      };

    case "CLASSROOM_MATERIAL_ADDED":
      return {
        title: "New classroom material",
        message: `${payload.materialTitle || "A new material"} has been added${buildCourseContext(payload)}.`,
        adminOnly: false,
      };

    case "CLASSROOM_MATERIAL_REMOVED":
      return {
        title: "Classroom material removed",
        message: `${payload.materialTitle || "A new material"} has been removed${buildCourseContext(payload)}.`,
        adminOnly: true,
      };

    case "CLASSROOM_RECORDING_ADDED":
      return {
        title: "New class recording",
        message: `${payload.recordingTitle || "A new recording"} is now available${buildCourseContext(
          payload,
        )}.`,
        adminOnly: false,
      };

    case "CLASSROOM_RECORDING_REMOVED":
      return {
        title: "Class recording removed",
        message: `${payload.recordingTitle || "A recording"} has been removed${buildCourseContext(payload)}.`,
        adminOnly: true,
      };

    case "CLASSROOM_LIVE_CLASS_ADDED":
      return {
        title: "New live class scheduled",
        message: `A new live class has been scheduled${buildCourseContext(
          payload,
        )}.`,
        adminOnly: false,
      };

    case "CLASSROOM_TOPIC_ADDED":
      return {
        title: "New classroom topic",
        message: `A new topic has been added${buildCourseContext(payload)}.`,
        adminOnly: true,
      };

    case "CLASSROOM_TOPIC_REMOVED":
      return {
        title: "Classroom topic removed",
        message: `A topic has been removed${buildCourseContext(payload)}.`,
        adminOnly: true,
      };

    case "CLASSROOM_ASSIGNMENT_ADDED":
      return {
        title: "New assignment added",
        message: `A new assignment has been added${buildCourseContext(
          payload,
        )}.`,
        adminOnly: false,
      };

    case "CLASSROOM_ASSIGNMENT_SUBMITTED":
      return {
        title: "Assignment submitted",
        message: `${payload.assignmentTitle || "An assignment"} has been submitted successfully${buildCourseContext(
          payload,
        )}.`,
        adminOnly: false,
      };

    case "CLASSROOM_ASSIGNMENT_GRADED":
      return {
        title: "Assignment graded",
        message: `Your assignment has been graded${buildCourseContext(
          payload,
        )}${
          payload.assignmentScore !== undefined &&
          payload.assignmentMaxScore !== undefined
            ? ` Score: ${payload.assignmentScore}/${payload.assignmentMaxScore}.`
            : "."
        }`,
        adminOnly: false,
      };

    case "CLASSROOM_ASSIGNMENT_REMOVED":
      return {
        title: "Assignment removed",
        message: `An assignment has been removed${buildCourseContext(
          payload,
        )}.`,
        adminOnly: true,
      };

    case "ACCOUNT_SUSPENDED":
      return {
        title: "Account suspended",
        message: `Your account has been suspended. Please contact support for more details`,
        adminOnly: false,
      };

    case "ACCOUNT_ACTIVATED":
      return {
        title: "Account reactivated",
        message: `"Your account has been successfully reactivated. You can now resume your learning journey, access your courses, and continue where you left off. If you experience any issues, please contact support.`,
        adminOnly: false,
      };

    default:
      return {
        title: "Notification",
        message: "You have a new notification.",
        adminOnly: true,
      };
  }
};

export const NotificationService = {
  async create({
    userId,
    type,
    payload = {},
    relatedUserId,
  }: CreateNotificationInput) {
    const content = buildNotificationContent(type, payload);

    return prismadb.notification.create({
      data: {
        userId,
        type,
        title: content.title,
        message: content.message,
        details: JSON.stringify(payload),
        adminOnly: content.adminOnly,
        relatedUserId,
      },
    });
  },

  async createMany(
    userIds: string[],
    type: NotificationType,
    payload: NotificationPayload = {},
    relatedUserId?: string,
  ) {
    const content = buildNotificationContent(type, payload);

    return prismadb.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type,
        title: content.title,
        message: content.message,
        details: JSON.stringify(payload),
        adminOnly: content.adminOnly,
        relatedUserId,
      })),
      skipDuplicates: true,
    });
  },
};
