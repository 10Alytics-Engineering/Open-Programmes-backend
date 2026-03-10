import { Request, Response } from "express";
import { prismadb } from "../../index";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { sendIWDRegistrationEmail } from "./mail";

export async function applyForScholarship(req: Request, res: Response) {
    try {
        const { fullName, email, phone_number, country, gender, program, cohort, discountCode, password } = req.body;

        if (!fullName || !email || !phone_number || !country || !gender || !program || !cohort) {
            return res.status(400).json({ message: "Fill in all required fields!" });
        }

        const emailLower = email.toLowerCase();

        // 1. Check if email is already used in a scholarship application
        const existingEmailApp = await prismadb.scholarshipApplication.findFirst({
            where: { email: emailLower }
        });
        if (existingEmailApp) {
            return res.status(400).json({ message: "This email address has already been used to apply for a scholarship." });
        }

        // 2. Check if phone number is already used in a scholarship application
        const existingPhoneApp = await prismadb.scholarshipApplication.findFirst({
            where: { phone_number: phone_number }
        });
        if (existingPhoneApp) {
            return res.status(400).json({ message: "This phone number has already been used to apply for a scholarship." });
        }

        // Hash password if provided
        let hashedPassword = null;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(password, salt);
        }

        // Create scholarship application
        const application = await prismadb.scholarshipApplication.create({
            data: {
                fullName,
                email: emailLower,
                phone_number,
                country,
                gender,
                program,
                cohort,
                discountCode,
                password: hashedPassword, // Store hashed password for later user creation
                paymentStatus: "PENDING",
            }
        });

        // Send confirmation email in the background
        sendIWDRegistrationEmail(emailLower, fullName).catch(err => {
            console.error("[SCHOLARSHIP_EMAIL_ERROR]:", err);
        });

        // Sync to Google Sheets in the background
        import("../../utils/googleSheets").then(({ GoogleSheetsSyncService }) => {
            GoogleSheetsSyncService.syncApplication(application).catch(err => {
                console.error("[GOOGLE_SHEETS_SYNC_ERROR]:", err);
            });
        });

        return res.status(201).json({
            status: "success",
            message: "Scholarship application submitted successfully!",
            data: application
        });
    } catch (error) {
        console.log("[SCHOLARSHIP_APPLY]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}

export async function getScholarshipApplications(req: Request, res: Response) {
    try {
        const applications = await prismadb.scholarshipApplication.findMany({
            include: {
                user: true
            },
            orderBy: {
                createdAt: "desc"
            }
        });

        return res.status(200).json({
            status: "success",
            data: applications
        });
    } catch (error) {
        console.log("[GET_SCHOLARSHIP_APPLICATIONS]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
