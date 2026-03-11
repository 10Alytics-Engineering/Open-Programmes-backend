import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

// export const getAttachments = async (req: Request, res: Response) => {
//   const { courseId, weekId } = req.params;

//   if (!courseId) {
//     return res.status(400).json({ message: "CourseId is required" });
//   }

//   if (!weekId) {
//     return res.status(400).json({ message: "WeekId is required" });
//   }

//   try {
//     const weekAttachments = await prismadb.attachment.findMany({
//       where: {
//         courseWeekId: weekId,
//       },
//     });

//     return res
//       .status(200)
//       .json({ status: "success", message: null, data: weekAttachments });
//   } catch (error) {
//     handleServerError(error, res);
//   }
// };

// export const getAttachment = async (req: Request, res: Response) => {
//   try {
//     const { courseId, weekId, attachmentId } = req.params;

//     if (!courseId) {
//       return res.status(400).json({ message: "CourseId is required" });
//     }

//     if (!weekId) {
//       return res.status(400).json({ message: "WeekId is required" });
//     }

//     if (!attachmentId) {
//       return res.status(400).json({ message: "AttachmentId is required" });
//     }

//     const existingCourseWeek = await prismadb.courseWeek.findUnique({
//       where: {
//         id: weekId,
//       },
//     });

//     if (!existingCourseWeek) {
//       return res.status(404).json({ message: "Course week does not exist" });
//     }

//     const weekAttachment = await prismadb.attachment.findUnique({
//       where: {
//         id: attachmentId,
//         courseWeekId: weekId,
//       },
//     });

//     return res
//       .status(200)
//       .json({ status: "success", message: null, data: weekAttachment });
//   } catch (error) {
//     handleServerError(error, res);
//   }
// };

export const createAttachment = async (req: Request, res: Response) => {
  try {
    const { name, url }: { name: string; url: string } = req.body;
    const { courseId, weekId  } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    const existingCourseWeek = await prismadb.courseWeek.findUnique({
      where: {
        id: weekId,
      },
    });

    if (!existingCourseWeek) {
      return res.status(404).json({ message: "Course week does not exist" });
    }

    const attachment = await prismadb.attachment.create({
      data: {
        name,
        url,
        courseWeekId: weekId,
      },
    });

    return res
      .status(201)
      .json({ status: "Course week created", message: null, data: attachment });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const deleteAttachment = async (req: Request, res: Response) => {
  try {
    const { courseId, weekId, attachmentId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "CourseId is required" });
    }

    if (!weekId) {
      return res.status(400).json({ message: "WeekId is required" });
    }

    if (!attachmentId) {
      return res.status(400).json({ message: "AttachmentId is required" });
    }

    const existingCourseWeek = await prismadb.courseWeek.findUnique({
      where: {
        id: weekId,
      },
    });

    if (!existingCourseWeek) {
      return res.status(404).json({ message: "Course week does not exist" });
    }

    await prismadb.attachment.delete({
      where: {
        id: attachmentId,
        courseWeekId: weekId,
      },
    });

    return res.status(200).json({ status: "Attachment deleted" });
  } catch (error) {
    handleServerError(error, res);
  }
};
