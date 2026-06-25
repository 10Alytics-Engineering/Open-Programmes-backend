"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerForFreeCourseAccessFromMarketing = exports.exportFreeCourseApplicantsPDF = exports.getFreeCourseApplicants = exports.applyForCourse = void 0;
const prismadb_1 = require("../../lib/prismadb");
const pdfkit_1 = __importDefault(require("pdfkit"));
const free_course_registration_1 = require("../../mails/free-course-registration");
const googleSheets_1 = require("../../utils/googleSheets");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const applyForCourse = async (req, res) => {
    const { name, email, phone } = req.body;
    if (!name || !email || !phone) {
        return res.status(400).json({ message: "Fill in details" });
    }
    try {
        await prismadb_1.prismadb.freeCourseApplication.create({
            data: {
                name,
                email,
                phone,
            },
        });
        return res.status(200).json({
            status: "success",
            message: null,
            data: "Application sent successfully",
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.applyForCourse = applyForCourse;
const getFreeCourseApplicants = async (req, res) => {
    try {
        const freeCourseApplicants = await prismadb_1.prismadb.freeCourseApplication.findMany();
        res
            .status(200)
            .json({ status: "success", message: null, data: freeCourseApplicants });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getFreeCourseApplicants = getFreeCourseApplicants;
const exportFreeCourseApplicantsPDF = async (req, res) => {
    try {
        const freeCourseApplicants = await prismadb_1.prismadb.freeCourseApplication.findMany();
        // Create a new PDF document
        const doc = new pdfkit_1.default();
        // Set response headers for PDF download
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=course-applicants.pdf");
        // Pipe the PDF document to the response
        doc.pipe(res);
        // Add title
        doc
            .fontSize(20)
            .text("Free Course Applicants", { align: "center" })
            .moveDown(2);
        // Add current date
        doc
            .fontSize(12)
            .text(`Generated on: ${new Date().toLocaleDateString()}`, {
            align: "right",
        })
            .moveDown(2);
        // Add table headers
        const tableTop = 150;
        doc
            .fontSize(14)
            .text("Name", 50, tableTop)
            .text("Email", 200, tableTop)
            .text("Phone", 350, tableTop)
            .moveDown();
        // Add horizontal line
        doc
            .moveTo(50, tableTop + 20)
            .lineTo(550, tableTop + 20)
            .stroke();
        // Add applicant data
        let yPosition = tableTop + 40;
        freeCourseApplicants.forEach((applicant) => {
            doc
                .fontSize(12)
                .text(applicant.name, 50, yPosition)
                .text(applicant.email, 200, yPosition)
                .text(applicant.phone, 350, yPosition);
            yPosition += 30;
            // Add new page if we're near the bottom
            if (yPosition > 700) {
                doc.addPage();
                yPosition = 50;
            }
        });
        // Add footer with total count
        doc
            .fontSize(12)
            .text(`Total Applicants: ${freeCourseApplicants.length}`, 50, doc.page.height - 50, { align: "center" });
        // Finalize the PDF and end the stream
        doc.end();
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.exportFreeCourseApplicantsPDF = exportFreeCourseApplicantsPDF;
const registerForFreeCourseAccessFromMarketing = async (req, res) => {
    try {
        const { firstName, lastName, email, gender, phoneNumber, courseId, hearAbout, otherSource, } = req.body;
        const cleanedEmail = email.toLowerCase().trim();
        const [course, user, existing] = await Promise.all([
            prismadb_1.prismadb.course.findUnique({
                where: { id: courseId },
            }),
            prismadb_1.prismadb.user.findUnique({
                where: { email: cleanedEmail },
            }),
            prismadb_1.prismadb.freeCourseAccessRegistration.findUnique({
                where: {
                    email_courseId: {
                        email: cleanedEmail,
                        courseId,
                    },
                },
            }),
        ]);
        if (!course) {
            return res.status(404).json({
                message: "Course not found",
            });
        }
        if (existing) {
            return res.status(409).json({
                message: "You have already registered for free access to this course.",
            });
        }
        const registration = await prismadb_1.prismadb.freeCourseAccessRegistration.create({
            data: {
                firstName,
                lastName,
                email: cleanedEmail,
                gender,
                phoneNumber,
                courseId,
                userId: user?.id || null,
                hearAbout,
                otherSource,
                accessGranted: true,
            },
        });
        if (!registration?.id) {
            return res.status(422).json({
                message: "An error occured while registring for course.",
            });
        }
        const callbackUrl = `/dashboard/lessons/${courseId}`;
        const params = new URLSearchParams({
            callbackUrl,
        });
        await Promise.all([
            // sync google sheet
            googleSheets_1.FreeCourseAccessSheetsService.syncRegistration(registration, course),
            // send email
            (0, free_course_registration_1.sendFreeCourseAccessEmail)({
                email,
                firstName,
                courseTitle: course.title,
                accessUrl: user?.id
                    ? `${process.env.NEXT_PUBLIC_APP_URL}/login?${params.toString()}`
                    : `${process.env.NEXT_PUBLIC_APP_URL}//signup?${params.toString()}`,
            }),
        ]);
        return res.status(201).json({
            status: "success",
            message: "Registration successful",
            data: registration,
            hasAccount: !!user,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.registerForFreeCourseAccessFromMarketing = registerForFreeCourseAccessFromMarketing;
//# sourceMappingURL=index.js.map