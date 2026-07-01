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
exports.processSuccessfulPaymentTransaction = processSuccessfulPaymentTransaction;
const express_1 = __importDefault(require("express"));
const prismadb_1 = require("../../lib/prismadb");
const paystack_sdk_1 = require("paystack-sdk");
const client_1 = require("@prisma/client");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mail_1 = require("./mail");
const node_cron_1 = __importDefault(require("node-cron"));
const date_fns_1 = require("date-fns");
const payment_config_1 = require("../../utils/payment-config");
const notification_service_1 = require("../../services/notification.service");
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
const logPaymentError = (message, data = {}) => {
    console.error(`[PAYMENT_ERROR] ${message}`, JSON.stringify(data, null, 2));
};
// Constants from environment
const TOTAL_COURSE_FEE = Number(process.env.TOTAL_COURSE_FEE) || 250000;
async function getCourseDetails(courseId) {
    return prismadb_1.prismadb.course.findUniqueOrThrow({
        where: { id: courseId },
        select: {
            id: true,
            title: true,
            price: true,
            discount: true,
            pricingPlans: true,
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
    if (paymentPlan === payment_config_1.PAYMENT_PLANS.FULL_PAYMENT) {
        isPaymentActive = true;
    }
    else if (paymentPlan === payment_config_1.PAYMENT_PLANS.FIRST_HALF_COMPLETE) {
        isPaymentActive = true;
    }
    else if (paymentPlan === payment_config_1.PAYMENT_PLANS.FOUR_INSTALLMENTS) {
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
//#endregion
paymentApp.post("/convert-ngn-to-other-currencies", async (req, res) => {
    const { currency, amountInNGN } = req.body;
    const result = await (0, payment_config_1.convertNairaToOtherCurrency)(currency, amountInNGN);
    if (!result.status)
        return res.status(500).json({
            status: "failed",
            error: "Failed to process currency conversion",
        });
    return res.json(result);
});
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
                    cohort: {
                        select: { id: true, name: true },
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
        const isMultiInstallment = [
            payment_config_1.PAYMENT_PLANS.TWO_INSTALLMENTS,
            payment_config_1.PAYMENT_PLANS.THREE_INSTALLMENTS,
            payment_config_1.PAYMENT_PLANS.FOUR_INSTALLMENTS,
            payment_config_1.PAYMENT_PLANS.FIVE_INSTALLMENTS,
        ].includes(paymentPlan);
        if (paymentPlan === payment_config_1.PAYMENT_PLANS.FIRST_HALF_COMPLETE &&
            paymentStatus.status === client_1.PaymentStatusType.BALANCE_HALF_PAYMENT) {
            remainingAmount = halfFee;
        }
        else if (isMultiInstallment) {
            // Sum of all unpaid installment amounts — the true remaining balance
            remainingAmount = paymentStatus.paymentInstallments
                .filter((i) => !i.paid)
                .reduce((sum, i) => sum + i.amount, 0);
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
    const { userId, courseId, planType, channels, paymentGateway, currency, paymentMethods, } = req.query;
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
            const paymentData = getPaymentData(planType, cohortName, course);
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
            const conversionData = await (0, payment_config_1.convertNairaToOtherCurrency)(currency, paymentData.amount);
            if (conversionData?.status !== "success") {
                return res.status(400).json({ error: conversionData.status });
            }
            const metadata = {
                ...paymentData.metadata,
                userId,
                courseId,
                ...paymentData.callbackParams,
                selectedCurrency: currency,
                currencyAmount: conversionData.amount,
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
                        transactionRef: paymentLink?.data?.reference,
                        userId: userId,
                        courseId: courseId,
                        amount: paymentData.amount.toString(),
                        status: "pending",
                        authorizationUrl: paymentLink?.data?.authorization_url,
                        paymentPlan: paymentData.callbackParams.paymentPlan,
                        metadata: JSON.stringify(metadata),
                        paymentGateway: "PAYSTACK",
                        paymentDate: new Date(),
                    },
                });
                return res.json({
                    authorizationUrl: paymentLink?.data?.authorization_url,
                    exists: true,
                    isNew: true,
                });
            }
            else {
                const paymentLink = await (0, payment_config_1.initiateStartButtonPayment)(user?.email || "", (conversionData?.amount || 0) * 100, currency || "NGN", metadata, paymentMethods);
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
                        metadata: JSON.stringify(metadata),
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
        //   41200,
        //   "GHS",
        //   { userId: "748374H43Jsadaa" },
        //   ["card", "mobile_money"],
        // );
        // const converted = await convertNairaToOtherCurrency("GHS", 40000);
        // const paymentData = await verifyPayment("DIR83XPPL4D");
        // return res.status(200).json({ paymentData });
        const results = await prismadb_1.prismadb.paymentStatus.findMany({
            orderBy: { createdAt: "desc" },
            take: 40,
            include: {
                user: true,
                paymentInstallments: true,
                cohort: true,
            },
        });
        res.status(200).json({ results });
    }
    catch (error) {
        console.log("Start Button Error: " + error);
        return res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : String(error),
        });
    }
});
//#region Payment Initialization Endpoints
paymentApp.post("/initiate-payment", async (req, res) => {
    const { courseId, userId, planType, cohortName, isIWD, applicationId, amount, channels, installmentNumber, paymentGateway, currency, } = req.body;
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
        let existingPayment = userId
            ? await prismadb_1.prismadb.paymentStatus.findUnique({
                where: { userId_courseId: { userId, courseId } },
                include: { paymentInstallments: true },
            })
            : null;
        // Reset layout if they previously started a different plan but haven't actually paid yet
        if (existingPayment &&
            existingPayment.status === "PENDING_SEAT_CONFIRMATION") {
            await prismadb_1.prismadb.paymentStatus.delete({
                where: { id: existingPayment.id },
            });
            existingPayment = null;
        }
        const paymentData = getPaymentData(planType, cohortName, course);
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
        const conversionData = await (0, payment_config_1.convertNairaToOtherCurrency)(currency, paymentData.amount);
        if (conversionData?.status !== "success") {
            return res.status(400).json({ error: conversionData.status });
        }
        const metadata = {
            ...paymentData.metadata,
            userId,
            courseId,
            isIWD,
            applicationId,
            ...paymentData.callbackParams,
            selectedCurrency: currency,
            currencyAmount: conversionData.amount,
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
                url: paystackLink?.data?.authorization_url,
                reference: paystackLink?.data?.reference,
            };
        }
        else {
            const startButtonLink = await (0, payment_config_1.initiateStartButtonPayment)(email, (conversionData?.amount || 0) * 100, currency || "NGN", metadata, channels);
            if (!startButtonLink?.url) {
                console.log("Start button payment link error", startButtonLink);
                res.status(422).json({
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
            let newPaymentStatus = null;
            if (userId && !existingPayment) {
                newPaymentStatus = await createPaymentStatus(tx, {
                    userId,
                    courseId,
                    paymentData,
                    planType,
                    cohortName,
                    course,
                });
            }
            return tx.paymentTransaction.create({
                data: {
                    transactionRef: paymentLink.reference,
                    paymentGateway: paymentGateway,
                    paymentStatusId: !existingPayment?.id
                        ? newPaymentStatus?.id
                        : existingPayment?.id,
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
                        // ✅ Persist installmentNumber so verification uses the correct installment
                        installmentNumber: installmentNumber ??
                            paymentData.callbackParams.installmentNumber ??
                            1,
                        cohortName,
                        selectedCurrency: currency,
                        currencyAmount: conversionData.amount,
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
 * Build payment data for a given plan type using dynamic pricing plans.
 */
function getPaymentData(planType, cohortName, course) {
    // Find the specific plan for this course
    const plan = course.pricingPlans.find((p) => p.planType === planType);
    if (!plan) {
        // Fallback for legacy "FULL" or "HALF" if they don't have pricingPlans yet
        if (planType === "FULL") {
            const fee = parseCoursePrice(course.price);
            return {
                amount: fee,
                metadata: { planType: "FULL_PAYMENT", cohortName },
                callbackParams: { paymentPlan: payment_config_1.PAYMENT_PLANS.FULL_PAYMENT, cohortName },
            };
        }
        return null;
    }
    return {
        amount: plan.amountPerInstallment,
        metadata: {
            planType: plan.planType,
            cohortName,
            installmentsCount: plan.installmentsCount,
            amountPerInstallment: plan.amountPerInstallment,
        },
        callbackParams: {
            paymentPlan: plan.planType,
            installmentNumber: 1,
            cohortName,
        },
    };
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
    const plan = params.course.pricingPlans.find((p) => p.planType === params.planType);
    if (plan && plan.installmentsCount > 1) {
        createData.desiredStartDate = cohort.actualStartDate;
        const actualStartDate = cohort.actualStartDate;
        const installments = [];
        // Logic for 2 installments: 1 now, 1 1 month into program
        if (plan.installmentsCount === 2) {
            installments.push({
                amount: plan.amountPerInstallment,
                dueDate: new Date(),
                installmentNumber: 1,
            });
            installments.push({
                amount: plan.amountPerInstallment,
                dueDate: (0, date_fns_1.addMonths)(actualStartDate, 1),
                installmentNumber: 2,
            });
        }
        else {
            // Logic for 3+ installments:
            // 1: Now (secures spot)
            // 2: Before cohort start (actualStartDate)
            // 3+: Monthly from 1 month into program
            installments.push({
                amount: plan.amountPerInstallment,
                dueDate: new Date(),
                installmentNumber: 1,
            });
            installments.push({
                amount: plan.amountPerInstallment,
                dueDate: actualStartDate,
                installmentNumber: 2,
            });
            for (let i = 3; i <= plan.installmentsCount; i++) {
                installments.push({
                    amount: plan.amountPerInstallment,
                    dueDate: (0, date_fns_1.addMonths)(actualStartDate, i - 2),
                    installmentNumber: i,
                });
            }
        }
        createData.paymentInstallments = {
            create: installments,
        };
    }
    return tx.paymentStatus.create({ data: createData });
}
async function verifyPayment(reference) {
    if (!reference)
        return { error: "Payment reference is required" };
    const existingTx = await prismadb_1.prismadb.paymentTransaction.findUnique({
        where: { transactionRef: reference },
        include: {
            paymentStatus: {
                include: {
                    paymentInstallments: {
                        orderBy: { installmentNumber: "asc" },
                    },
                    course: true,
                    cohort: true,
                    user: {
                        select: { id: true, inactive: true },
                    },
                },
            },
        },
    });
    if (!existingTx) {
        return { error: "Transaction not found" };
    }
    if (existingTx.status === "success") {
        return {
            status: "success",
            data: existingTx,
            message: "Payment already processed",
        };
    }
    const [userPaymentStatus, course, user] = await Promise.all([
        prismadb_1.prismadb.paymentStatus.findUnique({
            where: {
                userId_courseId: {
                    userId: existingTx.userId,
                    courseId: existingTx.courseId,
                },
            },
            include: { paymentInstallments: true },
        }),
        prismadb_1.prismadb.course.findUnique({
            where: { id: existingTx.courseId },
            select: {
                title: true,
                id: true,
            },
        }),
        prismadb_1.prismadb.user.findUnique({
            where: { id: existingTx.userId },
            select: {
                name: true,
                email: true,
                id: true,
            },
        }),
    ]);
    if (existingTx.paymentGateway === "PAYSTACK") {
        const verification = await paystack.transaction.verify(reference);
        if (verification?.data?.status !== "success") {
            await prismadb_1.prismadb.paymentTransaction.update({
                where: { transactionRef: reference },
                data: {
                    status: "failed",
                    updatedAt: new Date(),
                },
            });
            return {
                status: "error",
                error: "Payment not successful",
            };
        }
    }
    else {
        const startButtonVerification = await (0, payment_config_1.verifyStartButtonTransaction)(reference);
        const paymentStatus = startButtonVerification?.transaction?.status;
        if (paymentStatus !== "successful" && paymentStatus !== "verified") {
            await prismadb_1.prismadb.paymentTransaction.update({
                where: { transactionRef: reference },
                data: {
                    status: "failed",
                    updatedAt: new Date(),
                },
            });
            return {
                status: "error",
                error: "Payment not successful",
            };
        }
    }
    const result = await prismadb_1.prismadb.$transaction(async (tx) => processSuccessfulPaymentTransaction(tx, {
        transactionRef: reference,
    }), {
        maxWait: 30000,
        timeout: 30000,
    });
    try {
        const metadata = JSON.parse(result.metadata || "{}");
        if (metadata.planType !== "FULL_PAYMENT" && metadata.planType !== "FULL") {
            const installments = userPaymentStatus?.paymentInstallments ?? [];
            const paidInstallments = installments.filter((i) => i.paid);
            const unpaidInstallments = installments.filter((i) => !i.paid);
            const totalPaid = paidInstallments.reduce((s, i) => s + i.amount, 0);
            const totalRemaining = unpaidInstallments.reduce((s, i) => s + i.amount, 0);
            console.log(`Installment payment summary for user ${user?.id} - Paid: ${totalPaid}, Remaining: ${totalRemaining}`);
            await Promise.all([
                await (0, mail_1.sendPaymentConfirmationEmail)({
                    amountPaid: `${payment_config_1.currenciesInfo.NGN.symbol}${Number(existingTx.amount).toLocaleString()}${metadata.selectedCurrency && metadata.selectedCurrency !== "NGN" ? ` (${payment_config_1.currenciesInfo[metadata.selectedCurrency]?.symbol} ${metadata.currencyAmount.toLocaleString()})` : ""}`,
                    courseAccessLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
                    courseTitle: course?.title || "",
                    paymentType: "installment",
                    currentInstallment: metadata.installmentNumber || 1,
                    remainingBalance: totalRemaining > 0
                        ? `${payment_config_1.currenciesInfo.NGN.symbol}${totalRemaining.toLocaleString()}`
                        : "0",
                    totalAmountPaid: `${payment_config_1.currenciesInfo.NGN.symbol}${Number(totalPaid).toLocaleString()}`,
                    totalInstallments: metadata.installmentsCount || 1,
                    paymentDate: (0, date_fns_1.format)(new Date(existingTx.paymentDate || ""), "d MMM yyyy"),
                    userEmail: user?.email || "",
                    userName: user?.name || "Student",
                }),
                await notification_service_1.NotificationService.create({
                    type: "COURSE_ADDED",
                    userId: user?.id || "",
                    payload: {
                        cohortId: existingTx?.paymentStatus?.cohortId || undefined,
                        cohortName: existingTx?.paymentStatus?.cohort?.name,
                        courseTitle: course?.title,
                        courseId: course?.id,
                        paymentStatusId: existingTx.paymentStatusId,
                        paymentTransactionId: existingTx.id,
                        actionUrl: `/dashboard/lessons/${course?.id}`,
                    },
                }),
            ]);
        }
        else {
            await Promise.all([
                await (0, mail_1.sendPaymentConfirmationEmail)({
                    amountPaid: `${payment_config_1.currenciesInfo.NGN.symbol}${Number(existingTx.amount).toLocaleString()}${metadata.selectedCurrency && metadata.selectedCurrency !== "NGN" ? ` (${payment_config_1.currenciesInfo[metadata.selectedCurrency]?.symbol} ${metadata.currencyAmount.toLocaleString()})` : ""}`,
                    courseAccessLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
                    courseTitle: course?.title || "",
                    paymentType: "one_time",
                    paymentDate: (0, date_fns_1.format)(new Date(existingTx.paymentDate || ""), "d MMM yyyy"),
                    userEmail: user?.email || "",
                    userName: user?.name || "Student",
                }),
                await notification_service_1.NotificationService.create({
                    type: "COURSE_ADDED",
                    userId: user?.id || "",
                    payload: {
                        cohortId: existingTx?.paymentStatus?.cohortId || undefined,
                        cohortName: existingTx?.paymentStatus?.cohort?.name,
                        courseTitle: course?.title,
                        courseId: course?.id,
                        paymentStatusId: existingTx.paymentStatusId,
                        paymentTransactionId: existingTx.id,
                        actionUrl: `/dashboard/lessons/${course?.id}`,
                    },
                }),
            ]);
        }
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
    return {
        status: "success",
        data: result,
        ...tokens,
        userReactivated: existingTx.paymentStatus?.user?.inactive,
    };
}
//#region Payment Callback
paymentApp.get("/payment/callback", async (req, res) => {
    const { reference } = req.query;
    try {
        const verification = await paystack.transaction.verify(reference);
        if (verification?.data?.status === "success") {
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
        const verification = await (0, payment_config_1.verifyStartButtonTransaction)(reference);
        if (verification.transaction?.status === "successful" ||
            verification.transaction?.status === "success" ||
            verification.transaction?.status === "verified") {
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
paymentApp.get("/verify", async (req, res) => {
    const { reference } = req.query;
    if (!reference) {
        return res.status(400).json({ error: "Missing reference parameter" });
    }
    try {
        const verificationResponse = await verifyPayment(reference);
        if (verificationResponse.status === "successful" ||
            verificationResponse.status === "success" ||
            verificationResponse.status === "verified") {
            return res.json(verificationResponse);
        }
        else if (verificationResponse) {
            return res.status(422).json(verificationResponse);
        }
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
paymentApp.post("/start-button/webhook", async (req, res) => {
    const { event, data } = req.body;
    try {
        if (!data.transaction?.id) {
            return res
                .status(400)
                .json({ error: "Invalid expected start button data" });
        }
        console.log(`Start Button Webhook Triggered [${data?.transaction.createdAt}]: ${data.transaction?.transactionReference} - ${event}`);
        if (event === "collection.completed") {
            const verifiedTransaction = await verifyPayment(data.transaction?.transactionReference);
            if (verifiedTransaction.status === "success" ||
                verifiedTransaction.status === "successful" ||
                verifiedTransaction.status === "verified") {
                console.log(`Start Button Webhook Payment Successful [${data?.transaction.createdAt}]: ${data.transaction?.transactionReference}`);
                res.json(verifiedTransaction);
            }
        }
    }
    catch (err) {
        console.error("Start button webhook error: ", err);
        return res.status(500).json({
            status: "error",
            error: "Start button webhook failed",
            details: err instanceof Error ? err.message : "Unknown error",
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
async function processSuccessfulPaymentTransaction(tx, params) {
    const existingTx = await tx.paymentTransaction.findUnique({
        where: { transactionRef: params.transactionRef },
        include: {
            paymentStatus: {
                include: {
                    paymentInstallments: {
                        orderBy: { installmentNumber: "asc" },
                    },
                    course: true,
                    cohort: true,
                    user: {
                        select: {
                            id: true,
                            inactive: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            },
        },
    });
    if (!existingTx) {
        throw new Error("Transaction not found");
    }
    if (existingTx.status === "success") {
        return existingTx;
    }
    const metadata = JSON.parse(existingTx.metadata || "{}");
    const paymentStatus = existingTx.paymentStatusId
        ? await tx.paymentStatus.findUnique({
            where: { id: existingTx.paymentStatusId },
            include: {
                paymentInstallments: {
                    orderBy: { installmentNumber: "asc" },
                },
                cohort: true,
                user: true,
                course: true,
            },
        })
        : await tx.paymentStatus.findUnique({
            where: {
                userId_courseId: {
                    userId: existingTx.userId,
                    courseId: existingTx.courseId,
                },
            },
            include: {
                paymentInstallments: {
                    orderBy: { installmentNumber: "asc" },
                },
                cohort: true,
                user: true,
                course: true,
            },
        });
    if (!paymentStatus) {
        throw new Error("Linked payment status not found");
    }
    let updatedTx = await tx.paymentTransaction.update({
        where: { transactionRef: params.transactionRef },
        data: {
            paymentStatusId: paymentStatus.id,
            status: "success",
            paymentDate: params.verifiedAt || new Date(),
            updatedAt: new Date(),
            metadata: JSON.stringify({
                ...metadata,
                manuallyMarkedPaid: params.skipExternalVerification || false,
                markedPaidBy: params.markedBy,
                manualReason: params.manualReason,
                markedPaidAt: new Date().toISOString(),
            }),
        },
    });
    let userId = updatedTx.userId;
    if (userId !== "IWD_PENDING") {
        const user = await tx.user.findUnique({
            where: { id: userId },
            select: { inactive: true },
        });
        if (user?.inactive) {
            await tx.user.update({
                where: { id: userId },
                data: { inactive: false },
            });
        }
    }
    const paymentPlan = await getPaymentPlanFromRecord(updatedTx);
    switch (paymentPlan) {
        case payment_config_1.PAYMENT_PLANS.FULL_PAYMENT:
            await handleFullPayment(tx, {
                userId,
                courseId: updatedTx.courseId,
                reference: params.transactionRef,
            });
            break;
        case payment_config_1.PAYMENT_PLANS.FIRST_HALF_COMPLETE:
            await handleFirstHalfPayment(tx, {
                userId,
                courseId: updatedTx.courseId,
                reference: params.transactionRef,
            });
            break;
        case payment_config_1.PAYMENT_PLANS.SECOND_HALF_PAYMENT:
            await handleSecondHalfPayment(tx, {
                userId,
                courseId: updatedTx.courseId,
                reference: params.transactionRef,
            });
            break;
        case payment_config_1.PAYMENT_PLANS.TWO_INSTALLMENTS:
        case payment_config_1.PAYMENT_PLANS.THREE_INSTALLMENTS:
        case payment_config_1.PAYMENT_PLANS.FOUR_INSTALLMENTS:
        case payment_config_1.PAYMENT_PLANS.FIVE_INSTALLMENTS:
            await handleInstallmentPayment(tx, {
                userId,
                courseId: updatedTx.courseId,
                installmentNumber: metadata.installmentNumber || 1,
                paymentPlan,
                reference: params.transactionRef,
            }, Number(updatedTx.amount));
            break;
        default:
            throw new Error(`Unsupported payment plan: ${paymentPlan}`);
    }
    const existingPurchase = await tx.purchase.findFirst({
        where: {
            userId,
            courseId: updatedTx.courseId,
        },
    });
    if (!existingPurchase) {
        await tx.purchase.create({
            data: {
                userId,
                courseId: updatedTx.courseId,
            },
        });
    }
    return updatedTx;
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
        const cohort = await assignToSelectedCohort(tx, metadata.userId, metadata.courseId, cohortName, payment_config_1.PAYMENT_PLANS.FULL_PAYMENT);
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
                    paymentPlan: payment_config_1.PAYMENT_PLANS.FULL_PAYMENT,
                    status: client_1.PaymentStatusType.COMPLETE,
                    cohortId: cohort.cohortId,
                },
            });
        }
        return tx.paymentStatus.create({
            data: {
                userId: metadata.userId,
                courseId: metadata.courseId,
                paymentPlan: payment_config_1.PAYMENT_PLANS.FULL_PAYMENT,
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
        const cohort = await assignToSelectedCohort(tx, metadata.userId, metadata.courseId, cohortName, payment_config_1.PAYMENT_PLANS.FIRST_HALF_COMPLETE);
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
                    paymentPlan: payment_config_1.PAYMENT_PLANS.FIRST_HALF_COMPLETE,
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
                paymentPlan: payment_config_1.PAYMENT_PLANS.FIRST_HALF_COMPLETE,
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
                paymentPlan: payment_config_1.PAYMENT_PLANS.FULL_PAYMENT,
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
        // Try to find existing paymentStatus (don't throw yet — may need to self-heal)
        let paymentStatus = await tx.paymentStatus.findUnique({
            where: {
                userId_courseId: {
                    userId: metadata.userId,
                    courseId: metadata.courseId,
                },
            },
            include: {
                paymentInstallments: { orderBy: { installmentNumber: "asc" } },
                cohort: true,
            },
        });
        if (!paymentStatus) {
            throw new Error(`PaymentStatus record not found for user ${metadata.userId} on course ${metadata.courseId}. ` +
                `The payment initialization record may be missing. Please contact support with reference: ${metadata.reference}`);
        }
        // ✅ SELF-HEAL: If paymentStatus exists but has NO installments, auto-create them
        if (paymentStatus.paymentInstallments.length === 0) {
            console.warn(`⚠️  PaymentStatus ${paymentStatus.id} has no installments. Auto-creating for plan: ${paymentStatus.paymentPlan}`);
            const courseForPlan = await tx.course.findUnique({
                where: { id: metadata.courseId },
                select: { pricingPlans: true },
            });
            const planType = paymentStatus.paymentPlan;
            const plan = courseForPlan?.pricingPlans?.find((p) => p.planType === planType);
            if (!plan || plan.installmentsCount <= 1) {
                throw new Error(`Cannot auto-create installments: pricing plan "${planType}" not found or has ≤1 installment for course ${metadata.courseId}`);
            }
            const cohortStartDate = paymentStatus.cohort?.startDate || new Date();
            const installments = [];
            if (plan.installmentsCount === 2) {
                installments.push({
                    amount: plan.amountPerInstallment,
                    dueDate: new Date(),
                    installmentNumber: 1,
                });
                installments.push({
                    amount: plan.amountPerInstallment,
                    dueDate: (0, date_fns_1.addMonths)(cohortStartDate, 1),
                    installmentNumber: 2,
                });
            }
            else {
                // 3+ installments: 1 now, 2 at cohort start, 3+ monthly thereafter
                installments.push({
                    amount: plan.amountPerInstallment,
                    dueDate: new Date(),
                    installmentNumber: 1,
                });
                installments.push({
                    amount: plan.amountPerInstallment,
                    dueDate: cohortStartDate,
                    installmentNumber: 2,
                });
                for (let i = 3; i <= plan.installmentsCount; i++) {
                    installments.push({
                        amount: plan.amountPerInstallment,
                        dueDate: (0, date_fns_1.addMonths)(cohortStartDate, i - 2),
                        installmentNumber: i,
                    });
                }
            }
            await tx.paymentInstallment.createMany({
                data: installments.map((inst) => ({
                    ...inst,
                    paymentStatusId: paymentStatus.id,
                })),
            });
            console.log(`✅ Auto-created ${installments.length} installments for paymentStatus ${paymentStatus.id}`);
            // Re-fetch with the newly created installments
            paymentStatus = await tx.paymentStatus.findUniqueOrThrow({
                where: { id: paymentStatus.id },
                include: {
                    paymentInstallments: { orderBy: { installmentNumber: "asc" } },
                    cohort: true,
                },
            });
        }
        // Find the installment to update
        const installmentToUpdate = paymentStatus.paymentInstallments.find((i) => i.installmentNumber === installmentNumber);
        if (!installmentToUpdate) {
            throw new Error(`Installment ${installmentNumber} not found for this payment plan (plan has ${paymentStatus.paymentInstallments.length} installments)`);
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
        if ((paymentPlan === payment_config_1.PAYMENT_PLANS.THREE_INSTALLMENTS &&
            installmentNumber === 1) ||
            (paymentPlan === payment_config_1.PAYMENT_PLANS.FOUR_INSTALLMENTS &&
                installmentNumber === 2)) {
            // Get the cohort from payment status
            const cohort = await tx.cohort.findUnique({
                where: { id: paymentStatus?.cohortId || "" },
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
                    (paymentPlan === payment_config_1.PAYMENT_PLANS.THREE_INSTALLMENTS ? 1 : 2));
                await tx.paymentInstallment.update({
                    where: { id: remainingInstallment.id },
                    data: { dueDate: newDueDate },
                });
            }
        }
        if ((paymentPlan === payment_config_1.PAYMENT_PLANS.THREE_INSTALLMENTS &&
            installmentNumber === 1) ||
            (paymentPlan === payment_config_1.PAYMENT_PLANS.FOUR_INSTALLMENTS &&
                installmentNumber === 2)) {
            await tx.userCohort.updateMany({
                where: {
                    userId: metadata.userId,
                    courseId: metadata.courseId,
                },
                data: { isPaymentActive: true },
            });
            // ✅ CRITICAL: Create purchase record when access is granted
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
        }
        const remainingUnpaidInstallments = await tx.paymentInstallment.count({
            where: {
                paymentStatusId: paymentStatus.id,
                paid: false,
            },
        });
        if (remainingUnpaidInstallments === 0) {
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
paymentApp.patch("/admin/payment-installments/:installmentId/due-date", async (req, res) => {
    try {
        const { installmentId } = req.params;
        const { dueDate, reason, updatedBy } = req.body;
        if (!dueDate) {
            return res.status(400).json({
                error: "dueDate is required",
            });
        }
        const nextDueDate = new Date(dueDate);
        if (Number.isNaN(nextDueDate.getTime())) {
            return res.status(400).json({
                error: "Invalid dueDate",
            });
        }
        const installment = await prismadb_1.prismadb.paymentInstallment.findUnique({
            where: { id: installmentId },
            include: {
                paymentStatus: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                            },
                        },
                        course: {
                            select: {
                                id: true,
                                title: true,
                            },
                        },
                        cohort: true,
                    },
                },
            },
        });
        if (!installment) {
            return res.status(404).json({
                error: "Installment not found",
            });
        }
        if (installment.paid) {
            return res.status(400).json({
                error: "Cannot edit due date for a paid installment",
            });
        }
        const updatedInstallment = await prismadb_1.prismadb.paymentInstallment.update({
            where: { id: installmentId },
            data: {
                dueDate: nextDueDate,
                lastReminderSent: null,
            },
            include: {
                paymentStatus: {
                    include: {
                        user: true,
                        course: true,
                        cohort: true,
                        paymentInstallments: {
                            orderBy: {
                                installmentNumber: "asc",
                            },
                        },
                    },
                },
            },
        });
        return res.json({
            installment: updatedInstallment,
            message: "Installment due date updated successfully",
        });
    }
    catch (error) {
        console.error("Failed to update installment due date:", error);
        return res.status(500).json({
            error: "Failed to update installment due date",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
paymentApp.post("/admin/payment-statuses/:paymentStatusId/transactions", async (req, res) => {
    try {
        const { paymentStatusId } = req.params;
        const { amount, paymentGateway = "START_BUTTON", transactionRef, installmentNumber, paymentDate, notes, createdBy, } = req.body;
        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({
                error: "Valid amount is required",
            });
        }
        const paymentStatus = await prismadb_1.prismadb.paymentStatus.findUnique({
            where: { id: paymentStatusId },
            include: {
                user: true,
                course: {
                    include: {
                        pricingPlans: true,
                    },
                },
                cohort: true,
                paymentInstallments: {
                    orderBy: {
                        installmentNumber: "asc",
                    },
                },
            },
        });
        if (!paymentStatus) {
            return res.status(404).json({
                error: "Payment status not found",
            });
        }
        const paymentPlan = await getPaymentPlanFromRecord(paymentStatus);
        const isInstallmentPlan = [
            payment_config_1.PAYMENT_PLANS.TWO_INSTALLMENTS,
            payment_config_1.PAYMENT_PLANS.THREE_INSTALLMENTS,
            payment_config_1.PAYMENT_PLANS.FOUR_INSTALLMENTS,
            payment_config_1.PAYMENT_PLANS.FIVE_INSTALLMENTS,
        ].includes(paymentPlan);
        let selectedInstallment = null;
        const firstUnpaidInstallment = paymentStatus.paymentInstallments.find((installment) => !installment.paid);
        if (!firstUnpaidInstallment) {
            return res.status(400).json({
                error: "All installments for this payment plan have already been paid",
            });
        }
        if (Number(installmentNumber) !== firstUnpaidInstallment.installmentNumber) {
            return res.status(400).json({
                error: `Installment #${firstUnpaidInstallment.installmentNumber} must be paid before installment #${installmentNumber}`,
            });
        }
        if (isInstallmentPlan) {
            if (!installmentNumber) {
                return res.status(400).json({
                    error: "installmentNumber is required for installment plans",
                });
            }
            selectedInstallment = paymentStatus.paymentInstallments.find((installment) => installment.installmentNumber === Number(installmentNumber));
            if (!selectedInstallment) {
                return res.status(404).json({
                    error: "Installment not found for this payment plan",
                });
            }
            if (selectedInstallment.paid) {
                return res.status(400).json({
                    error: "Selected installment is already paid",
                });
            }
        }
        const reference = transactionRef ||
            `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const existingRef = await prismadb_1.prismadb.paymentTransaction.findUnique({
            where: {
                transactionRef: reference,
            },
        });
        if (existingRef) {
            return res.status(409).json({
                error: "Transaction reference already exists",
            });
        }
        const metadata = {
            manualEntry: true,
            createdBy,
            notes,
            userId: paymentStatus.userId,
            courseId: paymentStatus.courseId,
            cohortName: paymentStatus.cohort?.name,
            planType: paymentPlan,
            paymentPlan,
            installmentNumber: installmentNumber
                ? Number(installmentNumber)
                : undefined,
            amountPerInstallment: selectedInstallment?.amount,
            installmentsCount: paymentStatus.paymentInstallments.length || 1,
        };
        const transaction = await prismadb_1.prismadb.paymentTransaction.create({
            data: {
                transactionRef: reference,
                paymentGateway,
                paymentStatusId: paymentStatus.id,
                userId: paymentStatus.userId,
                courseId: paymentStatus.courseId,
                amount: String(amount),
                status: "pending",
                paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                authorizationUrl: null,
                paymentPlan,
                paymentType: paymentPlan,
                metadata: JSON.stringify(metadata),
            },
            include: {
                paymentStatus: {
                    include: {
                        user: true,
                        course: true,
                        cohort: true,
                        paymentInstallments: {
                            orderBy: {
                                installmentNumber: "asc",
                            },
                        },
                    },
                },
            },
        });
        return res.status(201).json({
            transaction,
            message: "Payment transaction added successfully",
        });
    }
    catch (error) {
        console.error("Failed to add manual payment transaction:", error);
        return res.status(500).json({
            error: "Failed to add payment transaction",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
paymentApp.post("/admin/payment-transactions/:transactionId/mark-paid", async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { markedBy, reason, paymentDate } = req.body;
        const transaction = await prismadb_1.prismadb.paymentTransaction.findUnique({
            where: {
                id: transactionId,
            },
        });
        if (!transaction) {
            return res.status(404).json({
                error: "Transaction not found",
            });
        }
        if (transaction.status === "success") {
            return res.json({
                transaction,
                message: "Transaction is already marked as paid",
            });
        }
        if (!transaction.paymentStatusId) {
            return res.status(400).json({
                error: "Transaction is not linked to a payment status",
            });
        }
        const result = await prismadb_1.prismadb.$transaction(async (tx) => {
            return processSuccessfulPaymentTransaction(tx, {
                transactionRef: transaction.transactionRef,
                verifiedAt: paymentDate ? new Date(paymentDate) : new Date(),
                markedBy,
                manualReason: reason,
                skipExternalVerification: true,
            });
        }, {
            maxWait: 30000,
            timeout: 25000,
        });
        try {
            const metadata = JSON.parse(result.metadata || "{}");
            const [user, course, paymentStatus] = await Promise.all([
                prismadb_1.prismadb.user.findUnique({
                    where: {
                        id: result.userId,
                    },
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                }),
                prismadb_1.prismadb.course.findUnique({
                    where: {
                        id: result.courseId,
                    },
                    select: {
                        id: true,
                        title: true,
                    },
                }),
                prismadb_1.prismadb.paymentStatus.findUnique({
                    where: {
                        id: result.paymentStatusId || "",
                    },
                    include: {
                        cohort: true,
                        paymentInstallments: true,
                    },
                }),
            ]);
            if (user && course) {
                await notification_service_1.NotificationService.create({
                    type: "COURSE_ADDED",
                    userId: user.id,
                    payload: {
                        cohortId: paymentStatus?.cohortId || undefined,
                        cohortName: paymentStatus?.cohort?.name,
                        courseTitle: course.title,
                        courseId: course.id,
                        paymentStatusId: result.paymentStatusId,
                        paymentTransactionId: result.id,
                        actionUrl: `/dashboard/lessons/${course.id}`,
                        // manuallyMarkedPaid: true,
                    },
                });
                // await sendPaymentConfirmationEmail({
                //   amountPaid: `${currenciesInfo.NGN.symbol}${Number(result.amount).toLocaleString()}`,
                //   courseAccessLink: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
                //   courseTitle: course.title,
                //   paymentType:
                //     metadata.planType === "FULL_PAYMENT" || metadata.planType === "FULL"
                //       ? "one_time"
                //       : "installment",
                //   currentInstallment: metadata.installmentNumber,
                //   totalInstallments: metadata.installmentsCount,
                //   paymentDate: format(
                //     new Date(result.paymentDate || new Date()),
                //     "d MMM yyyy",
                //   ),
                //   userEmail: user.email || "",
                //   userName: user.name || "Student",
                // });
            }
            const { GoogleSheetsSyncService } = await Promise.resolve().then(() => __importStar(require("../../utils/googleSheets")));
            GoogleSheetsSyncService.syncPaymentData().catch((error) => console.error("Google Sheets sync error:", error.message));
        }
        catch (sideEffectError) {
            console.error("Manual paid side effects failed:", sideEffectError);
        }
        const updated = await prismadb_1.prismadb.paymentTransaction.findUnique({
            where: {
                id: transactionId,
            },
            include: {
                paymentStatus: {
                    include: {
                        user: true,
                        course: true,
                        cohort: true,
                        paymentInstallments: {
                            orderBy: {
                                installmentNumber: "asc",
                            },
                        },
                    },
                },
            },
        });
        return res.json({
            transaction: updated,
            message: "Transaction marked as paid successfully",
        });
    }
    catch (error) {
        console.error("Failed to mark transaction as paid:", error);
        return res.status(500).json({
            error: "Failed to mark transaction as paid",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
paymentApp.post("/admin/payment-statuses/:paymentStatusId/manual-payment", async (req, res) => {
    try {
        const { paymentStatusId } = req.params;
        const { amount, installmentNumber, paymentDate, reference, notes, createdBy, markPaid = true, } = req.body;
        const created = await prismadb_1.prismadb.$transaction(async (tx) => {
            const paymentStatus = await tx.paymentStatus.findUnique({
                where: { id: paymentStatusId },
                include: {
                    user: true,
                    course: true,
                    cohort: true,
                    paymentInstallments: {
                        orderBy: {
                            installmentNumber: "asc",
                        },
                    },
                },
            });
            if (!paymentStatus) {
                throw new Error("Payment status not found");
            }
            const paymentPlan = await getPaymentPlanFromRecord(paymentStatus);
            const transactionRef = reference ||
                `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            const metadata = {
                manualEntry: true,
                createdBy,
                notes,
                userId: paymentStatus.userId,
                courseId: paymentStatus.courseId,
                cohortName: paymentStatus.cohort?.name,
                planType: paymentPlan,
                paymentPlan,
                installmentNumber: installmentNumber
                    ? Number(installmentNumber)
                    : undefined,
                installmentsCount: paymentStatus.paymentInstallments.length || 1,
            };
            const transaction = await tx.paymentTransaction.create({
                data: {
                    transactionRef,
                    paymentGateway: "START_BUTTON",
                    paymentStatusId: paymentStatus.id,
                    userId: paymentStatus.userId,
                    courseId: paymentStatus.courseId,
                    amount: String(amount),
                    status: "pending",
                    paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
                    authorizationUrl: null,
                    paymentPlan,
                    paymentType: paymentPlan,
                    metadata: JSON.stringify(metadata),
                },
            });
            if (!markPaid)
                return transaction;
            await processSuccessfulPaymentTransaction(tx, {
                transactionRef,
                verifiedAt: paymentDate ? new Date(paymentDate) : new Date(),
                markedBy: createdBy,
                manualReason: notes,
                skipExternalVerification: true,
            });
            return transaction;
        }, {
            maxWait: 30000,
            timeout: 30000,
        });
        const transaction = await prismadb_1.prismadb.paymentTransaction.findUnique({
            where: {
                id: created.id,
            },
            include: {
                paymentStatus: {
                    include: {
                        user: true,
                        course: true,
                        cohort: true,
                        paymentInstallments: {
                            orderBy: {
                                installmentNumber: "asc",
                            },
                        },
                    },
                },
            },
        });
        return res.status(201).json({
            transaction,
            message: markPaid
                ? "Manual payment added and marked as paid"
                : "Manual payment transaction added",
        });
    }
    catch (error) {
        console.error("Failed to add manual payment:", error);
        return res.status(500).json({
            error: "Failed to add manual payment",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
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
                    if (paymentPlan === payment_config_1.PAYMENT_PLANS.FULL_PAYMENT) {
                        // Full payment - should never be deactivated if payment was made
                        shouldDeactivate = false;
                    }
                    else if (paymentPlan === payment_config_1.PAYMENT_PLANS.FIRST_HALF_COMPLETE) {
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
                    else if (Object.values(payment_config_1.PAYMENT_PLANS).includes(paymentPlan) &&
                        allInstallments.length > 1) {
                        // Generic logic for ANY multi-installment plan (2 to 5 installments)
                        const paidCount = allInstallments.filter((i) => i.paid).length;
                        if (installment.installmentNumber === 1) {
                            // First installment - should be paid to secure spot
                            if (cohortHasStarted && paidCount === 0) {
                                const gracePeriodDays = 7;
                                if (daysSinceCohortStart > gracePeriodDays) {
                                    shouldDeactivate = true;
                                    reason = "Initial installment not paid after cohort started";
                                }
                            }
                        }
                        else if (installment.installmentNumber === 2) {
                            // Second installment logic
                            if (allInstallments.length >= 3) {
                                // For 3+ installments: MUST be paid before cohort starts
                                if (cohortHasStarted && paidCount < 2) {
                                    shouldDeactivate = true;
                                    reason =
                                        "Second installment must be paid before cohort starts for 3+ installment plans";
                                }
                            }
                            else {
                                // For 2 installments: due 1 month into program
                                if (cohortHasStarted && monthsSinceCohortStart >= 1) {
                                    const gracePeriodDays = 14;
                                    const expectedDueDate = (0, date_fns_1.addMonths)(cohortStartDate, 1);
                                    if (now >
                                        new Date(expectedDueDate.getTime() + gracePeriodDays * 86400000) &&
                                        paidCount < 2) {
                                        shouldDeactivate = true;
                                        reason =
                                            "Second installment for 2-plan overdue (1 month into cohort)";
                                    }
                                }
                            }
                        }
                        else if (installment.installmentNumber >= 3) {
                            // 3rd, 4th, 5th installments: monthly from start date
                            const monthsNeeded = installment.installmentNumber - 2; // Installment 3 is 1 month after start
                            if (cohortHasStarted && monthsSinceCohortStart >= monthsNeeded) {
                                const gracePeriodDays = 14;
                                const expectedDueDate = (0, date_fns_1.addMonths)(cohortStartDate, monthsNeeded);
                                if (now >
                                    new Date(expectedDueDate.getTime() + gracePeriodDays * 86400000) &&
                                    paidCount < installment.installmentNumber) {
                                    shouldDeactivate = true;
                                    reason = `Installment ${installment.installmentNumber} overdue (${monthsNeeded} month(s) into cohort)`;
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
                else if (paymentPlan === payment_config_1.PAYMENT_PLANS.FULL_PAYMENT) {
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
exports.default = paymentApp;
//# sourceMappingURL=index.js.map