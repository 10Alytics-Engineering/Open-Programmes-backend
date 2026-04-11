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
const express_1 = __importDefault(require("express"));
const prismadb_1 = require("../../lib/prismadb");
const paystack_sdk_1 = require("paystack-sdk");
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mail_1 = require("./mail");
const node_cron_1 = __importDefault(require("node-cron"));
const date_fns_1 = require("date-fns");
const paymentService_1 = require("../../utils/paymentService");
if (!process.env.PAYSTACK_SECRET_KEY) {
    console.warn("⚠️ PAYSTACK_SECRET_KEY is missing from environment variables!");
}
const paystack = new paystack_sdk_1.Paystack(process.env.PAYSTACK_SECRET_KEY);
const paymentApp = express_1.default.Router();
paymentApp.use(express_1.default.json());
// Logging middleware for payment routes
paymentApp.use((req, res, next) => {
    console.log(`[Payment] ${req.method} ${req.path}`, req.body || req.query);
    next();
});
// Define payment plans as constants
const PAYMENT_PLANS = {
    FULL_PAYMENT: "FULL_PAYMENT",
    FIRST_HALF_COMPLETE: "FIRST_HALF_COMPLETE",
    SECOND_HALF_PAYMENT: "SECOND_HALF_PAYMENT",
    FOUR_INSTALLMENTS: "FOUR_INSTALLMENTS",
    THREE_INSTALLMENTS: "THREE_INSTALLMENTS",
};
// Constants from environment
const TOTAL_COURSE_FEE = Number(process.env.TOTAL_COURSE_FEE) || 250000;
const INSTALLMENT_CONFIG = {
    seatReservation: 30000,
    cohortAccess: 55000,
    month1: 85000,
    month2: 80000,
};
const THREE_INSTALLMENT_CONFIG = {
    initialPayment: 85000,
    month1: 85000,
    month2: 80000,
};
//#region Utility Functions
const getCohortSchedule = (startDate) => ({
    seatReservationDue: new Date(startDate),
    cohortAccessDue: (0, date_fns_1.addMonths)(startDate, 0),
    month1Due: (0, date_fns_1.addMonths)(startDate, 1),
    month2Due: (0, date_fns_1.addMonths)(startDate, 2),
});
const getThreeInstallmentSchedule = (startDate) => ({
    initialPaymentDue: new Date(startDate),
    month1Due: (0, date_fns_1.addMonths)(startDate, 1),
    month2Due: (0, date_fns_1.addMonths)(startDate, 2),
});
async function getCourseDetails(courseId) {
    return prismadb_1.prismadb.course.findUniqueOrThrow({
        where: { id: courseId },
        select: {
            id: true,
            title: true,
            price: true,
            discount: true,
            cohorts: {
                orderBy: { startDate: "asc" },
                select: {
                    id: true,
                    startDate: true,
                    endDate: true,
                    name: true,
                },
            },
        },
    });
}
/** Parse a price string like "250000" or "250,000" to a number, falling back to TOTAL_COURSE_FEE */
function parseCoursePrice(raw) {
    if (!raw)
        return TOTAL_COURSE_FEE;
    const parsed = Number(String(raw).replace(/,/g, "").trim());
    return parsed > 0 ? parsed : TOTAL_COURSE_FEE;
}
async function getUserDetails(userId) {
    return prismadb_1.prismadb.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
            id: true,
            email: true,
            name: true,
            phone_number: true,
        },
    });
}
function validatePaymentPlan(input) {
    if (!input)
        return null;
    return Object.values(PAYMENT_PLANS).includes(input)
        ? input
        : null;
}
// Helper to get payment plan from either new or old field
async function getPaymentPlanFromRecord(record) {
    return record.paymentPlan || record.paymentType || null;
}
function getPaymentPlan(record) {
    return record.paymentPlan || record.paymentType || null;
}
async function assignToSelectedCohort(tx, userId, courseId, cohortName, paymentPlan) {
    // Fetch all cohorts for the course to perform robust matching
    const course = await tx.course.findUniqueOrThrow({
        where: { id: courseId },
        include: {
            cohorts: true, // Fetch all cohorts
        },
    });
    // Find cohort with case-insensitive and whitespace-insensitive matching
    const targetCohort = course.cohorts.find((c) => c.name.trim().toLowerCase() === cohortName.trim().toLowerCase());
    if (!targetCohort) {
        throw new Error(`Cohort "${cohortName}" not found for this course`);
    }
    let isPaymentActive = false;
    if (paymentPlan === PAYMENT_PLANS.FULL_PAYMENT) {
        isPaymentActive = true;
    }
    else if (paymentPlan === PAYMENT_PLANS.FIRST_HALF_COMPLETE) {
        isPaymentActive = true;
    }
    else if (paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS) {
        isPaymentActive = false;
    }
    const userCohort = await tx.userCohort.upsert({
        where: {
            userId_cohortId_courseId: {
                userId,
                cohortId: targetCohort.id,
                courseId,
            },
        },
        create: {
            userId,
            cohortId: targetCohort.id,
            courseId,
            isPaymentActive,
        },
        update: {
            cohortId: targetCohort.id,
            isPaymentActive,
        },
        include: {
            cohort: {
                select: {
                    id: true,
                    name: true,
                    startDate: true,
                    endDate: true,
                },
            },
        },
    });
    return {
        ...userCohort,
        cohortId: targetCohort.id,
        actualStartDate: targetCohort.startDate,
    };
}
async function sendPaymentNotifications(userId, courseId, installmentNumber) {
    const [user, course, paymentStatus] = await Promise.all([
        getUserDetails(userId),
        getCourseDetails(courseId),
        prismadb_1.prismadb.paymentStatus.findUnique({
            where: { userId_courseId: { userId, courseId } },
            include: {
                paymentInstallments: { orderBy: { installmentNumber: "asc" } },
                cohort: true,
            },
        }),
    ]);
    if (!paymentStatus)
        return;
    const paymentPlan = await getPaymentPlanFromRecord(paymentStatus);
    if (paymentPlan === PAYMENT_PLANS.FULL_PAYMENT) {
        await (0, mail_1.sendPurchaseConfirmationMail)(user.email, course.title, user.name || "Student", `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`);
    }
    else if (paymentPlan === PAYMENT_PLANS.FIRST_HALF_COMPLETE) {
        if (paymentStatus.status === client_1.PaymentStatusType.COMPLETE) {
            await (0, mail_1.sendPurchaseConfirmationMail)(user.email, course.title, user.name || "Student", `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`);
        }
        else {
            await (0, mail_1.sendPaymentConfirmation)(user.email, user.name || "Student", course.title, 1);
        }
    }
    else if (paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS &&
        installmentNumber) {
        if (installmentNumber === 4) {
            await (0, mail_1.sendPurchaseConfirmationMail)(user.email, course.title, user.name || "Student", `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`);
        }
        else {
            await (0, mail_1.sendPaymentConfirmation)(user.email, user.name || "Student", course.title, installmentNumber);
        }
    }
}
// Add better error logging
const logPaymentError = (message, data = {}) => {
    console.error(`[PAYMENT_ERROR] ${message}`, JSON.stringify(data, null, 2));
};
//#endregion
//#region Payment Status Check
paymentApp.get("/payment-status", async (req, res) => {
    const { userId, courseId } = req.query;
    if (!userId || !courseId) {
        return res
            .status(400)
            .json({ error: "Missing required parameters: userId and courseId" });
    }
    try {
        const [paymentStatus, course] = await Promise.all([
            prismadb_1.prismadb.paymentStatus.findUnique({
                where: {
                    userId_courseId: {
                        userId: userId,
                        courseId: courseId,
                    },
                },
                include: {
                    paymentInstallments: {
                        orderBy: {
                            installmentNumber: "asc",
                        },
                    },
                },
            }),
            prismadb_1.prismadb.course.findUnique({
                where: { id: courseId },
                select: { price: true },
            }),
        ]);
        if (!paymentStatus) {
            return res.json(null);
        }
        // Use admin-set course price, falling back to env variable
        const courseFee = parseCoursePrice(course?.price);
        const halfFee = Math.ceil(courseFee / 2);
        let remainingAmount = 0;
        const paymentPlan = await getPaymentPlanFromRecord(paymentStatus);
        if (paymentPlan === PAYMENT_PLANS.FIRST_HALF_COMPLETE &&
            paymentStatus.status === client_1.PaymentStatusType.BALANCE_HALF_PAYMENT) {
            remainingAmount = halfFee;
        }
        else if (paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS) {
            const paidInstallments = paymentStatus.paymentInstallments.filter((i) => i.paid);
            const totalPaid = paidInstallments.reduce((sum, i) => sum + i.amount, 0);
            remainingAmount = courseFee - totalPaid;
        }
        res.json({
            ...paymentStatus,
            remainingAmount,
        });
    }
    catch (error) {
        console.error("Error fetching payment status:", error);
        res.status(500).json({
            error: "Failed to fetch payment status",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
//#region Link Generation
paymentApp.get("/payment-link", async (req, res) => {
    const { userId, courseId, planType, channels, paymentGateway, paymentMethods, } = req.query;
    if (!userId || !courseId) {
        return res.status(400).json({ error: "Missing userId or courseId" });
    }
    try {
        // Validate planType if provided
        const validPlanTypes = ["FULL", "HALF", "THREE_INSTALLMENT", "INSTALLMENT"];
        if (planType && !validPlanTypes.includes(planType)) {
            return res.status(400).json({ error: "Invalid plan type" });
        }
        // First find the payment status record for this user and course
        const paymentStatus = await prismadb_1.prismadb.paymentStatus.findUnique({
            where: {
                userId_courseId: {
                    userId: userId,
                    courseId: courseId,
                },
            },
            include: {
                transactions: {
                    where: {
                        status: "pending",
                        createdAt: { gt: new Date(Date.now() - 30 * 60 * 1000) },
                    },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                },
                cohort: true, // Include cohort data
            },
        });
        // If no active link but we need to create one, we MUST have a cohort
        if (planType) {
            if (!paymentStatus || !paymentStatus.cohort) {
                return res.status(400).json({
                    error: "No cohort assigned. Please initiate payment through the normal flow first.",
                });
            }
            const [user, course] = await Promise.all([
                getUserDetails(userId),
                getCourseDetails(courseId),
            ]);
            // Use the cohort name from existing payment status
            const cohortName = paymentStatus.cohort.name;
            const courseFee = parseCoursePrice(course.price);
            const paymentData = getPaymentData(planType, cohortName, courseFee);
            if (!paymentData) {
                return res.status(400).json({ error: "Invalid plan type" });
            }
            // Check for existing pending transaction that MATCHES this plan and amount
            const pendingTx = paymentStatus.transactions.find((tx) => tx.paymentPlan === paymentData.callbackParams.paymentPlan &&
                tx.amount === paymentData.amount.toString());
            if (pendingTx?.authorizationUrl) {
                return res.json({
                    authorizationUrl: pendingTx.authorizationUrl,
                    exists: true,
                });
            }
            const metadata = {
                ...paymentData.metadata,
                userId,
                courseId,
                ...paymentData.callbackParams,
            };
            if (paymentGateway === "PAYSTACK") {
                const paymentLink = await paystack.transaction.initialize({
                    amount: `${paymentData.amount * 100}`,
                    email: user.email,
                    channels: channels || [
                        "card",
                        "bank_transfer",
                        "mobile_money",
                        "ussd",
                        "qr",
                    ],
                    metadata,
                    callback_url: `${process.env.PAYSTACK_CALLBACK_URL}`,
                });
                // Store the new transaction
                await prismadb_1.prismadb.paymentTransaction.create({
                    data: {
                        transactionRef: paymentLink.data.reference,
                        userId: userId,
                        courseId: courseId,
                        amount: paymentData.amount.toString(),
                        status: "pending",
                        authorizationUrl: paymentLink.data.authorization_url,
                        paymentPlan: paymentData.callbackParams.paymentPlan,
                        metadata: JSON.stringify(paymentData.metadata),
                        paymentGateway: "PAYSTACK",
                        paymentDate: new Date(),
                    },
                });
                return res.json({
                    authorizationUrl: paymentLink.data.authorization_url,
                    exists: true,
                    isNew: true,
                });
            }
            else {
                const paymentLink = await (0, paymentService_1.initiateStartButtonPayment)(user.email, paymentData.amount * 100, "NGN", metadata, paymentMethods);
                if (!paymentLink?.url) {
                    console.log("Start button payment link error", paymentLink);
                    res.status(500).json({
                        error: "Failed to fetch payment link",
                        details: "An error occured while processing start button payment link",
                    });
                }
                await prismadb_1.prismadb.paymentTransaction.create({
                    data: {
                        transactionRef: paymentLink.reference,
                        userId: userId,
                        courseId: courseId,
                        amount: paymentData.amount.toString(),
                        status: "pending",
                        authorizationUrl: paymentLink.url,
                        paymentPlan: paymentData.callbackParams.paymentPlan,
                        metadata: JSON.stringify(paymentData.metadata),
                        paymentGateway: paymentGateway,
                        paymentDate: new Date(),
                    },
                });
                return res.json({
                    authorizationUrl: paymentLink.url,
                    exists: true,
                    isNew: true,
                });
            }
        }
        res.json({ exists: false });
    }
    catch (error) {
        console.error("Error fetching payment link:", error);
        res.status(500).json({
            error: "Failed to fetch payment link",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
paymentApp.get("/start-button-test", async (req, res) => {
    try {
        // const paymentData = await initiateStartButtonPayment(
        //   "ebirenidavid@gmail.com",
        //   30000,
        //   "NGN",
        //   { userId: "748374H43Jsadaa" },
        // );
        // const paymentData = await verifyStartButtonTransaction("RXVKFA3YJDA");
        // return res.status(200).json(paymentData);
        const results = await prismadb_1.prismadb.paymentTransaction.findMany({
            orderBy: { createdAt: "desc" },
            take: 50,
        });
        res.status(200).json(results);
    }
    catch (error) {
        console.log("Start Button Error: " + error);
        throw new Error("Failed to process payment");
    }
});
//#region Payment Initialization Endpoints
paymentApp.post("/initiate-payment", async (req, res) => {
    const { courseId, userId, planType, cohortName, isIWD, applicationId, amount, channels, paymentGateway, } = req.body;
    try {
        let email = "";
        let name = "";
        let phone = "";
        if (isIWD && applicationId) {
            const application = await prismadb_1.prismadb.scholarshipApplication.findUnique({
                where: { id: applicationId },
            });
            if (!application)
                return res.status(404).json({ error: "Application not found" });
            email = application.email;
            name = application.fullName;
            phone = application.phone_number;
        }
        else {
            if (!userId)
                return res.status(400).json({ error: "Missing userId" });
            const user = await getUserDetails(userId);
            email = user.email;
            name = user.name || "Student";
            phone = user.phone_number || "";
        }
        const course = await getCourseDetails(courseId);
        const courseFee = isIWD ? amount || 100000 : parseCoursePrice(course.price);
        const existingPayment = userId
            ? await prismadb_1.prismadb.paymentStatus.findUnique({
                where: { userId_courseId: { userId, courseId } },
                include: { paymentInstallments: true },
            })
            : null;
        const paymentData = getPaymentData(planType, cohortName, courseFee);
        if (!paymentData) {
            return res.status(400).json({ error: "Invalid plan type" });
        }
        // Override amount if isIWD
        if (isIWD && amount) {
            paymentData.amount = amount;
        }
        const [pendingTx] = await prismadb_1.prismadb.paymentTransaction.findMany({
            where: {
                userId: userId || undefined,
                courseId,
                status: "pending",
                createdAt: { gt: new Date(Date.now() - 30 * 60 * 1000) },
                paymentPlan: paymentData.callbackParams.paymentPlan,
                amount: paymentData.amount.toString(),
            },
            orderBy: { createdAt: "desc" },
            take: 1,
        });
        if (pendingTx?.authorizationUrl) {
            // Verify cohort matches too
            const txMetadata = JSON.parse(pendingTx.metadata || "{}");
            if (txMetadata.cohortName === cohortName) {
                return res.json({
                    authorizationUrl: pendingTx.authorizationUrl,
                    isExisting: true,
                });
            }
        }
        let paymentLink = null;
        const metadata = {
            ...paymentData.metadata,
            userId,
            courseId,
            isIWD,
            applicationId,
            ...paymentData.callbackParams,
        };
        if (paymentGateway === "PAYSTACK") {
            const paystackLink = await paystack.transaction.initialize({
                amount: `${paymentData.amount * 100}`,
                email: email,
                metadata,
                channels: channels || [
                    "card",
                    "bank_transfer",
                    "mobile_money",
                    "ussd",
                    "qr",
                ],
                callback_url: `${process.env.PAYSTACK_CALLBACK_URL}`,
            });
            paymentLink = {
                url: paystackLink.data.authorization_url,
                reference: paystackLink.data.reference,
            };
        }
        else {
            console.log("Start Button Running");
            const startButtonLink = await (0, paymentService_1.initiateStartButtonPayment)(email, paymentData.amount * 100, "NGN", metadata, channels);
            if (!startButtonLink?.url) {
                console.log("Start button payment link error", startButtonLink);
                res.status(500).json({
                    error: "Failed to fetch payment link",
                    details: "An error occured while processing start button payment link",
                });
            }
            paymentLink = {
                url: startButtonLink.url,
                reference: startButtonLink.reference,
            };
        }
        if (!paymentLink?.url || !paymentLink?.reference) {
            return res
                .status(422)
                .json({ error: `Failed to initiate ${paymentGateway} payment link` });
        }
        const transaction = await prismadb_1.prismadb.$transaction(async (tx) => {
            if (userId && !existingPayment) {
                await createPaymentStatus(tx, {
                    userId,
                    courseId,
                    paymentData,
                    planType,
                    cohortName,
                    courseFee,
                });
            }
            return tx.paymentTransaction.create({
                data: {
                    transactionRef: paymentLink.reference,
                    paymentGateway: paymentGateway,
                    userId: userId || "IWD_PENDING",
                    courseId,
                    amount: paymentData.amount.toString(),
                    status: "pending",
                    authorizationUrl: paymentLink.url,
                    paymentPlan: paymentData.callbackParams.paymentPlan,
                    metadata: JSON.stringify({
                        ...paymentData.metadata,
                        isIWD,
                        applicationId,
                    }),
                    paymentDate: new Date(),
                },
            });
        }, {
            maxWait: 20000,
            timeout: 15000,
        });
        res.json({
            authorizationUrl: paymentLink.url,
            isExisting: false,
        });
    }
    catch (error) {
        console.error("Payment initiation error:", error);
        res.status(500).json({
            error: "Payment initiation failed",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
/**
 * Build payment data for a given plan type.
 * @param planType  - "FULL" | "HALF" | "THREE_INSTALLMENT"
 * @param cohortName - cohort the user selected
 * @param courseFee  - the actual course fee fetched from the DB (admin-set price)
 */
function getPaymentData(planType, cohortName, courseFee = TOTAL_COURSE_FEE) {
    // Use current date as baseline since actual schedule is calculated from DB cohort record
    const startDate = new Date();
    const halfFee = Math.ceil(courseFee / 2);
    switch (planType) {
        case "FULL":
            return {
                amount: courseFee,
                metadata: { planType: "FULL", cohortName },
                callbackParams: {
                    paymentPlan: PAYMENT_PLANS.FULL_PAYMENT,
                    cohortName,
                },
            };
        case "HALF":
            return {
                amount: halfFee,
                metadata: { planType: "HALF", cohortName },
                callbackParams: {
                    paymentPlan: PAYMENT_PLANS.FIRST_HALF_COMPLETE,
                    remainingAmount: halfFee,
                    cohortName,
                },
            };
        case "THREE_INSTALLMENT":
            return {
                amount: THREE_INSTALLMENT_CONFIG.initialPayment,
                metadata: {
                    planType: "THREE_INSTALLMENT",
                    schedule: getThreeInstallmentSchedule(startDate),
                    cohortName,
                },
                callbackParams: {
                    paymentPlan: PAYMENT_PLANS.THREE_INSTALLMENTS,
                    installmentNumber: 1,
                    cohortName,
                },
            };
        default:
            return null;
    }
}
async function createPaymentStatus(tx, params) {
    const cohort = await assignToSelectedCohort(tx, params.userId, params.courseId, params.cohortName, params.paymentData.callbackParams.paymentPlan);
    const createData = {
        userId: params.userId,
        courseId: params.courseId,
        paymentPlan: params.paymentData.callbackParams.paymentPlan,
        paymentType: params.paymentData.callbackParams.paymentPlan,
        status: client_1.PaymentStatusType.PENDING_SEAT_CONFIRMATION,
        cohortId: cohort.cohortId,
    };
    if (params.planType === "THREE_INSTALLMENT") {
        createData.desiredStartDate = cohort.actualStartDate;
        // Use the actual cohort start date for installment scheduling
        const actualStartDate = cohort.actualStartDate;
        createData.paymentInstallments = {
            create: [
                {
                    amount: THREE_INSTALLMENT_CONFIG.initialPayment,
                    dueDate: actualStartDate,
                    installmentNumber: 1,
                },
                {
                    amount: THREE_INSTALLMENT_CONFIG.month1,
                    dueDate: (0, date_fns_1.addMonths)(actualStartDate, 1),
                    installmentNumber: 2,
                },
                {
                    amount: THREE_INSTALLMENT_CONFIG.month2,
                    dueDate: (0, date_fns_1.addMonths)(actualStartDate, 2),
                    installmentNumber: 3,
                },
            ],
        };
    }
    return tx.paymentStatus.create({ data: createData });
}
//#endregion
//#region Payment Callback
paymentApp.get("/payment/callback", async (req, res) => {
    const { reference } = req.query;
    try {
        const verification = await paystack.transaction.verify(reference);
        if (verification.data.status === "success") {
            res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/payment/success?reference=${reference}`);
        }
        else {
            res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/payment/failed?reference=${reference}`);
        }
    }
    catch (error) {
        res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/payment/failed?reason=verification`);
    }
});
paymentApp.get("/startbutton-payment/callback", async (req, res) => {
    const { reference } = req.query;
    try {
        const verification = await (0, paymentService_1.verifyStartButtonTransaction)(reference);
        if (verification.transaction?.status === "successful") {
            res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/payment/success?reference=${reference}`);
        }
        else {
            res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/payment/failed?reference=${reference}`);
        }
    }
    catch (error) {
        res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/payment/failed?reason=verification`);
    }
});
//#region Payment Verification
//#region Payment Verification
paymentApp.get("/verify", async (req, res) => {
    const { reference } = req.query;
    if (!reference) {
        return res.status(400).json({ error: "Missing reference parameter" });
    }
    try {
        const existingTx = await prismadb_1.prismadb.paymentTransaction.findUnique({
            where: { transactionRef: reference },
            include: {
                paymentStatus: {
                    include: {
                        paymentInstallments: {
                            orderBy: { installmentNumber: "asc" },
                        },
                        cohort: true,
                        user: {
                            select: { id: true, inactive: true },
                        },
                    },
                },
            },
        });
        if (!existingTx) {
            return res.status(404).json({ error: "Transaction not found" });
        }
        if (existingTx.status === "success") {
            return res.json({
                status: "success",
                data: existingTx,
                message: "Payment already processed",
            });
        }
        if (existingTx.paymentGateway === "PAYSTACK") {
            const verification = await paystack.transaction.verify(reference);
            if (verification.data.status !== "success") {
                await prismadb_1.prismadb.paymentTransaction.update({
                    where: { transactionRef: reference },
                    data: {
                        status: "failed",
                        updatedAt: new Date(),
                    },
                });
                return res.status(400).json({
                    status: "error",
                    error: "Payment not successful",
                });
            }
        }
        else {
            const startButtonVerification = await (0, paymentService_1.verifyStartButtonTransaction)(reference);
            if (startButtonVerification?.transaction?.status !== "successful") {
                await prismadb_1.prismadb.paymentTransaction.update({
                    where: { transactionRef: reference },
                    data: {
                        status: "failed",
                        updatedAt: new Date(),
                    },
                });
                return res.status(400).json({
                    status: "error",
                    error: "Payment not successful",
                });
            }
        }
        const result = await prismadb_1.prismadb.$transaction(async (tx) => {
            let updatedTx = await tx.paymentTransaction.update({
                where: { transactionRef: reference },
                data: {
                    status: "success",
                    paymentDate: new Date(),
                    updatedAt: new Date(),
                },
            });
            const txMetadata = JSON.parse(updatedTx.metadata || "{}");
            let userId = updatedTx.userId;
            // ✅ IWD LOGIC: Create user if this is a scholarship application
            if (txMetadata.isIWD && txMetadata.applicationId) {
                const application = await tx.scholarshipApplication.findUnique({
                    where: { id: txMetadata.applicationId },
                });
                if (!application) {
                    throw new Error("Scholarship application not found");
                }
                // Check if user already exists
                let user = await tx.user.findFirst({
                    where: {
                        OR: [
                            { email: application.email },
                            { phone_number: application.phone_number },
                        ],
                    },
                });
                if (!user) {
                    user = await tx.user.create({
                        data: {
                            name: application.fullName,
                            email: application.email,
                            phone_number: application.phone_number,
                            password: application.password, // This is already hashed from applyForScholarship
                            emailVerified: new Date(),
                            accountPaymentStatus: "PAID",
                        },
                    });
                    console.log(`✅ Created user ${user.id} from IWD application ${application.id}`);
                }
                else {
                    // Update existing user status if needed
                    user = await tx.user.update({
                        where: { id: user.id },
                        data: { accountPaymentStatus: "PAID" },
                    });
                }
                userId = user.id;
                // Update transaction with the real userId
                updatedTx = await tx.paymentTransaction.update({
                    where: { id: updatedTx.id },
                    data: { userId: user.id },
                });
                // Update application
                await tx.scholarshipApplication.update({
                    where: { id: application.id },
                    data: {
                        userId: user.id,
                        paymentStatus: "PAID",
                    },
                });
            }
            const paymentPlan = await getPaymentPlanFromRecord(updatedTx);
            // ✅ CRITICAL: Reactivate user if they were marked inactive
            if (existingTx.paymentStatus?.user?.inactive ||
                userId !== "IWD_PENDING") {
                const userToCheck = userId !== "IWD_PENDING" ? userId : updatedTx.userId;
                const u = await tx.user.findUnique({ where: { id: userToCheck } });
                if (u?.inactive) {
                    await tx.user.update({
                        where: { id: userToCheck },
                        data: { inactive: false },
                    });
                    console.log(`Reactivated user ${userToCheck} after successful payment`);
                }
            }
            let paymentResult;
            switch (paymentPlan) {
                case PAYMENT_PLANS.FULL_PAYMENT:
                    paymentResult = await handleFullPayment(tx, {
                        userId: userId,
                        courseId: updatedTx.courseId,
                        reference: reference,
                    });
                    break;
                case PAYMENT_PLANS.FIRST_HALF_COMPLETE:
                    paymentResult = await handleFirstHalfPayment(tx, {
                        userId: userId,
                        courseId: updatedTx.courseId,
                        reference: reference,
                    });
                    break;
                case PAYMENT_PLANS.SECOND_HALF_PAYMENT:
                    paymentResult = await handleSecondHalfPayment(tx, {
                        userId: userId,
                        courseId: updatedTx.courseId,
                        reference: reference,
                    });
                    break;
                case PAYMENT_PLANS.THREE_INSTALLMENTS:
                case PAYMENT_PLANS.FOUR_INSTALLMENTS:
                    const metadata = JSON.parse(updatedTx.metadata || "{}");
                    paymentResult = await handleInstallmentPayment(tx, {
                        userId: userId,
                        courseId: updatedTx.courseId,
                        installmentNumber: metadata.installmentNumber || 1,
                        paymentPlan: paymentPlan,
                        reference: reference,
                    }, Number(updatedTx.amount));
                    break;
            }
            // ✅ CRITICAL: Verify purchase was created for all payment types
            const existingPurchase = await tx.purchase.findFirst({
                where: {
                    userId: userId,
                    courseId: updatedTx.courseId,
                },
            });
            if (!existingPurchase) {
                await tx.purchase.create({
                    data: {
                        userId: userId,
                        courseId: updatedTx.courseId,
                    },
                });
                console.log(`✅ Created purchase record for user ${userId} and course ${updatedTx.courseId}`);
            }
            return updatedTx;
        }, {
            maxWait: 30000,
            timeout: 25000,
        });
        try {
            const metadata = JSON.parse(result.metadata || "{}");
            await sendPaymentNotifications(result.userId, result.courseId, metadata.installmentNumber);
        }
        catch (emailError) {
            console.error("Email notification failed:", emailError);
        }
        // 🔄 Auto-sync payment data to Google Sheets after successful payment
        try {
            const { GoogleSheetsSyncService } = await Promise.resolve().then(() => __importStar(require("../../utils/googleSheets")));
            GoogleSheetsSyncService.syncPaymentData().catch((e) => console.error("Google Sheets sync error:", e.message));
        }
        catch (sheetError) {
            console.error("Sheet service error:", sheetError);
        }
        const isIWD = JSON.parse(result.metadata || "{}").isIWD;
        let tokens = {};
        if (isIWD) {
            const user = await prismadb_1.prismadb.user.findUnique({
                where: { id: result.userId },
            });
            if (user) {
                const access_token = jsonwebtoken_1.default.sign({ email: user.email, id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "30d" });
                const userResponse = {
                    ...user,
                    hasPassword: !!user.password,
                    access_token,
                };
                // @ts-ignore
                delete userResponse.password;
                tokens = {
                    access_token,
                    user: userResponse,
                };
            }
        }
        res.json({
            status: "success",
            data: result,
            ...tokens,
            userReactivated: existingTx.paymentStatus?.user?.inactive,
        });
    }
    catch (error) {
        console.error("Verification error:", error);
        res.status(500).json({
            status: "error",
            error: "Payment verification failed",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
async function verifyPurchaseCreation(tx, userId, courseId) {
    const purchase = await tx.purchase.findFirst({
        where: {
            userId,
            courseId,
        },
    });
    if (!purchase) {
        // Log more details about the issue
        const user = await tx.user.findUnique({ where: { id: userId } });
        const course = await tx.course.findUnique({ where: { id: courseId } });
        console.error(`Purchase record missing for:`, {
            userId,
            userEmail: user?.email,
            courseId,
            courseTitle: course?.title,
            timestamp: new Date().toISOString(),
        });
        throw new Error(`Purchase record not created for user ${userId} and course ${courseId}`);
    }
    return purchase;
}
//#region Payment Handlers
async function handleFullPayment(tx, metadata) {
    try {
        // For full payment, we need to get the cohort name from metadata
        const existingTx = await tx.paymentTransaction.findUnique({
            where: { transactionRef: metadata.reference },
            include: { paymentStatus: true },
        });
        const txMetadata = existingTx
            ? JSON.parse(existingTx.metadata || "{}")
            : {};
        const cohortName = txMetadata.cohortName;
        if (!cohortName) {
            throw new Error("Cohort name not found in transaction metadata");
        }
        const cohort = await assignToSelectedCohort(tx, metadata.userId, metadata.courseId, cohortName, PAYMENT_PLANS.FULL_PAYMENT);
        const existingPayment = await tx.paymentStatus.findUnique({
            where: {
                userId_courseId: {
                    userId: metadata.userId,
                    courseId: metadata.courseId,
                },
            },
        });
        // ✅ CRITICAL: Check if purchase already exists first
        const existingPurchase = await tx.purchase.findFirst({
            where: {
                userId: metadata.userId,
                courseId: metadata.courseId,
            },
        });
        if (!existingPurchase) {
            await tx.purchase.create({
                data: {
                    userId: metadata.userId,
                    courseId: metadata.courseId,
                },
            });
        }
        if (existingPayment) {
            return tx.paymentStatus.update({
                where: { id: existingPayment.id },
                data: {
                    paymentPlan: PAYMENT_PLANS.FULL_PAYMENT,
                    status: client_1.PaymentStatusType.COMPLETE,
                    cohortId: cohort.cohortId,
                },
            });
        }
        return tx.paymentStatus.create({
            data: {
                userId: metadata.userId,
                courseId: metadata.courseId,
                paymentPlan: PAYMENT_PLANS.FULL_PAYMENT,
                status: client_1.PaymentStatusType.COMPLETE,
                cohortId: cohort.cohortId,
            },
        });
    }
    catch (error) {
        logPaymentError("Full payment processing failed", {
            userId: metadata.userId,
            courseId: metadata.courseId,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
    }
}
async function handleFirstHalfPayment(tx, metadata) {
    try {
        const existingTx = await tx.paymentTransaction.findUnique({
            where: { transactionRef: metadata.reference },
            include: { paymentStatus: true },
        });
        const txMetadata = existingTx
            ? JSON.parse(existingTx.metadata || "{}")
            : {};
        const cohortName = txMetadata.cohortName;
        if (!cohortName) {
            throw new Error("Cohort name not found in transaction metadata");
        }
        const cohort = await assignToSelectedCohort(tx, metadata.userId, metadata.courseId, cohortName, PAYMENT_PLANS.FIRST_HALF_COMPLETE);
        const existingPayment = await tx.paymentStatus.findUnique({
            where: {
                userId_courseId: {
                    userId: metadata.userId,
                    courseId: metadata.courseId,
                },
            },
        });
        // ✅ CRITICAL: Check if purchase already exists first
        const existingPurchase = await tx.purchase.findFirst({
            where: {
                userId: metadata.userId,
                courseId: metadata.courseId,
            },
        });
        if (!existingPurchase) {
            await tx.purchase.create({
                data: {
                    userId: metadata.userId,
                    courseId: metadata.courseId,
                },
            });
        }
        if (existingPayment) {
            return tx.paymentStatus.update({
                where: { id: existingPayment.id },
                data: {
                    paymentPlan: PAYMENT_PLANS.FIRST_HALF_COMPLETE,
                    status: client_1.PaymentStatusType.BALANCE_HALF_PAYMENT,
                    secondPaymentDueDate: (0, date_fns_1.addMonths)(new Date(), 1),
                    cohortId: cohort.cohortId,
                },
            });
        }
        return tx.paymentStatus.create({
            data: {
                userId: metadata.userId,
                courseId: metadata.courseId,
                paymentPlan: PAYMENT_PLANS.FIRST_HALF_COMPLETE,
                status: client_1.PaymentStatusType.BALANCE_HALF_PAYMENT,
                secondPaymentDueDate: (0, date_fns_1.addMonths)(new Date(), 1),
                cohortId: cohort.cohortId,
            },
        });
    }
    catch (error) {
        logPaymentError("First half payment processing failed", {
            userId: metadata.userId,
            courseId: metadata.courseId,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
    }
}
async function handleSecondHalfPayment(tx, metadata) {
    try {
        const paymentStatus = await tx.paymentStatus.findUniqueOrThrow({
            where: {
                userId_courseId: {
                    userId: metadata.userId,
                    courseId: metadata.courseId,
                },
            },
        });
        // ✅ CRITICAL: Verify purchase exists for second half payments
        await verifyPurchaseCreation(tx, metadata.userId, metadata.courseId);
        return tx.paymentStatus.update({
            where: { id: paymentStatus.id },
            data: {
                status: client_1.PaymentStatusType.COMPLETE,
                paymentPlan: PAYMENT_PLANS.FULL_PAYMENT,
            },
        });
    }
    catch (error) {
        logPaymentError("Second half payment processing failed", {
            userId: metadata.userId,
            courseId: metadata.courseId,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
    }
}
async function handleInstallmentPayment(tx, metadata, amountPaid) {
    try {
        const installmentNumber = parseInt(metadata.installmentNumber, 10);
        const paymentStatus = await tx.paymentStatus.findUniqueOrThrow({
            where: {
                userId_courseId: {
                    userId: metadata.userId,
                    courseId: metadata.courseId,
                },
            },
            include: {
                paymentInstallments: {
                    orderBy: { installmentNumber: "asc" },
                },
            },
        });
        // FIX: Find the installment by number, not by paid status
        const installmentToUpdate = paymentStatus.paymentInstallments.find((i) => i.installmentNumber === installmentNumber);
        if (!installmentToUpdate) {
            throw new Error(`Installment ${installmentNumber} not found for this payment plan`);
        }
        // Check if already paid
        if (installmentToUpdate.paid) {
            console.log(`Installment ${installmentNumber} already paid, skipping`);
            return installmentToUpdate; // Return early if already paid
        }
        const installment = await tx.paymentInstallment.update({
            where: { id: installmentToUpdate.id },
            data: { paid: true },
            include: {
                paymentStatus: {
                    include: { cohort: true },
                },
            },
        });
        const paymentPlan = await getPaymentPlanFromRecord(paymentStatus);
        if ((paymentPlan === PAYMENT_PLANS.THREE_INSTALLMENTS &&
            installmentNumber === 1) ||
            (paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS &&
                installmentNumber === 2)) {
            // Get the cohort from payment status
            const cohort = await tx.cohort.findUnique({
                where: { id: paymentStatus.cohortId },
                select: { startDate: true },
            });
            if (!cohort) {
                throw new Error("Assigned cohort not found");
            }
            await tx.paymentStatus.update({
                where: { id: installment.paymentStatusId },
                data: {
                    status: client_1.PaymentStatusType.BALANCE_HALF_PAYMENT,
                },
            });
            const remainingInstallments = await tx.paymentInstallment.findMany({
                where: {
                    paymentStatusId: paymentStatus.id,
                    installmentNumber: { gt: installmentNumber },
                },
            });
            for (const remainingInstallment of remainingInstallments) {
                const newDueDate = (0, date_fns_1.addMonths)(cohort.startDate, remainingInstallment.installmentNumber -
                    (paymentPlan === PAYMENT_PLANS.THREE_INSTALLMENTS ? 1 : 2));
                await tx.paymentInstallment.update({
                    where: { id: remainingInstallment.id },
                    data: { dueDate: newDueDate },
                });
            }
        }
        if ((paymentPlan === PAYMENT_PLANS.THREE_INSTALLMENTS &&
            installmentNumber === 1) ||
            (paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS &&
                installmentNumber === 2)) {
            await tx.userCohort.updateMany({
                where: {
                    userId: metadata.userId,
                    courseId: metadata.courseId,
                },
                data: { isPaymentActive: true },
            });
            // ✅ CRITICAL: Create purchase record when access is granted
            await tx.purchase.create({
                data: {
                    userId: metadata.userId,
                    courseId: metadata.courseId,
                },
            });
        }
        const isFinalInstallment = (paymentPlan === PAYMENT_PLANS.THREE_INSTALLMENTS &&
            installmentNumber === 3) ||
            (paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS &&
                installmentNumber === 4);
        if (isFinalInstallment) {
            await tx.paymentStatus.update({
                where: { id: installment.paymentStatusId },
                data: { status: client_1.PaymentStatusType.COMPLETE },
            });
        }
        return installment;
    }
    catch (error) {
        logPaymentError("Installment payment processing failed", {
            userId: metadata.userId,
            courseId: metadata.courseId,
            installmentNumber: metadata.installmentNumber,
            error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
    }
}
//#endregion
//#region Purchase Status Endpoint
paymentApp.get("/purchase-status", async (req, res) => {
    const { userId, courseId } = req.query;
    if (!userId || !courseId) {
        return res.status(400).json({ error: "Missing userId or courseId" });
    }
    try {
        const purchase = await prismadb_1.prismadb.purchase.findFirst({
            where: {
                userId: userId,
                courseId: courseId,
            },
        });
        res.json({ hasPurchase: !!purchase, purchase });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to check purchase status" });
    }
});
//#endregion
//#region Cron Jobs
node_cron_1.default.schedule("0 * * * *", async () => {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    await prismadb_1.prismadb.paystackTransaction.updateMany({
        where: {
            status: "pending",
            createdAt: { lt: thirtyMinutesAgo },
        },
        data: {
            status: "expired",
        },
    });
    await prismadb_1.prismadb.paymentTransaction.updateMany({
        where: {
            status: "pending",
            createdAt: { lt: thirtyMinutesAgo },
        },
        data: {
            status: "expired",
        },
    });
});
node_cron_1.default.schedule("0 9 * * *", async () => {
    const today = new Date();
    // Find installments due in the next 3 days
    const dueInstallments = await prismadb_1.prismadb.paymentInstallment.findMany({
        where: {
            dueDate: {
                lte: new Date(today.getTime() + 3 * 86400000),
                gte: today,
            },
            paid: false,
            lastReminderSent: {
                lt: new Date(today.getTime() - 86400000), // Only send once per day
            },
        },
        include: {
            paymentStatus: {
                include: {
                    user: true,
                    course: true,
                    cohort: true,
                },
            },
        },
    });
    for (const installment of dueInstallments) {
        try {
            const paymentPlan = getPaymentPlan(installment.paymentStatus);
            // Calculate days until due
            const daysUntilDue = Math.ceil((installment.dueDate.getTime() - today.getTime()) / 86400000);
            // const paymentLink = await paystack.transaction
            //   .initialize({
            //     amount: `${installment.amount * 100}`,
            //     email: installment.paymentStatus.user.email!,
            //     metadata: {
            //       installmentId: installment.id,
            //       paymentPlan: paymentPlan,
            //       userId: installment.paymentStatus.userId,
            //       courseId: installment.paymentStatus.courseId,
            //       installmentNumber: installment.installmentNumber,
            //     },
            //     callback_url: process.env.PAYSTACK_CALLBACK_URL,
            //   })
            //   .then((res) => res.data.authorization_url);
            const paymentLink = await (0, paymentService_1.initiateStartButtonPayment)(installment.paymentStatus.user.email, installment.amount * 100, "NGN", {
                installmentId: installment.id,
                paymentPlan: paymentPlan,
                userId: installment.paymentStatus.userId,
                courseId: installment.paymentStatus.courseId,
                installmentNumber: installment.installmentNumber,
            }).then((data) => data.url);
            await (0, mail_1.sendPaymentReminder)(installment.paymentStatus.user.email, installment.paymentStatus.user.name || "Student", installment.paymentStatus.course.title, installment.installmentNumber, installment.dueDate, installment.amount, paymentLink, daysUntilDue);
            await prismadb_1.prismadb.paymentInstallment.update({
                where: { id: installment.id },
                data: { lastReminderSent: new Date() },
            });
        }
        catch (error) {
            console.error(`Reminder failed for installment ${installment.id}:`, error);
        }
    }
});
// Comprehensive Fixed Cron Job - No Premature Deactivation
node_cron_1.default.schedule("0 0 * * *", async () => {
    console.log("Running overdue payment check...");
    try {
        const overduePayments = await prismadb_1.prismadb.paymentInstallment.findMany({
            where: {
                dueDate: { lt: new Date() },
                paid: false,
                paymentStatus: {
                    status: {
                        notIn: [client_1.PaymentStatusType.EXPIRED, client_1.PaymentStatusType.COMPLETE],
                    },
                },
            },
            include: {
                paymentStatus: {
                    include: {
                        course: { include: { cohorts: true } },
                        cohort: true,
                        user: { select: { id: true, name: true, email: true } },
                        paymentInstallments: {
                            orderBy: { installmentNumber: "asc" },
                        },
                    },
                },
            },
        });
        console.log(`Found ${overduePayments.length} potentially overdue installments`);
        for (const installment of overduePayments) {
            try {
                const paymentStatus = installment.paymentStatus;
                const allInstallments = paymentStatus.paymentInstallments;
                const paymentPlan = getPaymentPlan(paymentStatus);
                const cohortStartDate = paymentStatus.cohort?.startDate;
                const now = new Date();
                let shouldDeactivate = false;
                let reason = "";
                // CRITICAL: Only deactivate based on cohort progress, never on absolute dates alone
                if (cohortStartDate) {
                    const cohortHasStarted = now >= cohortStartDate;
                    const daysSinceCohortStart = cohortHasStarted
                        ? Math.floor((now.getTime() - cohortStartDate.getTime()) /
                            (24 * 60 * 60 * 1000))
                        : -1;
                    const monthsSinceCohortStart = Math.floor(daysSinceCohortStart / 30.44);
                    console.log(`Checking user ${paymentStatus.user.email} - Plan: ${paymentPlan}, Installment: ${installment.installmentNumber}, Cohort Started: ${cohortHasStarted}, Days Since Start: ${daysSinceCohortStart}`);
                    if (paymentPlan === PAYMENT_PLANS.FULL_PAYMENT) {
                        // Full payment - should never be deactivated if payment was made
                        shouldDeactivate = false;
                    }
                    else if (paymentPlan === PAYMENT_PLANS.FIRST_HALF_COMPLETE) {
                        // Two installment plan (Half payments)
                        const paidCount = allInstallments.filter((i) => i.paid).length;
                        if (installment.installmentNumber === 1) {
                            // First half - should be paid before cohort starts
                            if (cohortHasStarted && paidCount === 0) {
                                const gracePeriodDays = 7;
                                if (daysSinceCohortStart > gracePeriodDays) {
                                    shouldDeactivate = true;
                                    reason =
                                        "First half payment not made after cohort started + grace period";
                                }
                            }
                        }
                        else if (installment.installmentNumber === 2) {
                            // Second half - due based on secondPaymentDueDate, typically 1 month after first payment
                            if (paymentStatus.secondPaymentDueDate) {
                                const secondPaymentOverdue = now > paymentStatus.secondPaymentDueDate;
                                const gracePeriodDays = 14; // More lenient for second half
                                const gracePeriodEnd = new Date(paymentStatus.secondPaymentDueDate.getTime() +
                                    gracePeriodDays * 24 * 60 * 60 * 1000);
                                if (now > gracePeriodEnd && paidCount < 2) {
                                    shouldDeactivate = true;
                                    reason = "Second half payment overdue after grace period";
                                }
                            }
                        }
                    }
                    else if (paymentPlan === PAYMENT_PLANS.THREE_INSTALLMENTS) {
                        // Three installment plan
                        const paidCount = allInstallments.filter((i) => i.paid).length;
                        if (installment.installmentNumber === 1) {
                            // First installment - should be paid before/at cohort start
                            if (cohortHasStarted && paidCount === 0) {
                                const gracePeriodDays = 7;
                                if (daysSinceCohortStart > gracePeriodDays) {
                                    shouldDeactivate = true;
                                    reason =
                                        "First installment not paid after cohort started + grace period";
                                }
                            }
                        }
                        else if (installment.installmentNumber === 2) {
                            // Second installment - due 1 month AFTER cohort starts
                            if (cohortHasStarted && monthsSinceCohortStart >= 1) {
                                const gracePeriodDays = 14; // 2-week grace for second installment
                                const expectedDueDate = (0, date_fns_1.addMonths)(cohortStartDate, 1);
                                const gracePeriodEnd = new Date(expectedDueDate.getTime() +
                                    gracePeriodDays * 24 * 60 * 60 * 1000);
                                if (now > gracePeriodEnd && paidCount < 2) {
                                    shouldDeactivate = true;
                                    reason =
                                        "Second installment overdue (1 month into cohort + grace period)";
                                }
                            }
                        }
                        else if (installment.installmentNumber === 3) {
                            // Third installment - due 2 months AFTER cohort starts
                            if (cohortHasStarted && monthsSinceCohortStart >= 2) {
                                const gracePeriodDays = 21; // 3-week grace for final installment
                                const expectedDueDate = (0, date_fns_1.addMonths)(cohortStartDate, 2);
                                const gracePeriodEnd = new Date(expectedDueDate.getTime() +
                                    gracePeriodDays * 24 * 60 * 60 * 1000);
                                if (now > gracePeriodEnd && paidCount < 3) {
                                    shouldDeactivate = true;
                                    reason =
                                        "Final installment overdue (2 months into cohort + grace period)";
                                }
                            }
                        }
                    }
                    else if (paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS) {
                        // Four installment plan
                        const paidCount = allInstallments.filter((i) => i.paid).length;
                        if (installment.installmentNumber === 1) {
                            // Seat reservation - should be paid before cohort starts
                            if (cohortHasStarted && paidCount === 0) {
                                const gracePeriodDays = 7;
                                if (daysSinceCohortStart > gracePeriodDays) {
                                    shouldDeactivate = true;
                                    reason =
                                        "Seat reservation not paid after cohort started + grace period";
                                }
                            }
                        }
                        else if (installment.installmentNumber === 2) {
                            // Cohort access - due AT cohort start
                            if (cohortHasStarted) {
                                const gracePeriodDays = 7; // Short grace for cohort access
                                if (daysSinceCohortStart > gracePeriodDays && paidCount < 2) {
                                    shouldDeactivate = true;
                                    reason = "Cohort access payment not made after grace period";
                                }
                            }
                        }
                        else if (installment.installmentNumber === 3) {
                            // Month 1 payment - due 1 month AFTER cohort starts
                            if (cohortHasStarted && monthsSinceCohortStart >= 1) {
                                const gracePeriodDays = 14;
                                const expectedDueDate = (0, date_fns_1.addMonths)(cohortStartDate, 1);
                                const gracePeriodEnd = new Date(expectedDueDate.getTime() +
                                    gracePeriodDays * 24 * 60 * 60 * 1000);
                                if (now > gracePeriodEnd && paidCount < 3) {
                                    shouldDeactivate = true;
                                    reason =
                                        "Month 1 payment overdue (1 month into cohort + grace period)";
                                }
                            }
                        }
                        else if (installment.installmentNumber === 4) {
                            // Month 2 payment - due 2 months AFTER cohort starts
                            if (cohortHasStarted && monthsSinceCohortStart >= 2) {
                                const gracePeriodDays = 21; // More grace for final payment
                                const expectedDueDate = (0, date_fns_1.addMonths)(cohortStartDate, 2);
                                const gracePeriodEnd = new Date(expectedDueDate.getTime() +
                                    gracePeriodDays * 24 * 60 * 60 * 1000);
                                if (now > gracePeriodEnd && paidCount < 4) {
                                    shouldDeactivate = true;
                                    reason =
                                        "Final payment overdue (2 months into cohort + grace period)";
                                }
                            }
                        }
                    }
                }
                else {
                    // Fallback for payments without cohort assignment (edge case)
                    console.log(`Warning: Payment status ${paymentStatus.id} has no cohort assigned`);
                    // Very lenient fallback - only deactivate if REALLY overdue
                    const daysPastDue = Math.floor((now.getTime() - installment.dueDate.getTime()) /
                        (24 * 60 * 60 * 1000));
                    if (daysPastDue > 30) {
                        // 30-day grace for edge cases
                        shouldDeactivate = true;
                        reason = "No cohort assigned and payment overdue by 30+ days";
                    }
                }
                if (shouldDeactivate) {
                    console.log(`🚫 DEACTIVATING user ${paymentStatus.user.email} - Reason: ${reason}`);
                    let nextCohort = null;
                    await prismadb_1.prismadb.$transaction([
                        prismadb_1.prismadb.user.update({
                            where: { id: paymentStatus.userId },
                            data: { inactive: true },
                        }),
                        prismadb_1.prismadb.paymentStatus.update({
                            where: { id: paymentStatus.id },
                            data: { status: client_1.PaymentStatusType.EXPIRED },
                        }),
                    ]);
                    // Move to next available cohort
                    if (paymentStatus.cohort) {
                        nextCohort = paymentStatus.course.cohorts
                            .filter((c) => c.startDate > paymentStatus.cohort.startDate)
                            .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
                        if (nextCohort) {
                            await prismadb_1.prismadb.userCohort.updateMany({
                                where: {
                                    userId: paymentStatus.userId,
                                    courseId: paymentStatus.courseId,
                                },
                                data: { cohortId: nextCohort.id },
                            });
                            console.log(`➡️  Moved user to next cohort: ${nextCohort.name}`);
                        }
                    }
                    // Send deactivation notification email
                    try {
                        const overdueDays = Math.floor((now.getTime() - installment.dueDate.getTime()) /
                            (24 * 60 * 60 * 1000));
                        await (0, mail_1.sendAccountDeactivationNotification)(paymentStatus.user.email, paymentStatus.user.name || "Student", paymentStatus.course.title, paymentPlan || "Unknown Plan", overdueDays, installment.installmentNumber, nextCohort?.startDate);
                    }
                    catch (emailError) {
                        console.error(`Failed to send deactivation email to ${paymentStatus.user.email}:`, emailError);
                    }
                }
                else {
                    console.log(`✅ User ${paymentStatus.user.email} installment ${installment.installmentNumber} - No deactivation needed`);
                }
            }
            catch (error) {
                console.error(`❌ Overdue handling failed for installment ${installment.id}:`, error);
            }
        }
        console.log("✅ Overdue payment check completed");
    }
    catch (error) {
        console.error("❌ Overdue payment cron job failed:", error);
    }
});
//safety cron job - runs weekly to catch any incorrectly deactivated users
node_cron_1.default.schedule("0 3 * * 1", async () => {
    // Monday 3 AM
    console.log("🔍 Running weekly payment status audit...");
    try {
        // Find recently deactivated users who might have been incorrectly processed
        const recentlyDeactivated = await prismadb_1.prismadb.user.findMany({
            where: {
                inactive: true,
                updatedAt: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                },
            },
            include: {
                paymentStatus: {
                    where: {
                        status: client_1.PaymentStatusType.EXPIRED,
                    },
                    include: {
                        cohort: true,
                        paymentInstallments: {
                            orderBy: { installmentNumber: "asc" },
                        },
                    },
                },
            },
        });
        for (const user of recentlyDeactivated) {
            for (const paymentStatus of user.paymentStatus) {
                const paidCount = paymentStatus.paymentInstallments.filter((i) => i.paid).length;
                const totalInstallments = paymentStatus.paymentInstallments.length;
                const paymentPlan = getPaymentPlan(paymentStatus);
                const cohortStartDate = paymentStatus.cohort?.startDate;
                // Flag suspicious deactivations for manual review
                let suspicious = false;
                let suspiciousReason = "";
                if (cohortStartDate && cohortStartDate > new Date()) {
                    // Cohort hasn't started yet but user was deactivated
                    suspicious = true;
                    suspiciousReason = "Deactivated before cohort started";
                }
                else if (paidCount > 0 && paidCount === totalInstallments) {
                    // All installments paid but still deactivated
                    suspicious = true;
                    suspiciousReason = "All installments paid but deactivated";
                }
                else if (paymentPlan === PAYMENT_PLANS.FULL_PAYMENT) {
                    // Full payment users should never be deactivated
                    suspicious = true;
                    suspiciousReason = "Full payment user deactivated";
                }
                if (suspicious) {
                    console.log(`🚨 SUSPICIOUS DEACTIVATION: User ${user.email} - ${suspiciousReason} - Needs manual review`);
                    // Send alert email for wrongful deactivation
                    try {
                        await (0, mail_1.sendWrongfulDeactivationAlert)(user.email, user.name || "Student", paymentStatus.cohort?.name || "Unknown Course", paymentPlan || "Unknown Plan", suspiciousReason, user.email);
                    }
                    catch (emailError) {
                        console.error(`Failed to send wrongful deactivation alert for ${user.email}:`, emailError);
                    }
                }
            }
        }
        console.log("✅ Weekly audit completed");
    }
    catch (error) {
        console.error("❌ Weekly audit failed:", error);
    }
});
//#endregion
//#region Admin Tracking
const convertBigIntToNumber = (obj) => {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (typeof obj === "bigint") {
        return Number(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(convertBigIntToNumber);
    }
    if (typeof obj === "object") {
        const converted = {};
        for (const [key, value] of Object.entries(obj)) {
            converted[key] = convertBigIntToNumber(value);
        }
        return converted;
    }
    return obj;
};
paymentApp.get("/admin/payments", async (req, res) => {
    try {
        const { status, paymentPlan, courseId, cohortId, search, page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc", } = req.query;
        const where = {};
        if (status)
            where.status = status;
        if (paymentPlan)
            where.paymentPlan = paymentPlan;
        if (courseId)
            where.courseId = courseId;
        if (cohortId)
            where.cohortId = cohortId;
        if (search) {
            where.OR = [
                {
                    user: {
                        name: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                },
                {
                    user: {
                        email: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                },
            ];
        }
        const payments = await prismadb_1.prismadb.paymentStatus.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone_number: true,
                    },
                },
                course: {
                    select: {
                        id: true,
                        title: true,
                        price: true,
                    },
                },
                cohort: {
                    select: {
                        id: true,
                        name: true,
                        startDate: true,
                        endDate: true,
                    },
                },
                paymentInstallments: {
                    orderBy: {
                        installmentNumber: "asc",
                    },
                },
            },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
            orderBy: {
                [sortBy]: sortOrder,
            },
        });
        const total = await prismadb_1.prismadb.paymentStatus.count({ where });
        const metricsRaw = await prismadb_1.prismadb.$queryRaw `
      SELECT 
        COUNT(*) as "totalPayments",
        SUM(CASE WHEN status = 'COMPLETE' THEN 1 ELSE 0 END) as "completedPayments",
        SUM(CASE WHEN status = 'BALANCE_HALF_PAYMENT' THEN 1 ELSE 0 END) as "pendingPayments",
        SUM(CASE WHEN status = 'PENDING_SEAT_CONFIRMATION' THEN 1 ELSE 0 END) as "pendingSeatConfirmations",
        SUM(CASE WHEN status = 'EXPIRED' THEN 1 ELSE 0 END) as "expiredPayments"
      FROM "PaymentStatus"
    `;
        const metrics = convertBigIntToNumber(metricsRaw[0]);
        res.json({
            data: payments,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                totalPages: Math.ceil(total / Number(limit)),
            },
            metrics,
        });
    }
    catch (error) {
        console.error("Error fetching payment data:", error);
        res.status(500).json({
            error: "Failed to fetch payment data",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
paymentApp.get("/admin/payments/stats", async (req, res) => {
    try {
        const totalRevenueRaw = await prismadb_1.prismadb.$queryRaw `
      SELECT 
        SUM(CASE 
          WHEN ps."paymentPlan" = 'FULL_PAYMENT' THEN COALESCE(NULLIF(REPLACE(c.price, ',', ''), '')::NUMERIC, ${TOTAL_COURSE_FEE})
          WHEN ps."paymentPlan" = 'FIRST_HALF_COMPLETE' AND ps.status = 'COMPLETE' THEN COALESCE(NULLIF(REPLACE(c.price, ',', ''), '')::NUMERIC, ${TOTAL_COURSE_FEE})
          WHEN ps."paymentPlan" = 'FIRST_HALF_COMPLETE' AND ps.status = 'BALANCE_HALF_PAYMENT' THEN COALESCE(NULLIF(REPLACE(c.price, ',', ''), '')::NUMERIC / 2, ${TOTAL_COURSE_FEE / 2})
          WHEN ps."paymentPlan" = 'FOUR_INSTALLMENTS' THEN (
            SELECT COALESCE(SUM(amount), 0)
            FROM "PaymentInstallment" 
            WHERE "paymentStatusId" = ps.id AND paid = true
          )
          ELSE 0
        END) as total
      FROM "PaymentStatus" ps
      LEFT JOIN "Course" c ON ps."courseId" = c.id
      WHERE ps.status != 'EXPIRED'
    `;
        const revenueByTypeRaw = await prismadb_1.prismadb.$queryRaw `
      SELECT 
        ps."paymentPlan",
        SUM(CASE 
          WHEN ps."paymentPlan" = 'FULL_PAYMENT' THEN COALESCE(NULLIF(REPLACE(c.price, ',', ''), '')::NUMERIC, ${TOTAL_COURSE_FEE})
          WHEN ps."paymentPlan" = 'FIRST_HALF_COMPLETE' AND ps.status = 'COMPLETE' THEN COALESCE(NULLIF(REPLACE(c.price, ',', ''), '')::NUMERIC, ${TOTAL_COURSE_FEE})
          WHEN ps."paymentPlan" = 'FIRST_HALF_COMPLETE' AND ps.status = 'BALANCE_HALF_PAYMENT' THEN COALESCE(NULLIF(REPLACE(c.price, ',', ''), '')::NUMERIC / 2, ${TOTAL_COURSE_FEE / 2})
          WHEN ps."paymentPlan" = 'FOUR_INSTALLMENTS' THEN (
            SELECT COALESCE(SUM(amount), 0)
            FROM "PaymentInstallment" 
            WHERE "paymentStatusId" = ps.id AND paid = true
          )
          ELSE 0
        END) as revenue,
        COUNT(*) as count
      FROM "PaymentStatus" ps
      LEFT JOIN "Course" c ON ps."courseId" = c.id
      WHERE ps.status != 'EXPIRED'
      GROUP BY ps."paymentPlan"
    `;
        const revenueByCourseRaw = await prismadb_1.prismadb.$queryRaw `
      SELECT 
        c.id,
        c.title,
        SUM(CASE 
          WHEN ps."paymentPlan" = 'FULL_PAYMENT' THEN COALESCE(NULLIF(REPLACE(c.price, ',', ''), '')::NUMERIC, ${TOTAL_COURSE_FEE})
          WHEN ps."paymentPlan" = 'FIRST_HALF_COMPLETE' AND ps.status = 'COMPLETE' THEN COALESCE(NULLIF(REPLACE(c.price, ',', ''), '')::NUMERIC, ${TOTAL_COURSE_FEE})
          WHEN ps."paymentPlan" = 'FIRST_HALF_COMPLETE' AND ps.status = 'BALANCE_HALF_PAYMENT' THEN COALESCE(NULLIF(REPLACE(c.price, ',', ''), '')::NUMERIC / 2, ${TOTAL_COURSE_FEE / 2})
          WHEN ps."paymentPlan" = 'FOUR_INSTALLMENTS' THEN (
            SELECT COALESCE(SUM(amount), 0)
            FROM "PaymentInstallment" 
            WHERE "paymentStatusId" = ps.id AND paid = true
          )
          ELSE 0
        END) as revenue,
        COUNT(*) as count
      FROM "PaymentStatus" ps
      JOIN "Course" c ON ps."courseId" = c.id
      WHERE ps.status != 'EXPIRED'
      GROUP BY c.id, c.title
      ORDER BY revenue DESC
      LIMIT 5
    `;
        const totalRevenue = convertBigIntToNumber(totalRevenueRaw[0]?.total ?? 0);
        const revenueByType = convertBigIntToNumber(revenueByTypeRaw);
        const revenueByCourse = convertBigIntToNumber(revenueByCourseRaw);
        res.json({
            totalRevenue,
            revenueByType,
            revenueByCourse,
        });
    }
    catch (error) {
        console.error("Error fetching payment stats:", error);
        res.status(500).json({
            error: "Failed to fetch payment stats",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
exports.default = paymentApp;
//# sourceMappingURL=index.js.map