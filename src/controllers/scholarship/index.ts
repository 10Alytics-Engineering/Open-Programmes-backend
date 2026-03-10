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
        let application = await prismadb.scholarshipApplication.findFirst({
            where: { email: emailLower }
        });

        // 2. Hash password if provided
        let hashedPassword = null;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            hashedPassword = await bcrypt.hash(password, salt);
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
            console.log(`[SCHOLARSHIP]: No existing user found for ${emailLower}. Creating new record.`);

            if (!hashedPassword) {
                console.error(`[SCHOLARSHIP_CRITICAL]: No password provided for NEW user ${emailLower}`);
            }

            user = await prismadb.user.create({
                data: {
                    name: fullName,
                    email: emailLower,
                    phone_number: phone_number,
                    password: hashedPassword,
                    emailVerified: new Date(),
                }
            });
            console.log(`[SCHOLARSHIP]: New user created successfully with ID: ${user.id}. Password saved: ${!!user.password}`);
        } else {
            console.log(`[SCHOLARSHIP]: User already exists with ID: ${user.id}. Skipping user update (preserving existing password).`);
        }

        // 4. Scholarship Application (Create or Update)
        if (application) {
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
                    password: hashedPassword || application.password,
                    userId: user.id
                }
            });
        } else {
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
