"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyForScholarship = applyForScholarship;
exports.getScholarshipApplications = getScholarshipApplications;
const index_1 = require("../../index");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const mail_1 = require("./mail");
async function applyForScholarship(req, res) {
    try {
        const { fullName, email, phone_number, country, gender, program, cohort, discountCode, password } = req.body;
        if (!fullName || !email || !phone_number || !country || !gender || !program || !cohort) {
            return res.status(400).json({ message: "Fill in all required fields!" });
        }
        const emailLower = email.toLowerCase();
        // 1. Check if email is already used in a scholarship application
        const existingEmailApp = await index_1.prismadb.scholarshipApplication.findFirst({
            where: { email: emailLower }
        });
        if (existingEmailApp) {
            return res.status(400).json({ message: "This email address has already been used to apply for a scholarship." });
        }
        // 2. Check if phone number is already used in a scholarship application
        const existingPhoneApp = await index_1.prismadb.scholarshipApplication.findFirst({
            where: { phone_number: phone_number }
        });
        if (existingPhoneApp) {
            return res.status(400).json({ message: "This phone number has already been used to apply for a scholarship." });
        }
        // Hash password if provided
        let hashedPassword = null;
        if (password) {
            const salt = await bcryptjs_1.default.genSalt(10);
            hashedPassword = await bcryptjs_1.default.hash(password, salt);
        }
        // Create scholarship application
        const application = await index_1.prismadb.scholarshipApplication.create({
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
        (0, mail_1.sendIWDRegistrationEmail)(emailLower, fullName).catch(err => {
            console.error("[SCHOLARSHIP_EMAIL_ERROR]:", err);
        });
        // Sync to Google Sheets in the background
        Promise.resolve().then(() => __importStar(require("../../utils/googleSheets"))).then(({ GoogleSheetsSyncService }) => {
            GoogleSheetsSyncService.syncApplication(application).catch(err => {
                console.error("[GOOGLE_SHEETS_SYNC_ERROR]:", err);
            });
        });
        return res.status(201).json({
            status: "success",
            message: "Scholarship application submitted successfully!",
            data: application
        });
    }
    catch (error) {
        console.log("[SCHOLARSHIP_APPLY]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
async function getScholarshipApplications(req, res) {
    try {
        const applications = await index_1.prismadb.scholarshipApplication.findMany({
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
    }
    catch (error) {
        console.log("[GET_SCHOLARSHIP_APPLICATIONS]:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
}
//# sourceMappingURL=index.js.map