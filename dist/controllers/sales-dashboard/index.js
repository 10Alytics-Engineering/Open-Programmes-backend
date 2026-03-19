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
// controllers/sales-dashboard.ts
const express_1 = __importDefault(require("express"));
const prismadb_1 = require("../../lib/prismadb");
const date_fns_1 = require("date-fns");
const salesDashboardApp = express_1.default.Router();
salesDashboardApp.use(express_1.default.json());
// Helper function to convert BigInt to Number for JSON serialization
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
// 1. Users that purchased for the month and their sum in Naira
salesDashboardApp.get("/monthly-sales", async (req, res) => {
    try {
        const { year, month } = req.query;
        let startDate, endDate;
        if (year && month) {
            startDate = new Date(Number(year), Number(month) - 1, 1);
            endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);
        }
        else {
            // Default to current month
            const now = new Date();
            startDate = (0, date_fns_1.startOfMonth)(now);
            endDate = (0, date_fns_1.endOfMonth)(now);
        }
        // Get successful payments for the month
        const monthlyPayments = await prismadb_1.prismadb.paystackTransaction.findMany({
            where: {
                status: "success",
                paymentDate: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            include: {
                paymentStatus: {
                    include: {
                        paymentInstallments: {
                            where: {
                                paid: true,
                            },
                        },
                    },
                },
            },
        });
        // If no payments found, return empty response
        if (monthlyPayments.length === 0) {
            return res.json({
                totalRevenue: 0,
                userPayments: [],
                period: {
                    start: startDate,
                    end: endDate
                }
            });
        }
        // Get user and course details for the payments
        const userIds = [...new Set(monthlyPayments.map(p => p.userId))];
        const courseIds = [...new Set(monthlyPayments.map(p => p.courseId))];
        const [users, courses] = await Promise.all([
            prismadb_1.prismadb.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, email: true, phone_number: true }
            }),
            prismadb_1.prismadb.course.findMany({
                where: { id: { in: courseIds } },
                select: { id: true, title: true }
            })
        ]);
        const userMap = new Map(users.map(user => [user.id, user]));
        const courseMap = new Map(courses.map(course => [course.id, course]));
        // Calculate total revenue for the month
        const totalRevenue = monthlyPayments.reduce((sum, payment) => {
            return sum + Number(payment.amount);
        }, 0);
        // Group by user
        const userPayments = {};
        monthlyPayments.forEach(payment => {
            const userId = payment.userId;
            const user = userMap.get(userId) || { id: userId, name: "Unknown User", email: "No email available" };
            const course = courseMap.get(payment.courseId) || { id: payment.courseId, title: "Unknown Course" };
            if (!userPayments[userId]) {
                userPayments[userId] = {
                    user: user,
                    total: 0,
                    payments: []
                };
            }
            userPayments[userId].total += Number(payment.amount);
            userPayments[userId].payments.push({
                id: payment.id,
                amount: Number(payment.amount),
                course: course,
                paymentDate: payment.paymentDate,
                paymentPlan: payment.paymentPlan
            });
        });
        res.json({
            totalRevenue,
            userPayments: Object.values(userPayments),
            period: {
                start: startDate,
                end: endDate
            }
        });
    }
    catch (error) {
        console.error("Error fetching monthly sales:", error);
        res.status(500).json({
            error: "Failed to fetch monthly sales",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
// 2. Year chart - sales across all 12 months
salesDashboardApp.get("/yearly-sales", async (req, res) => {
    try {
        const { year } = req.query;
        const targetYear = year ? Number(year) : new Date().getFullYear();
        const startDate = new Date(targetYear, 0, 1);
        const endDate = new Date(targetYear, 11, 31, 23, 59, 59);
        // Get all months in the year
        const months = (0, date_fns_1.eachMonthOfInterval)({ start: startDate, end: endDate });
        // Get successful payments for the year
        const yearlyPayments = await prismadb_1.prismadb.paystackTransaction.findMany({
            where: {
                status: "success",
                paymentDate: {
                    gte: startDate,
                    lte: endDate,
                },
            },
        });
        // Initialize monthly data
        const monthlyData = months.map(month => {
            const monthStart = (0, date_fns_1.startOfMonth)(month);
            const monthEnd = (0, date_fns_1.endOfMonth)(month);
            return {
                month: (0, date_fns_1.format)(month, 'MMMM'),
                year: targetYear,
                start: monthStart,
                end: monthEnd,
                revenue: 0,
                transactions: 0
            };
        });
        // Calculate revenue per month
        yearlyPayments.forEach(payment => {
            const paymentDate = payment.paymentDate;
            if (!paymentDate)
                return;
            const monthIndex = new Date(paymentDate).getMonth();
            monthlyData[monthIndex].revenue += Number(payment.amount);
            monthlyData[monthIndex].transactions += 1;
        });
        // Calculate total yearly revenue
        const totalYearlyRevenue = monthlyData.reduce((sum, month) => sum + month.revenue, 0);
        const totalYearlyTransactions = monthlyData.reduce((sum, month) => sum + month.transactions, 0);
        res.json({
            year: targetYear,
            totalRevenue: totalYearlyRevenue,
            totalTransactions: totalYearlyTransactions,
            monthlyData
        });
    }
    catch (error) {
        console.error("Error fetching yearly sales:", error);
        res.status(500).json({
            error: "Failed to fetch yearly sales",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
// 3. Available programs and total number enrolled in each
salesDashboardApp.get("/programs-enrollment", async (req, res) => {
    try {
        // Get all courses with their purchase counts
        const coursesWithEnrollment = await prismadb_1.prismadb.course.findMany({
            include: {
                _count: {
                    select: {
                        purchases: true,
                    }
                },
                cohorts: {
                    include: {
                        _count: {
                            select: {
                                users: true
                            }
                        }
                    }
                },
                paymentStatuses: {
                    where: {
                        status: {
                            not: "EXPIRED"
                        }
                    }
                }
            },
            orderBy: {
                purchases: {
                    _count: "desc"
                }
            }
        });
        // Format the data
        const programsData = coursesWithEnrollment.map(course => {
            const activeEnrollments = course.paymentStatuses.filter(ps => ps.status !== "EXPIRED").length;
            // Calculate cohort enrollments
            const cohortEnrollments = course.cohorts.reduce((sum, cohort) => {
                return sum + cohort._count.users;
            }, 0);
            return {
                id: course.id,
                title: course.title,
                totalPurchases: course._count.purchases,
                activeEnrollments: Math.max(activeEnrollments, cohortEnrollments),
                cohorts: course.cohorts.map(cohort => ({
                    id: cohort.id,
                    name: cohort.name,
                    enrollments: cohort._count.users,
                    startDate: cohort.startDate,
                    endDate: cohort.endDate
                }))
            };
        });
        res.json(programsData);
    }
    catch (error) {
        console.error("Error fetching programs enrollment:", error);
        res.status(500).json({
            error: "Failed to fetch programs enrollment",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
// 4. Comprehensive sales dashboard data
salesDashboardApp.get("/dashboard", async (req, res) => {
    try {
        const { period } = req.query; // 'month' or 'year'
        // Convert environment variable to number with fallback
        const TOTAL_COURSE_FEE = Number(process.env.TOTAL_COURSE_FEE) || 250000;
        const HALF_COURSE_FEE = TOTAL_COURSE_FEE / 2;
        // Get current period data
        const now = new Date();
        const currentPeriodStart = period === 'year' ? (0, date_fns_1.startOfYear)(now) : (0, date_fns_1.startOfMonth)(now);
        const currentPeriodEnd = period === 'year' ? (0, date_fns_1.endOfYear)(now) : (0, date_fns_1.endOfMonth)(now);
        // Get previous period data
        const previousPeriodStart = new Date(currentPeriodStart);
        const previousPeriodEnd = new Date(currentPeriodEnd);
        if (period === 'year') {
            previousPeriodStart.setFullYear(previousPeriodStart.getFullYear() - 1);
            previousPeriodEnd.setFullYear(previousPeriodEnd.getFullYear() - 1);
        }
        else {
            previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);
            previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 1);
        }
        // Get payments for both periods
        const [currentPayments, previousPayments] = await Promise.all([
            prismadb_1.prismadb.paystackTransaction.findMany({
                where: {
                    status: "success",
                    paymentDate: {
                        gte: currentPeriodStart,
                        lte: currentPeriodEnd,
                    },
                },
            }),
            prismadb_1.prismadb.paystackTransaction.findMany({
                where: {
                    status: "success",
                    paymentDate: {
                        gte: previousPeriodStart,
                        lte: previousPeriodEnd,
                    },
                },
            }),
        ]);
        // Calculate revenue
        const currentRevenue = currentPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        const previousRevenue = previousPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
        // Calculate growth percentage
        const growthPercentage = previousRevenue > 0
            ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
            : currentRevenue > 0 ? 100 : 0;
        // Get top courses by revenue
        const topCourses = await prismadb_1.prismadb.$queryRaw `
      SELECT 
        c.id,
        c.title,
        SUM(CASE 
          WHEN ps."paymentPlan" = 'FULL_PAYMENT' THEN ${TOTAL_COURSE_FEE}
          WHEN ps."paymentPlan" = 'FIRST_HALF_COMPLETE' AND ps.status = 'COMPLETE' THEN ${TOTAL_COURSE_FEE}
          WHEN ps."paymentPlan" = 'FIRST_HALF_COMPLETE' AND ps.status = 'BALANCE_HALF_PAYMENT' THEN ${HALF_COURSE_FEE}
          WHEN ps."paymentPlan" = 'FOUR_INSTALLMENTS' THEN (
            SELECT COALESCE(SUM(amount), 0)
            FROM "PaymentInstallment" 
            WHERE "paymentStatusId" = ps.id AND paid = true
          )
          ELSE 0
        END) as revenue,
        COUNT(DISTINCT ps."userId") as enrollments
      FROM "Course" c
      LEFT JOIN "PaymentStatus" ps ON c.id = ps."courseId" AND ps.status != 'EXPIRED'
      GROUP BY c.id, c.title
      ORDER BY revenue DESC
      LIMIT 5
    `;
        // Get payment plan distribution
        const paymentPlanDistribution = await prismadb_1.prismadb.$queryRaw `
      SELECT 
        "paymentPlan",
        COUNT(*) as count,
        SUM(CASE 
          WHEN "paymentPlan" = 'FULL_PAYMENT' THEN ${TOTAL_COURSE_FEE}
          WHEN "paymentPlan" = 'FIRST_HALF_COMPLETE' AND status = 'COMPLETE' THEN ${TOTAL_COURSE_FEE}
          WHEN "paymentPlan" = 'FIRST_HALF_COMPLETE' AND status = 'BALANCE_HALF_PAYMENT' THEN ${HALF_COURSE_FEE}
          WHEN "paymentPlan" = 'FOUR_INSTALLMENTS' THEN (
            SELECT COALESCE(SUM(amount), 0)
            FROM "PaymentInstallment" 
            WHERE "paymentStatusId" = "PaymentStatus".id AND paid = true
          )
          ELSE 0
        END) as revenue
      FROM "PaymentStatus"
      WHERE status != 'EXPIRED'
      GROUP BY "paymentPlan"
    `;
        // Get activity stats based on duration
        const { duration = "7d" } = req.query;
        let startDate = new Date();
        if (duration === "30d") {
            startDate.setDate(startDate.getDate() - 30);
        }
        else if (duration === "90d") {
            startDate.setDate(startDate.getDate() - 90);
        }
        else if (duration === "all") {
            startDate = new Date(0); // Beginning of time
        }
        else {
            startDate.setDate(startDate.getDate() - 7); // Default 7d
        }
        startDate.setHours(0, 0, 0, 0);
        const activityTransactions = await prismadb_1.prismadb.paystackTransaction.findMany({
            where: {
                createdAt: {
                    gte: startDate
                }
            },
            select: {
                status: true
            }
        });
        const activityStats = {
            total: activityTransactions.length,
            success: activityTransactions.filter(t => t.status === "success").length,
            pending: activityTransactions.filter(t => t.status === "pending").length,
            failed: activityTransactions.filter(t => t.status === "failed" || t.status === "expired").length,
        };
        res.json({
            summary: {
                currentRevenue,
                previousRevenue,
                growthPercentage,
                transactions: currentPayments.length,
                averageTransaction: currentPayments.length > 0 ? currentRevenue / currentPayments.length : 0,
                activityStats,
                activeDuration: duration
            },
            topCourses: convertBigIntToNumber(topCourses),
            paymentPlanDistribution: convertBigIntToNumber(paymentPlanDistribution),
            period: {
                type: period || 'month',
                current: {
                    start: currentPeriodStart,
                    end: currentPeriodEnd
                },
                previous: {
                    start: previousPeriodStart,
                    end: previousPeriodEnd
                }
            }
        });
    }
    catch (error) {
        console.error("Error fetching dashboard data:", error);
        res.status(500).json({
            error: "Failed to fetch dashboard data",
            details: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
// 5. List all users with their payment status
salesDashboardApp.get("/users", async (req, res) => {
    try {
        const users = await prismadb_1.prismadb.user.findMany({
            where: {
                role: "USER"
            },
            include: {
                paymentStatus: {
                    include: {
                        course: true,
                        cohort: true,
                        paymentInstallments: true
                    }
                }
            },
            orderBy: {
                createdAt: "desc"
            }
        });
        res.json(users);
    }
    catch (error) {
        console.error("Error fetching sales users:", error);
        res.status(500).json({ error: "Failed to fetch users" });
    }
});
// 6. List all transactions
salesDashboardApp.get("/transactions", async (req, res) => {
    try {
        const { duration = "all" } = req.query; // Default to all for list page unless specified
        let dateFilter = {};
        if (duration !== "all") {
            let startDate = new Date();
            if (duration === "30d") {
                startDate.setDate(startDate.getDate() - 30);
            }
            else if (duration === "90d") {
                startDate.setDate(startDate.getDate() - 90);
            }
            else {
                startDate.setDate(startDate.getDate() - 7); // Default 7d
            }
            startDate.setHours(0, 0, 0, 0);
            dateFilter = {
                createdAt: {
                    gte: startDate
                }
            };
        }
        const transactions = await prismadb_1.prismadb.paystackTransaction.findMany({
            where: dateFilter,
            include: {
                paymentStatus: {
                    include: {
                        user: true,
                        course: true,
                        cohort: true
                    }
                }
            },
            orderBy: {
                paymentDate: "desc"
            }
        });
        // Check if we need to manually fill in some user/course data
        const missingDataTransactions = transactions.filter(t => !t.paymentStatus);
        if (missingDataTransactions.length > 0) {
            const userIds = [...new Set(missingDataTransactions.map(t => t.userId))];
            const courseIds = [...new Set(missingDataTransactions.map(t => t.courseId))];
            const [users, courses] = await Promise.all([
                prismadb_1.prismadb.user.findMany({
                    where: { id: { in: userIds } },
                    select: { id: true, name: true, email: true, phone_number: true }
                }),
                prismadb_1.prismadb.course.findMany({
                    where: { id: { in: courseIds } },
                    select: { id: true, title: true }
                })
            ]);
            const userMap = new Map(users.map(u => [u.id, u]));
            const courseMap = new Map(courses.map(c => [c.id, c]));
            const enrichedTransactions = transactions.map(t => {
                if (!t.paymentStatus) {
                    return {
                        ...t,
                        paymentStatus: {
                            user: userMap.get(t.userId) || null,
                            course: courseMap.get(t.courseId) || null,
                            status: t.status,
                            paymentPlan: t.paymentPlan,
                            createdAt: t.createdAt,
                            updatedAt: t.updatedAt,
                            paymentInstallments: []
                        }
                    };
                }
                return t;
            });
            return res.json(enrichedTransactions);
        }
        res.json(transactions);
    }
    catch (error) {
        console.error("Error fetching transactions:", error);
        res.status(500).json({ error: "Failed to fetch transactions" });
    }
});
// 7. Single transaction details
salesDashboardApp.get("/transactions/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const transaction = await prismadb_1.prismadb.paystackTransaction.findUnique({
            where: { id },
            include: {
                paymentStatus: {
                    include: {
                        user: true,
                        course: true,
                        cohort: true,
                        paymentInstallments: {
                            orderBy: {
                                installmentNumber: "asc"
                            }
                        }
                    }
                }
            }
        });
        if (!transaction) {
            return res.status(404).json({ error: "Transaction not found" });
        }
        // Manual enrichment if paymentStatus is null
        if (!transaction.paymentStatus) {
            const [user, course] = await Promise.all([
                prismadb_1.prismadb.user.findUnique({
                    where: { id: transaction.userId },
                    select: { id: true, name: true, email: true, phone_number: true }
                }),
                prismadb_1.prismadb.course.findUnique({
                    where: { id: transaction.courseId },
                    select: { id: true, title: true }
                })
            ]);
            const enrichedTransaction = {
                ...transaction,
                paymentStatus: {
                    user: user || null,
                    course: course || null,
                    status: transaction.status,
                    paymentPlan: transaction.paymentPlan,
                    createdAt: transaction.createdAt,
                    updatedAt: transaction.updatedAt,
                    paymentInstallments: []
                }
            };
            return res.json(enrichedTransaction);
        }
        res.json(transaction);
    }
    catch (error) {
        console.error("Error fetching transaction detail:", error);
        res.status(500).json({ error: "Failed to fetch transaction detail" });
    }
});
// 8. Export to Google Sheets
salesDashboardApp.post("/export-to-sheets", async (req, res) => {
    try {
        const { GoogleSheetsSyncService } = await Promise.resolve().then(() => __importStar(require("../../utils/googleSheets")));
        const result = await GoogleSheetsSyncService.syncPaymentData();
        if (result && result.success) {
            const spreadsheetId = process.env.GOOGLE_SHEETS_PAYMENTS_SPREADSHEET_ID;
            const sheetUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null;
            res.json({
                success: true,
                message: `Successfully exported ${result.count} records to Google Sheets.`,
                sheetUrl
            });
        }
        else {
            res.status(500).json({ success: false, error: result?.error || 'Unknown error occurred during sync' });
        }
    }
    catch (error) {
        console.error("Error exporting to sheets:", error);
        res.status(500).json({ success: false, error: "Failed to export data to Google Sheets" });
    }
});
exports.default = salesDashboardApp;
//# sourceMappingURL=index.js.map