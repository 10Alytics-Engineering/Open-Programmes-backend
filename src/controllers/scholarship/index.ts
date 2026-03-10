import { Request, Response } from "express";
import { prismadb } from "../../index";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { sendIWDRegistrationEmail } from "./mail";

/**
 * ==================================================================================
 * REFORMATTED SCHOLARSHIP CONTROLLER (IWD 2026)
 * ==================================================================================
 * Logic flow:
 * 1. Validate mandatory fields.
 * 2. Hash password.
 * 3. Atomic transaction:
 *    - Find or Create User (ensuring password is SET).
 *    - Find or Create Application.
 * 4. Generate Auth Tokens (Automatic Login).
 * 5. Update user with access token.
 * 6. Background tasks (Email, Sheets).
 * 7. Clean Success Response.
 */

export async function applyForScholarship(req: Request, res: Response) {
    const TRACE_ID = `[IWD_REGISTRATION_${Date.now()}]`;
    console.log(`${TRACE_ID} Processing request for: ${req.body?.email}`);

    try {
        const {
            fullName, email, phone_number, country, gender,
            program, cohort, discountCode, password
        } = req.body;

        // 1. INPUT VALIDATION
        if (!email || !fullName || !password || !phone_number || !program || !cohort) {
            console.warn(`${TRACE_ID} Validation Failed: Missing required fields.`);
            return res.status(400).json({
                status: "error",
                message: "Please fill in all mandatory fields (Name, Email, Password, Phone, Program, Cohort)."
            });
        }

        const emailLower = email.trim().toLowerCase();
        const phoneTrimmed = phone_number.trim();

        // 2. PASSWORD SECURITY
        console.log(`${TRACE_ID} Hashing password for secure storage.`);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password.trim(), salt);

        // 3. ATOMIC TRANSACTIONS (FOOLPROOF IDENTITY MANAGEMENT)
        const result = await prismadb.$transaction(async (tx) => {

            // A. Identity management (User)
            let user = await tx.user.findUnique({
                where: { email: emailLower }
            });

            if (user) {
                console.log(`${TRACE_ID} Updating existing user profilce for ID: ${user.id}`);
                user = await tx.user.update({
                    where: { id: user.id },
                    data: {
                        name: fullName,
                        phone_number: phoneTrimmed,
                        password: hashedPassword, // Forces password update/init
                        emailVerified: user.emailVerified || new Date()
                    }
                });
            } else {
                // Check for phone number collision
                const existingPhoneUser = await tx.user.findUnique({
                    where: { phone_number: phoneTrimmed }
                });

                if (existingPhoneUser) {
                    throw new Error("PHONE_TAKEN");
                }

                console.log(`${TRACE_ID} Onboarding new user: ${emailLower}`);
                user = await tx.user.create({
                    data: {
                        name: fullName,
                        email: emailLower,
                        phone_number: phoneTrimmed,
                        password: hashedPassword,
                        emailVerified: new Date(),
                        role: "USER"
                    }
                });
            }

            // B. Scholarship Application management
            let application = await tx.scholarshipApplication.findFirst({
                where: { email: emailLower }
            });

            const scholarshipPayload = {
                fullName,
                phone_number: phoneTrimmed,
                country: country || "Nigeria",
                gender: gender || "Not Specified",
                program,
                cohort,
                discountCode: discountCode || "IWD 2026",
                password: hashedPassword, // Audit/Backup
                userId: user.id
            };

            if (application) {
                console.log(`${TRACE_ID} Updating application ID: ${application.id}`);
                application = await tx.scholarshipApplication.update({
                    where: { id: application.id },
                    data: scholarshipPayload
                });
            } else {
                console.log(`${TRACE_ID} Recording new application.`);
                application = await tx.scholarshipApplication.create({
                    data: {
                        ...scholarshipPayload,
                        email: emailLower,
                        paymentStatus: "PENDING"
                    }
                });
            }

            return { user, application };
        });

        const { user, application } = result;

        // 4. AUTHENTICATION (POST-REGISTRATION SESSION)
        const secret = process.env.JWT_SECRET as string;
        const payload = { email: user.email, id: user.id, role: user.role };

        const access_token = jwt.sign(payload, secret, { expiresIn: "30d" });
        const refresh_token = jwt.sign(payload, secret, { expiresIn: "30d" });

        // Synchronize access token to user record
        await prismadb.user.update({
            where: { id: user.id },
            data: { access_token }
        });

        console.log(`${TRACE_ID} Transaction Success. Database records are consistent.`);

        // 5. ASYNC NOTIFICATIONS & LOGS
        sendIWDRegistrationEmail(emailLower, fullName).catch(e =>
            console.error(`${TRACE_ID} Email Dispatch Error:`, e.message)
        );

        import("../../utils/googleSheets").then(({ GoogleSheetsSyncService }) => {
            GoogleSheetsSyncService.syncApplication(application).catch(e =>
                console.error(`${TRACE_ID} Google Sheets Error:`, e.message)
            );
        }).catch(e => console.error(`${TRACE_ID} Sheets Service Import Error:`, e.message));

        // 6. RESPONSE DISPATCH
        return res.status(201).json({
            status: "success",
            message: "Your application has been received and your account is secured.",
            refresh_token,
            data: {
                ...user,
                access_token // Maintain client-side property name
            },
            application
        });

    } catch (error: any) {
        console.error(`${TRACE_ID} CRITICAL FAILURE:`, error);

        if (error.message === "PHONE_TAKEN") {
            return res.status(409).json({
                status: "error",
                message: "This phone number is already registered under a different email."
            });
        }

        return res.status(500).json({
            status: "error",
            message: "There was a problem processing your application. Please try again soon."
        });
    }
}

/**
 * Get all scholarship entries
 */
export async function getScholarshipApplications(req: Request, res: Response) {
    try {
        const data = await prismadb.scholarshipApplication.findMany({
            include: { user: true },
            orderBy: { createdAt: "desc" }
        });

        return res.status(200).json({ status: "success", data });
    } catch (error) {
        console.error("[SCHOLARSHIP_GET_ERR]:", error);
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
}

/**
 * Background Sync to Sheets
 */
export async function syncScholarshipToSheets(req: Request, res: Response) {
    try {
        const { GoogleSheetsSyncService } = await import("../../utils/googleSheets");
        const resObj = await GoogleSheetsSyncService.syncAllApplications();

        if (resObj.success) {
            return res.status(200).json({
                status: "success",
                message: `Successfully synced ${resObj.count} applications.`
            });
        } else {
            return res.status(500).json({ status: "error", message: "Failed to sync to Sheets." });
        }
    } catch (error: any) {
        console.error("[SCHOLARSHIP_SYNC_ERR]:", error);
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
}
