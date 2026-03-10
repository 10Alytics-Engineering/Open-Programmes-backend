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

        const emailLower = email ? email.trim().toLowerCase() : "";
        console.log(`[SCHOLARSHIP_TRACE]: Incoming application for ${emailLower}. Password provided: ${!!password}`);

        // 1. Check if email is already used in a scholarship application
        let application = await prismadb.scholarshipApplication.findFirst({
            where: { email: emailLower }
        });

        // 2. Hash password if provided
        let hashedPassword = null;
        if (password && typeof password === 'string' && password.trim() !== "") {
            console.log(`[SCHOLARSHIP_TRACE]: Hashing password for ${emailLower}...`);
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(password, salt);
            console.log(`[SCHOLARSHIP_TRACE]: Password hashed successfully.`);
        } else {
            console.warn(`[SCHOLARSHIP_TRACE]: No valid password string received for ${emailLower}. Type: ${typeof password}`);
        }

        // 3. User Handling
        let user = await prismadb.user.findFirst({
            where: {
                OR: [
                    { email: emailLower },
                    { phone_number: phone_number }
                ]
            }
        });

        if (!user) {
            console.log(`[SCHOLARSHIP_TRACE]: No existing user found for ${emailLower}. Creating new record.`);
            user = await prismadb.user.create({
                data: {
                    name: fullName,
                    email: emailLower,
                    phone_number: phone_number,
                    password: hashedPassword,
                    emailVerified: new Date(),
                }
            });
            console.log(`[SCHOLARSHIP_TRACE]: New user created with ID: ${user.id}. Password in DB: ${!!user.password}`);
        } else {
            console.log(`[SCHOLARSHIP_TRACE]: Found existing user ${user.id} for ${emailLower}. Checking password...`);
            // Update password if missing
            if (hashedPassword && (!user.password || user.password.trim() === "")) {
                console.log(`[SCHOLARSHIP_TRACE]: Existing user had no password. Updating...`);
                user = await prismadb.user.update({
                    where: { id: user.id },
                    data: { password: hashedPassword }
                });
                console.log(`[SCHOLARSHIP_TRACE]: Existing user password populated.`);
            } else {
                console.log(`[SCHOLARSHIP_TRACE]: Skipping user password update (already has one or no new password provided).`);
            }
        }

        // 4. Scholarship Application (Create or Update)
        if (application) {
            console.log(`[SCHOLARSHIP_TRACE]: Updating existing application ${application.id}`);
            application = await prismadb.scholarshipApplication.update({
                where: { id: application.id },
                data: {
                    fullName,
                    phone_number,
                    country,
                    gender,
                    program,
                    cohort,
                    discountCode,
                    password: hashedPassword, // Always save the new password if provided
                    userId: user.id
                }
            });
        } else {
            console.log(`[SCHOLARSHIP_TRACE]: Creating new scholarship application record.`);
            application = await prismadb.scholarshipApplication.create({
                data: {
                    fullName,
                    email: emailLower,
                    phone_number,
                    country,
                    gender,
                    program,
                    cohort,
                    discountCode,
                    password: hashedPassword,
                    paymentStatus: "PENDING",
                    userId: user.id
                }
            });
        }
        console.log(`[SCHOLARSHIP_TRACE]: Scholarship application record ${application.id} ready. Password: ${!!application.password}`);

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

        // Generate tokens so user is logged in for the next step
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

export async function syncScholarshipToSheets(req: Request, res: Response) {
    try {
        const { GoogleSheetsSyncService } = await import("../../utils/googleSheets");
        const result = await GoogleSheetsSyncService.syncAllApplications();

        if (result.success) {
            return res.status(200).json({
                status: "success",
                message: `Successfully synced ${result.count} applications to Google Sheets.`
            });
        } else {
            return res.status(500).json({
                status: "error",
                message: "Failed to sync to Google Sheets",
                error: result.error
            });
        }
    } catch (error: any) {
        console.log("[SYNC_SCHOLARSHIP_TO_SHEETS]:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}

