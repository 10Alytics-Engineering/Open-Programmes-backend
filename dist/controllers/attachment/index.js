"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAttachment = exports.createAttachment = void 0;
const index_1 = require("../../index");
const handleServerError = (error, res) => {
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
const createAttachment = async (req, res) => {
    try {
        const { name, url } = req.body;
        const { courseId, weekId } = req.params;
        if (!courseId) {
            return res.status(400).json({ message: "CourseId is required" });
        }
        if (!weekId) {
            return res.status(400).json({ message: "WeekId is required" });
        }
        const existingCourseWeek = await index_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        const attachment = await index_1.prismadb.attachment.create({
            data: {
                name,
                url,
                courseWeekId: weekId,
            },
        });
        return res
            .status(201)
            .json({ status: "Course week created", message: null, data: attachment });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.createAttachment = createAttachment;
const deleteAttachment = async (req, res) => {
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
        const existingCourseWeek = await index_1.prismadb.courseWeek.findUnique({
            where: {
                id: weekId,
            },
        });
        if (!existingCourseWeek) {
            return res.status(404).json({ message: "Course week does not exist" });
        }
        await index_1.prismadb.attachment.delete({
            where: {
                id: attachmentId,
                courseWeekId: weekId,
            },
        });
        return res.status(200).json({ status: "Attachment deleted" });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteAttachment = deleteAttachment;
//# sourceMappingURL=index.js.map