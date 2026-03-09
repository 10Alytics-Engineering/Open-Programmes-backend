import { Request, Response } from "express";
import { prismadb } from "../../../src/index";
import jwt from "jsonwebtoken";
import { sendIWDRegistrationEmail } from "./mail";

export async function applyForScholarship(req: Request, res: Response) {
    try {
        const { fullName, email, phone_number, country, gender, program, cohort, discountCode } = req.body;

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

        // Check if user already exists by email OR phone number
        let user = await prismadb.user.findFirst({
            where: {
                OR: [
                    { email: emailLower },
                    { phone_number: phone_number }
                ]
            }
        });

        if (!user) {
            // Create user if not exists
            user = await prismadb.user.create({
                data: {
                    name: fullName,
                    email: emailLower,
                    phone_number: phone_number,
                    emailVerified: new Date(),
                },
            });
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
                userId: user.id
            }
        });

        // Send confirmation email in the background
        sendIWDRegistrationEmail(emailLower, fullName).catch(err => {
            console.error("[SCHOLARSHIP_EMAIL_ERROR]:", err);
        });

        // Sync to Google Sheets in the background
        import("../../../src/utils/googleSheets").then(({ GoogleSheetsSyncService }) => {
            GoogleSheetsSyncService.syncApplication(application).catch(err => {
                console.error("[GOOGLE_SHEETS_SYNC_ERROR]:", err);
            });
        });

        // Generate tokens so user is logged in
        const access_token = jwt.sign(
            {
                email: user.email,
                id: user.id,
                role: user.role,
            },
            process.env.JWT_SECRET as string,
            { expiresIn: "30d" }
        );

        const refresh_token = jwt.sign(
            {
                email: user.email,
                id: user.id,
                role: user.role,
            },
            process.env.JWT_SECRET as string,
            { expiresIn: "30d" }
        );

        await prismadb.user.update({
            where: { id: user.id },
            data: { access_token }
        });

        return res.status(201).json({
            status: "success",
            message: "Scholarship application submitted successfully!",
            refresh_token,
            data: { ...user, access_token },
            application
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
