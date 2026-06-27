"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerForJapaSession = void 0;
const prismadb_1 = require("../../lib/prismadb");
const japa_session_mails_1 = require("../../mails/japa-session-mails");
const googleSheets_1 = require("../../utils/googleSheets");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
const registerForJapaSession = async (req, res) => {
    try {
        const { fullName, email, phoneNumber, currentCountry, targetCountry, profession, hearAbout, wantsEarlyAccess = false, wantsConsultation = false, } = req.body;
        if (!fullName ||
            !email ||
            !phoneNumber ||
            !currentCountry ||
            !targetCountry ||
            !profession ||
            !hearAbout) {
            return res.status(400).json({
                message: "Please fill in all required fields.",
            });
        }
        const cleanedEmail = email?.toLowerCase().trim();
        const existing = await prismadb_1.prismadb.japaSessionRegistration.findUnique({
            where: {
                email: cleanedEmail,
            },
        });
        if (existing) {
            return res.status(200).json({
                status: "success",
                message: "You have already reserved your spot.",
                data: existing,
            });
        }
        const registration = await prismadb_1.prismadb.japaSessionRegistration.create({
            data: {
                fullName: fullName.trim(),
                email: cleanedEmail,
                phoneNumber,
                currentCountry,
                targetCountry,
                profession,
                hearAbout,
                wantsEarlyAccess,
                wantsConsultation,
            },
        });
        const [sheetResult] = await Promise.allSettled([
            googleSheets_1.JapaSessionSheetsService.syncRegistration(registration),
            (0, japa_session_mails_1.sendJapaSessionRegistrationEmail)({
                email: cleanedEmail,
                fullName,
                targetCountry,
                wantsConsultation,
            }),
        ]);
        if (sheetResult.status === "fulfilled" && sheetResult.value?.success) {
            await prismadb_1.prismadb.japaSessionRegistration.update({
                where: { id: registration.id },
                data: {
                    syncedToGoogleSheet: true,
                    googleSheetSyncedAt: new Date(),
                    googleSheetError: null,
                },
            });
        }
        if (sheetResult.status === "fulfilled" && !sheetResult.value?.success) {
            await prismadb_1.prismadb.japaSessionRegistration.update({
                where: { id: registration.id },
                data: {
                    googleSheetError: sheetResult.value?.error || "Sheet sync failed",
                },
            });
        }
        return res.status(201).json({
            status: "success",
            message: "Your spot has been reserved successfully.",
            data: registration,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.registerForJapaSession = registerForJapaSession;
//# sourceMappingURL=index.js.map