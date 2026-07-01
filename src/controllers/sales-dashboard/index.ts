// controllers/sales-dashboard.ts
import express from "express";
import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import {
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  format,
} from "date-fns";
import {
  PAYMENT_GATEWAY,
  sortByPaymentDateDesc,
} from "../../utils/payment-config";
import { Prisma } from "@prisma/client";
import {
  buildInstallmentSchedule,
  parseMetadata,
  serializePaymentPlan,
} from "../../helpers/payment-helpers";

const salesDashboardApp = express.Router();
salesDashboardApp.use(express.json());

// Helper function to convert BigInt to Number for JSON serialization
const convertBigIntToNumber = (obj: any): any => {
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
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertBigIntToNumber(value);
    }
    return converted;
  }

  return obj;
};

// 1. Users that purchased for the month and their sum in Naira
salesDashboardApp.get("/monthly-sales", async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;

    let startDate: Date, endDate: Date;

    if (year && month) {
      startDate = new Date(Number(year), Number(month) - 1, 1);
      endDate = new Date(Number(year), Number(month), 0, 23, 59, 59);
    } else {
      // Default to current month
      const now = new Date();
      startDate = startOfMonth(now);
      endDate = endOfMonth(now);
    }

    // Get successful payments for the month
    const monthlyPayments = await prismadb.paystackTransaction.findMany({
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
          end: endDate,
        },
      });
    }

    // Get user and course details for the payments
    const userIds = [...new Set(monthlyPayments.map((p) => p.userId))];
    const courseIds = [...new Set(monthlyPayments.map((p) => p.courseId))];

    const [users, courses] = await Promise.all([
      prismadb.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, phone_number: true },
      }),
      prismadb.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true },
      }),
    ]);

    const userMap = new Map(users.map((user) => [user.id, user]));
    const courseMap = new Map(courses.map((course) => [course.id, course]));

    // Calculate total revenue for the month
    const totalRevenue = monthlyPayments.reduce((sum, payment) => {
      return sum + Number(payment.amount);
    }, 0);

    // Group by user
    const userPayments: Record<
      string,
      { user: any; total: number; payments: any[] }
    > = {};

    monthlyPayments.forEach((payment) => {
      const userId = payment.userId;
      const user = userMap.get(userId) || {
        id: userId,
        name: "Unknown User",
        email: "No email available",
      };
      const course = courseMap.get(payment.courseId) || {
        id: payment.courseId,
        title: "Unknown Course",
      };

      if (!userPayments[userId]) {
        userPayments[userId] = {
          user: user,
          total: 0,
          payments: [],
        };
      }

      userPayments[userId].total += Number(payment.amount);
      userPayments[userId].payments.push({
        id: payment.id,
        amount: Number(payment.amount),
        course: course,
        paymentDate: payment.paymentDate,
        paymentPlan: payment.paymentPlan,
      });
    });

    res.json({
      totalRevenue,
      userPayments: Object.values(userPayments),
      period: {
        start: startDate,
        end: endDate,
      },
    });
  } catch (error) {
    console.error("Error fetching monthly sales:", error);
    res.status(500).json({
      error: "Failed to fetch monthly sales",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// 2. Year chart - sales across all 12 months
salesDashboardApp.get("/yearly-sales", async (req: Request, res: Response) => {
  try {
    const { year } = req.query;
    const targetYear = year ? Number(year) : new Date().getFullYear();

    const startDate = new Date(targetYear, 0, 1);
    const endDate = new Date(targetYear, 11, 31, 23, 59, 59);

    // Get all months in the year
    const months = eachMonthOfInterval({ start: startDate, end: endDate });

    // Get successful payments for the year
    const yearlyPayments = await prismadb.paystackTransaction.findMany({
      where: {
        status: "success",
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Initialize monthly data
    const monthlyData = months.map((month) => {
      const monthStart = startOfMonth(month);
      const monthEnd = endOfMonth(month);

      return {
        month: format(month, "MMMM"),
        year: targetYear,
        start: monthStart,
        end: monthEnd,
        revenue: 0,
        transactions: 0,
      };
    });

    // Calculate revenue per month
    yearlyPayments.forEach((payment) => {
      const paymentDate = payment.paymentDate;
      if (!paymentDate) return;

      const monthIndex = new Date(paymentDate).getMonth();
      monthlyData[monthIndex].revenue += Number(payment.amount);
      monthlyData[monthIndex].transactions += 1;
    });

    // Calculate total yearly revenue
    const totalYearlyRevenue = monthlyData.reduce(
      (sum, month) => sum + month.revenue,
      0,
    );
    const totalYearlyTransactions = monthlyData.reduce(
      (sum, month) => sum + month.transactions,
      0,
    );

    res.json({
      year: targetYear,
      totalRevenue: totalYearlyRevenue,
      totalTransactions: totalYearlyTransactions,
      monthlyData,
    });
  } catch (error) {
    console.error("Error fetching yearly sales:", error);
    res.status(500).json({
      error: "Failed to fetch yearly sales",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// 3. Available programs and total number enrolled in each
salesDashboardApp.get(
  "/programs-enrollment",
  async (req: Request, res: Response) => {
    try {
      // Get all courses with their purchase counts
      const coursesWithEnrollment = await prismadb.course.findMany({
        include: {
          _count: {
            select: {
              purchases: true,
            },
          },
          cohorts: {
            include: {
              _count: {
                select: {
                  users: true,
                },
              },
            },
          },
          paymentStatuses: {
            where: {
              status: {
                not: "EXPIRED",
              },
            },
          },
        },
        orderBy: {
          purchases: {
            _count: "desc",
          },
        },
      });

      // Format the data
      const programsData = coursesWithEnrollment.map((course) => {
        const activeEnrollments = course.paymentStatuses.filter(
          (ps) => ps.status !== "EXPIRED",
        ).length;

        // Calculate cohort enrollments
        const cohortEnrollments = course.cohorts.reduce((sum, cohort) => {
          return sum + cohort._count.users;
        }, 0);

        return {
          id: course.id,
          title: course.title,
          totalPurchases: course._count.purchases,
          activeEnrollments: Math.max(activeEnrollments, cohortEnrollments),
          cohorts: course.cohorts.map((cohort) => ({
            id: cohort.id,
            name: cohort.name,
            enrollments: cohort._count.users,
            startDate: cohort.startDate,
            endDate: cohort.endDate,
          })),
        };
      });

      res.json(programsData);
    } catch (error) {
      console.error("Error fetching programs enrollment:", error);
      res.status(500).json({
        error: "Failed to fetch programs enrollment",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

// 4. Comprehensive sales dashboard data
salesDashboardApp.get("/dashboard", async (req: Request, res: Response) => {
  try {
    const { period } = req.query; // 'month' or 'year'

    // Convert environment variable to number with fallback
    const TOTAL_COURSE_FEE = Number(process.env.TOTAL_COURSE_FEE) || 250000;
    const HALF_COURSE_FEE = TOTAL_COURSE_FEE / 2;

    // Get current period data
    const now = new Date();
    const currentPeriodStart =
      period === "year" ? startOfYear(now) : startOfMonth(now);
    const currentPeriodEnd =
      period === "year" ? endOfYear(now) : endOfMonth(now);

    // Get previous period data
    const previousPeriodStart = new Date(currentPeriodStart);
    const previousPeriodEnd = new Date(currentPeriodEnd);

    if (period === "year") {
      previousPeriodStart.setFullYear(previousPeriodStart.getFullYear() - 1);
      previousPeriodEnd.setFullYear(previousPeriodEnd.getFullYear() - 1);
    } else {
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);
      previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 1);
    }

    // Get payments for both periods
    const [currentPayments, previousPayments] = await Promise.all([
      prismadb.paystackTransaction.findMany({
        where: {
          status: "success",
          paymentDate: {
            gte: currentPeriodStart,
            lte: currentPeriodEnd,
          },
        },
      }),
      prismadb.paystackTransaction.findMany({
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
    const currentRevenue = currentPayments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const previousRevenue = previousPayments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );

    // Calculate growth percentage
    const growthPercentage =
      previousRevenue > 0
        ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
        : currentRevenue > 0
          ? 100
          : 0;

    // Get top courses by revenue
    const topCourses = await prismadb.$queryRaw<
      Array<{
        id: string;
        title: string;
        revenue: bigint;
        enrollments: bigint;
      }>
    >`
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
    const paymentPlanDistribution = await prismadb.$queryRaw<
      Array<{
        paymentPlan: string;
        count: bigint;
        revenue: bigint;
      }>
    >`
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
    } else if (duration === "90d") {
      startDate.setDate(startDate.getDate() - 90);
    } else if (duration === "all") {
      startDate = new Date(0); // Beginning of time
    } else {
      startDate.setDate(startDate.getDate() - 7); // Default 7d
    }
    startDate.setHours(0, 0, 0, 0);

    const activityTransactions = await prismadb.paystackTransaction.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        status: true,
      },
    });

    const activityStats = {
      total: activityTransactions.length,
      success: activityTransactions.filter((t) => t.status === "success")
        .length,
      pending: activityTransactions.filter((t) => t.status === "pending")
        .length,
      failed: activityTransactions.filter(
        (t) => t.status === "failed" || t.status === "expired",
      ).length,
    };

    res.json({
      summary: {
        currentRevenue,
        previousRevenue,
        growthPercentage,
        transactions: currentPayments.length,
        averageTransaction:
          currentPayments.length > 0
            ? currentRevenue / currentPayments.length
            : 0,
        activityStats,
        activeDuration: duration,
      },
      topCourses: convertBigIntToNumber(topCourses),
      paymentPlanDistribution: convertBigIntToNumber(paymentPlanDistribution),
      period: {
        type: period || "month",
        current: {
          start: currentPeriodStart,
          end: currentPeriodEnd,
        },
        previous: {
          start: previousPeriodStart,
          end: previousPeriodEnd,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({
      error: "Failed to fetch dashboard data",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Dashboard route to fetch all relevant data for the sales dashboard
salesDashboardApp.get("/dashboard-all", async (req: Request, res: Response) => {
  try {
    const { period, duration = "7d" } = req.query;

    // Pricing is now per-course via CoursePricingPlan, so we no longer infer
    // revenue from a fixed fee. All revenue numbers come from summing the
    // actual amounts on successful transactions in either transaction table.

    // ---------------------------------------------------------------------
    // Period boundaries — drives the legacy current-vs-previous revenue
    // comparison shown as the growth % on the Collected card.
    // ---------------------------------------------------------------------
    const now = new Date();
    const currentPeriodStart =
      period === "year" ? startOfYear(now) : startOfMonth(now);
    const currentPeriodEnd =
      period === "year" ? endOfYear(now) : endOfMonth(now);

    const previousPeriodStart = new Date(currentPeriodStart);
    const previousPeriodEnd = new Date(currentPeriodEnd);
    if (period === "year") {
      previousPeriodStart.setFullYear(previousPeriodStart.getFullYear() - 1);
      previousPeriodEnd.setFullYear(previousPeriodEnd.getFullYear() - 1);
    } else {
      previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);
      previousPeriodEnd.setMonth(previousPeriodEnd.getMonth() - 1);
    }

    // ---------------------------------------------------------------------
    // Duration boundary — used by the dashboard's 7D/30D/90D/All toggle.
    // Anything time-bound (plan status, plan mix, top courses, activity)
    // respects this. Current-state metrics (scheduled, at risk, aging)
    // ignore it.
    // ---------------------------------------------------------------------
    let durationStart = new Date();
    if (duration === "30d") durationStart.setDate(durationStart.getDate() - 30);
    else if (duration === "90d")
      durationStart.setDate(durationStart.getDate() - 90);
    else if (duration === "all") durationStart = new Date(0);
    else durationStart.setDate(durationStart.getDate() - 7);
    durationStart.setHours(0, 0, 0, 0);

    // ---------------------------------------------------------------------
    // Parallel fetch.
    // ---------------------------------------------------------------------
    const [
      currentPaystack,
      currentPayment,
      previousPaystack,
      previousPayment,
      activityPaystack,
      activityPayment,
      planStatusRows,
      financialsRow,
      planMixRows,
      avgPlanLengthRow,
      avgTimeToFullRow,
      onTimeRow,
      currencyRows,
      topCourseRows,
      paymentPlanDistRows,
    ] = await Promise.all([
      // -- Current/previous period revenue, both transaction tables --------
      prismadb.paystackTransaction.findMany({
        where: {
          status: "success",
          paymentDate: { gte: currentPeriodStart, lte: currentPeriodEnd },
        },
        select: { amount: true },
      }),
      prismadb.paymentTransaction.findMany({
        where: {
          status: "success",
          paymentDate: { gte: currentPeriodStart, lte: currentPeriodEnd },
        },
        select: { amount: true },
      }),
      prismadb.paystackTransaction.findMany({
        where: {
          status: "success",
          paymentDate: { gte: previousPeriodStart, lte: previousPeriodEnd },
        },
        select: { amount: true },
      }),
      prismadb.paymentTransaction.findMany({
        where: {
          status: "success",
          paymentDate: { gte: previousPeriodStart, lte: previousPeriodEnd },
        },
        select: { amount: true },
      }),

      // -- Activity stats (status counts within duration window) -----------
      prismadb.paystackTransaction.findMany({
        where: { createdAt: { gte: durationStart } },
        select: { status: true },
      }),
      prismadb.paymentTransaction.findMany({
        where: { createdAt: { gte: durationStart } },
        select: { status: true },
      }),

      // -- Plan status: counts per state, scoped to duration window -------
      // A plan is classified as:
      //   paid_in_full: FULL_PAYMENT plan, OR all installments paid
      //   overdue:      any past-due unpaid installment
      //   in_progress:  installment plan, no overdue, not yet fully paid
      //                 (includes brand-new plans with 0 paid)
      // The buckets are mutually exclusive in that order.
      prismadb.$queryRaw<
        Array<{
          total_plans: bigint;
          paid_in_full: bigint;
          in_progress: bigint;
          overdue: bigint;
          abandoned: bigint;
        }>
      >`
        WITH ps_state AS (
        SELECT
          ps.id,
          ps.status::text AS status_text,
          ps."paymentPlan",
          -- Transaction signals across both tables
          (
            EXISTS (SELECT 1 FROM "PaystackTransaction" pt
                    WHERE pt."paymentStatusId" = ps.id AND pt.status = 'success')
            OR EXISTS (SELECT 1 FROM "PaymentTransaction" pmt
                      WHERE pmt."paymentStatusId" = ps.id AND pmt.status = 'success')
          ) AS has_success_tx,
          (
            EXISTS (SELECT 1 FROM "PaystackTransaction" pt
                    WHERE pt."paymentStatusId" = ps.id AND pt.status = 'pending')
            OR EXISTS (SELECT 1 FROM "PaymentTransaction" pmt
                      WHERE pmt."paymentStatusId" = ps.id AND pmt.status = 'pending')
          ) AS has_pending_tx,
          (
            (SELECT COUNT(*) FROM "PaystackTransaction" pt WHERE pt."paymentStatusId" = ps.id)
            +
            (SELECT COUNT(*) FROM "PaymentTransaction" pmt WHERE pmt."paymentStatusId" = ps.id)
          ) AS tx_count,
          -- Installment signals
          COUNT(pi.id) FILTER (WHERE pi.paid = false AND pi."dueDate" < NOW()) AS overdue_count,
          COUNT(pi.id) FILTER (WHERE pi.paid = true) AS paid_count,
          COUNT(pi.id) AS total_count
        FROM "PaymentStatus" ps
        LEFT JOIN "PaymentInstallment" pi ON pi."paymentStatusId" = ps.id
        WHERE ps."createdAt" >= ${durationStart}
        GROUP BY ps.id, ps.status, ps."paymentPlan"
      )
      SELECT
        COUNT(*) AS total_plans,
    
        COUNT(*) FILTER (
          WHERE status_text != 'EXPIRED'
            AND (
              ("paymentPlan" = 'FULL_PAYMENT' AND has_success_tx)
              OR (total_count > 0 AND paid_count = total_count)
            )
        ) AS paid_in_full,
    
        COUNT(*) FILTER (
          WHERE status_text != 'EXPIRED'
            AND overdue_count > 0
        ) AS overdue,
    
        COUNT(*) FILTER (
          WHERE status_text != 'EXPIRED'
            AND "paymentPlan" != 'FULL_PAYMENT'
            AND "paymentPlan" IS NOT NULL
            AND total_count > 0
            AND paid_count < total_count
            AND overdue_count = 0
            AND paid_count > 0
        ) AS in_progress,
    
        COUNT(*) FILTER (
          WHERE
            -- One-time plans: had transaction attempts, none succeeded or are pending
            ("paymentPlan" = 'FULL_PAYMENT' AND tx_count > 0
              AND NOT has_success_tx AND NOT has_pending_tx)
            -- Installment plans: no success/pending transactions at all
            OR ("paymentPlan" != 'FULL_PAYMENT' AND "paymentPlan" IS NOT NULL
              AND NOT has_success_tx AND NOT has_pending_tx)
        ) AS abandoned
      FROM ps_state

      `,

      // -- Financials -----------------------------------------------------
      // collected: actual money received in the duration window — sum of
      //   successful transactions across both tables, by paymentDate.
      // scheduled: lifetime current-state — future unpaid installments.
      // at_risk:   lifetime current-state — past-due unpaid installments.
      prismadb.$queryRaw<
        Array<{ collected: number; scheduled: number; at_risk: number }>
      >`
        SELECT
          (
            COALESCE((
              SELECT SUM(CAST(amount AS NUMERIC))
              FROM "PaystackTransaction"
              WHERE status = 'success' AND "paymentDate" >= ${durationStart}
            ), 0)
            +
            COALESCE((
              SELECT SUM(CAST(amount AS NUMERIC))
              FROM "PaymentTransaction"
              WHERE status = 'success' AND "paymentDate" >= ${durationStart}
            ), 0)
          )::float AS collected,
          COALESCE((
            SELECT SUM(pi.amount)
            FROM "PaymentInstallment" pi
            INNER JOIN "PaymentStatus" ps ON pi."paymentStatusId" = ps.id
            WHERE pi.paid = false
              AND pi."dueDate" >= NOW()
              AND ps.status::text != 'EXPIRED'
          ), 0)::float AS scheduled,
          COALESCE((
            SELECT SUM(pi.amount)
            FROM "PaymentInstallment" pi
            INNER JOIN "PaymentStatus" ps ON pi."paymentStatusId" = ps.id
            WHERE pi.paid = false
              AND pi."dueDate" < NOW()
              AND ps.status::text != 'EXPIRED'
          ), 0)::float AS at_risk
      `,

      // -- Plan mix: one-time vs installment, scoped to duration ---------
      prismadb.$queryRaw<Array<{ kind: string; count: bigint }>>`
        SELECT
          CASE WHEN "paymentPlan" = 'FULL_PAYMENT' THEN 'one_time' ELSE 'installment' END AS kind,
          COUNT(*) AS count
        FROM "PaymentStatus"
        WHERE status::text != 'EXPIRED'
          AND "paymentPlan" IS NOT NULL
          AND "createdAt" >= ${durationStart}
        GROUP BY kind
      `,

      // -- Avg plan length (installment plans only) ----------------------
      prismadb.$queryRaw<Array<{ avg_length: number | null }>>`
        SELECT AVG(installment_count)::float AS avg_length
        FROM (
          SELECT COUNT(*) AS installment_count
          FROM "PaymentInstallment" pi
          INNER JOIN "PaymentStatus" ps ON pi."paymentStatusId" = ps.id
          WHERE ps.status::text != 'EXPIRED'
            AND ps."paymentPlan" != 'FULL_PAYMENT'
            AND ps."paymentPlan" IS NOT NULL
            AND ps."createdAt" >= ${durationStart}
          GROUP BY ps.id
        ) sub
      `,

      // -- Avg time to full (months), only for fully-paid installment plans
      // Uses pi.updatedAt as a paid_at proxy. See note at top of file.
      prismadb.$queryRaw<Array<{ avg_months: number | null }>>`
        SELECT AVG(EXTRACT(EPOCH FROM (max_paid - min_paid)) / 2592000)::float AS avg_months
        FROM (
          SELECT
            ps.id,
            MIN(pi."updatedAt") AS min_paid,
            MAX(pi."updatedAt") AS max_paid,
            COUNT(*) AS total_inst,
            COUNT(*) FILTER (WHERE pi.paid = true) AS paid_inst
          FROM "PaymentStatus" ps
          INNER JOIN "PaymentInstallment" pi ON pi."paymentStatusId" = ps.id
          WHERE ps.status::text != 'EXPIRED'
            AND ps."paymentPlan" != 'FULL_PAYMENT'
            AND ps."paymentPlan" IS NOT NULL
          GROUP BY ps.id
        ) sub
        WHERE total_inst = paid_inst AND total_inst > 1
      `,

      // -- Historical on-time payment rate (current-state, lifetime) -----
      // % of installments that came due and were paid on or before due date.
      prismadb.$queryRaw<Array<{ paid_on_time: bigint; total_due: bigint }>>`
        SELECT
          COUNT(*) FILTER (WHERE pi.paid = true AND pi."updatedAt" <= pi."dueDate") AS paid_on_time,
          COUNT(*) FILTER (WHERE pi."dueDate" <= NOW()) AS total_due
        FROM "PaymentInstallment" pi
        INNER JOIN "PaymentStatus" ps ON pi."paymentStatusId" = ps.id
        WHERE ps.status::text != 'EXPIRED'
      `,

      // -- Currency breakdown --------------------------------------------
      // The transaction `amount` column holds the NGN equivalent. The
      // user's chosen currency lives in metadata.selectedCurrency and the
      // amount they actually paid in that currency lives in
      // metadata.currencyAmount. NGN payments may not have those fields
      // set — we default them to NGN at face value.
      //
      // Note: this assumes metadata, when non-null, is valid JSON. The
      // application writes it via JSON.stringify so this should hold,
      // but a malformed row would error this query.
      prismadb.$queryRaw<
        Array<{
          currency: string;
          native_amount: number;
          amount_in_base: number;
          count: bigint;
        }>
      >`
        WITH tx AS (
          SELECT
            COALESCE((NULLIF(metadata, '')::jsonb)->>'selectedCurrency', 'NGN') AS currency,
            CAST(COALESCE(
              (NULLIF(metadata, '')::jsonb)->>'currencyAmount',
              amount
            ) AS NUMERIC) AS native_amount,
            CAST(amount AS NUMERIC) AS amount_in_base
          FROM "PaystackTransaction"
          WHERE status = 'success' AND "paymentDate" >= ${durationStart}
          UNION ALL
          SELECT
            COALESCE((NULLIF(metadata, '')::jsonb)->>'selectedCurrency', 'NGN') AS currency,
            CAST(COALESCE(
              (NULLIF(metadata, '')::jsonb)->>'currencyAmount',
              amount
            ) AS NUMERIC) AS native_amount,
            CAST(amount AS NUMERIC) AS amount_in_base
          FROM "PaymentTransaction"
          WHERE status = 'success' AND "paymentDate" >= ${durationStart}
        )
        SELECT
          currency,
          COALESCE(SUM(native_amount), 0)::float AS native_amount,
          COALESCE(SUM(amount_in_base), 0)::float AS amount_in_base,
          COUNT(*) AS count
        FROM tx
        GROUP BY currency
        ORDER BY amount_in_base DESC
      `,

      // -- Top courses by revenue, scoped to duration --------------------
      // Revenue per course = sum of successful transactions linked to plans
      // for that course, where the plan was created in the duration window.
      // The ps_paid CTE computes paid amount per PaymentStatus once, then
      // aggregates by course.
      prismadb.$queryRaw<
        Array<{
          id: string;
          title: string;
          revenue: number | null;
          enrollments: bigint;
        }>
      >`
        WITH ps_paid AS (
          SELECT
            ps.id AS ps_id,
            ps."courseId",
            ps."userId",
            COALESCE(pt_sum.amt, 0) + COALESCE(pmt_sum.amt, 0) AS paid_amount
          FROM "PaymentStatus" ps
          LEFT JOIN (
            SELECT "paymentStatusId", SUM(CAST(amount AS NUMERIC)) AS amt
            FROM "PaystackTransaction"
            WHERE status = 'success' AND "paymentStatusId" IS NOT NULL
            GROUP BY "paymentStatusId"
          ) pt_sum ON pt_sum."paymentStatusId" = ps.id
          LEFT JOIN (
            SELECT "paymentStatusId", SUM(CAST(amount AS NUMERIC)) AS amt
            FROM "PaymentTransaction"
            WHERE status = 'success' AND "paymentStatusId" IS NOT NULL
            GROUP BY "paymentStatusId"
          ) pmt_sum ON pmt_sum."paymentStatusId" = ps.id
          WHERE ps.status::text != 'EXPIRED'
            AND ps."createdAt" >= ${durationStart}
        )
        SELECT
          c.id,
          c.title,
          COALESCE(SUM(ps_paid.paid_amount), 0)::float AS revenue,
          COUNT(DISTINCT ps_paid."userId") AS enrollments
        FROM "Course" c
        LEFT JOIN ps_paid ON c.id = ps_paid."courseId"
        GROUP BY c.id, c.title
        ORDER BY revenue DESC NULLS LAST
        LIMIT 5
      `,

      // -- Payment plan distribution -------------------------------------
      // Same approach: revenue per plan = sum of actual successful
      // transactions for plans of that type created in the duration window.
      prismadb.$queryRaw<
        Array<{ paymentPlan: string; count: bigint; revenue: number | null }>
      >`
        WITH ps_paid AS (
          SELECT
            ps.id AS ps_id,
            ps."paymentPlan",
            COALESCE(pt_sum.amt, 0) + COALESCE(pmt_sum.amt, 0) AS paid_amount
          FROM "PaymentStatus" ps
          LEFT JOIN (
            SELECT "paymentStatusId", SUM(CAST(amount AS NUMERIC)) AS amt
            FROM "PaystackTransaction"
            WHERE status = 'success' AND "paymentStatusId" IS NOT NULL
            GROUP BY "paymentStatusId"
          ) pt_sum ON pt_sum."paymentStatusId" = ps.id
          LEFT JOIN (
            SELECT "paymentStatusId", SUM(CAST(amount AS NUMERIC)) AS amt
            FROM "PaymentTransaction"
            WHERE status = 'success' AND "paymentStatusId" IS NOT NULL
            GROUP BY "paymentStatusId"
          ) pmt_sum ON pmt_sum."paymentStatusId" = ps.id
          WHERE ps.status::text != 'EXPIRED'
            AND ps."createdAt" >= ${durationStart}
        )
        SELECT
          "paymentPlan",
          COUNT(*) AS count,
          COALESCE(SUM(paid_amount), 0)::float AS revenue
        FROM ps_paid
        GROUP BY "paymentPlan"
      `,
    ]);

    // ---------------------------------------------------------------------
    // Combine transaction reads from both tables.
    // ---------------------------------------------------------------------
    const currentPayments = [...currentPaystack, ...currentPayment];
    const previousPayments = [...previousPaystack, ...previousPayment];
    const activityTransactions = [...activityPaystack, ...activityPayment];

    const currentRevenue = currentPayments.reduce(
      (s, p) => s + Number(p.amount),
      0,
    );
    const previousRevenue = previousPayments.reduce(
      (s, p) => s + Number(p.amount),
      0,
    );

    const growthPercentage =
      previousRevenue > 0
        ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
        : currentRevenue > 0
          ? 100
          : 0;

    const activityStats = {
      total: activityTransactions.length,
      success: activityTransactions.filter((t) => t.status === "success")
        .length,
      pending: activityTransactions.filter((t) => t.status === "pending")
        .length,
      failed: activityTransactions.filter(
        (t) => t.status === "failed" || t.status === "expired",
      ).length,
    };

    // ---------------------------------------------------------------------
    // Top-courses plan mix — runs after we know which course IDs are top 5.
    // ---------------------------------------------------------------------
    const topCourseIds = topCourseRows.map((c) => c.id).filter(Boolean);
    const topCoursesPlanMixRows =
      topCourseIds.length > 0
        ? await prismadb.$queryRaw<
            Array<{ courseId: string; paymentPlan: string; count: bigint }>
          >`
            SELECT "courseId", "paymentPlan", COUNT(*) AS count
            FROM "PaymentStatus"
            WHERE "courseId" IN (${Prisma.join(topCourseIds)})
              AND status::text != 'EXPIRED'
              AND "paymentPlan" IS NOT NULL
              AND "createdAt" >= ${durationStart}
            GROUP BY "courseId", "paymentPlan"
          `
        : [];

    // ---------------------------------------------------------------------
    // Reshape into the response contract the dashboard component expects.
    // ---------------------------------------------------------------------

    // Plan status
    const ps0 = planStatusRows[0] ?? {
      total_plans: 0n,
      paid_in_full: 0n,
      in_progress: 0n,
      overdue: 0n,
      abandoned: 0n,
    };
    const planStatus = {
      totalPlans: Number(ps0.total_plans),
      paidInFull: Number(ps0.paid_in_full),
      inProgress: Number(ps0.in_progress),
      overdue: Number(ps0.overdue),
      abandoned: Number(ps0.abandoned),
    };

    // Financials
    const fin0 = financialsRow[0] ?? { collected: 0, scheduled: 0, at_risk: 0 };
    const collected = Number(fin0.collected);
    const scheduled = Number(fin0.scheduled);
    const atRisk = Number(fin0.at_risk);
    const financials = {
      collected,
      scheduled,
      contractValue: collected + scheduled,
      atRisk,
    };

    // Plan mix
    const oneTimeCount = Number(
      planMixRows.find((r) => r.kind === "one_time")?.count ?? 0n,
    );
    const installmentCount = Number(
      planMixRows.find((r) => r.kind === "installment")?.count ?? 0n,
    );
    const totalForMix = oneTimeCount + installmentCount;
    const planMix = {
      oneTime: {
        count: oneTimeCount,
        percent: totalForMix > 0 ? (oneTimeCount / totalForMix) * 100 : 0,
      },
      installment: {
        count: installmentCount,
        percent: totalForMix > 0 ? (installmentCount / totalForMix) * 100 : 0,
      },
      avgPlanLength: avgPlanLengthRow[0]?.avg_length
        ? Number(avgPlanLengthRow[0].avg_length.toFixed(1))
        : null,
      avgTimeToFullMonths: avgTimeToFullRow[0]?.avg_months
        ? Number(avgTimeToFullRow[0].avg_months.toFixed(1))
        : null,
    };

    // Currency breakdown — derived from metadata.selectedCurrency on each
    // successful transaction. NGN payments without metadata fall through to
    // a synthetic 'NGN' bucket. Percentages are based on the NGN-equivalent
    // total so they always sum to 100 regardless of FX rates.
    const totalInBase = currencyRows.reduce(
      (s, r) => s + Number(r.amount_in_base),
      0,
    );
    const currencyBreakdown = currencyRows.map((r) => ({
      currency: r.currency,
      amountInBase: Number(r.amount_in_base),
      nativeAmount: Number(r.native_amount),
      count: Number(r.count),
      percent:
        totalInBase > 0 ? (Number(r.amount_in_base) / totalInBase) * 100 : 0,
    }));

    // Scheduled installments — fill missing weeks with 0 so the bar chart
    // always shows 8 buckets.

    const totalDueCount = Number(onTimeRow[0]?.total_due ?? 0n);
    const paidOnTimeCount = Number(onTimeRow[0]?.paid_on_time ?? 0n);
    const onTimeRate =
      totalDueCount > 0
        ? Math.round((paidOnTimeCount / totalDueCount) * 100)
        : null;

    // Top courses with embedded plan mix
    const planMixByCourse = new Map<
      string,
      Array<{ paymentPlan: string; count: number }>
    >();
    for (const row of topCoursesPlanMixRows) {
      const list = planMixByCourse.get(row.courseId) ?? [];
      list.push({ paymentPlan: row.paymentPlan, count: Number(row.count) });
      planMixByCourse.set(row.courseId, list);
    }

    const topCourses = topCourseRows.map((c) => {
      const mix = planMixByCourse.get(c.id) ?? [];
      const totalMixCount = mix.reduce((s, m) => s + m.count, 0);
      return {
        id: c.id,
        title: c.title,
        revenue: Number(c.revenue ?? 0),
        enrollments: Number(c.enrollments ?? 0n),
        planMix:
          totalMixCount > 0
            ? mix.map((m) => ({
                plan: (m.paymentPlan ?? "unknown").toLowerCase(),
                percent: (m.count / totalMixCount) * 100,
              }))
            : [],
      };
    });

    // ---------------------------------------------------------------------
    // Response.
    // ---------------------------------------------------------------------
    res.json({
      summary: {
        currentRevenue,
        previousRevenue,
        growthPercentage,
        transactions: currentPayments.length,
        averageTransaction:
          currentPayments.length > 0
            ? currentRevenue / currentPayments.length
            : 0,
        activityStats,
        activeDuration: duration,
      },
      planStatus,
      financials,
      planMix,
      currencyBreakdown,
      topCourses,
      paymentPlanDistribution: convertBigIntToNumber(paymentPlanDistRows),
      period: {
        type: period || "month",
        current: { start: currentPeriodStart, end: currentPeriodEnd },
        previous: { start: previousPeriodStart, end: previousPeriodEnd },
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({
      error: "Failed to fetch dashboard data",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// 5. List all users with their payment status
salesDashboardApp.get("/users", async (req: Request, res: Response) => {
  try {
    const users = await prismadb.user.findMany({
      where: {
        role: "USER",
      },
      include: {
        paymentStatus: {
          include: {
            course: true,
            cohort: true,
            paymentInstallments: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    res.json(users);
  } catch (error) {
    console.error("Error fetching sales users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

const transactionDetailInclude = {
  paymentStatus: {
    include: {
      user: true,
      course: true,
      cohort: true,
      paymentInstallments: {
        orderBy: { installmentNumber: "asc" as const },
      },
    },
  },
};

const transactionInclude = {
  paymentStatus: {
    include: {
      user: true,
      course: true,
      cohort: true,
      paymentInstallments: {
        select: { paid: true },
      },
    },
  },
};

const withPlanCompletion = <T extends any>(rows: T[]) =>
  rows.map((t: any) => {
    const installments = t.paymentStatus?.paymentInstallments ?? [];
    const planType = t.paymentPlan ?? t.paymentStatus?.paymentPlan;
    const isOneTime = planType === "FULL_PAYMENT" || installments.length === 0;
    const paidCount = installments.filter((i: any) => i.paid).length;
    const totalCount = installments.length;
    const allPaid = totalCount > 0 && paidCount === totalCount;

    return {
      ...t,
      planComplete: isOneTime || allPaid,
      installmentProgress: isOneTime
        ? null
        : { paid: paidCount, total: totalCount },
    };
  });

// 6. List all transactions
salesDashboardApp.get("/transactions", async (req: Request, res: Response) => {
  try {
    const {
      duration = "all",
      gateway,
      status,
      query,
      page = "1",
      limit = "20",
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * take;

    /**
     * -------------------------------------------------------
     * Duration filter
     * -------------------------------------------------------
     */
    let dateFilter: Prisma.PaystackTransactionWhereInput = {};

    if (duration !== "all") {
      let startDate = new Date();

      if (duration === "30d") {
        startDate.setDate(startDate.getDate() - 30);
      } else if (duration === "90d") {
        startDate.setDate(startDate.getDate() - 90);
      } else {
        startDate.setDate(startDate.getDate() - 7);
      }

      startDate.setHours(0, 0, 0, 0);

      dateFilter = {
        createdAt: {
          gte: startDate,
        },
      };
    }

    /**
     * -------------------------------------------------------
     * Transaction status filter
     * -------------------------------------------------------
     * Keep this route transaction-focused.
     * Payment plan states like overdue/in_progress/abandoned
     * should be handled by /payment-plans.
     * -------------------------------------------------------
     */
    const TX_STATUS_VALUES = ["success", "pending", "failed", "expired"];

    let txStatusFilter: any = {};

    if (typeof status === "string" && status !== "all") {
      if (!TX_STATUS_VALUES.includes(status)) {
        return res.status(400).json({
          error:
            "Invalid transaction status. Use success, pending, failed, expired or all.",
        });
      }

      if (status === "failed") {
        txStatusFilter = {
          status: {
            in: ["failed", "expired"],
          },
        };
      } else {
        txStatusFilter = {
          status,
        };
      }
    }

    /**
     * -------------------------------------------------------
     * Gateway validation
     * -------------------------------------------------------
     */
    const validGateways = ["PAYSTACK", "STRIPE", "START_BUTTON"];

    if (
      typeof gateway === "string" &&
      gateway !== "all" &&
      !validGateways.includes(gateway)
    ) {
      return res.status(400).json({
        error: "Invalid payment gateway specified",
      });
    }

    /**
     * -------------------------------------------------------
     * Search filter
     * -------------------------------------------------------
     * Allows search by:
     * - transaction reference
     * - user name/email/phone
     * - course title
     * -------------------------------------------------------
     */
    let searchFilter: any = {};

    if (typeof query === "string" && query.trim()) {
      const search = query.trim();

      const [matchingUsers, matchingCourses] = await Promise.all([
        prismadb.user.findMany({
          where: {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                phone_number: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          },
          select: {
            id: true,
          },
        }),

        prismadb.course.findMany({
          where: {
            title: {
              contains: search,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
          },
        }),
      ]);

      const userIds = matchingUsers.map((user) => user.id);
      const courseIds = matchingCourses.map((course) => course.id);

      searchFilter = {
        OR: [
          {
            transactionRef: {
              contains: search,
              mode: "insensitive",
            },
          },
          ...(userIds.length
            ? [
                {
                  userId: {
                    in: userIds,
                  },
                },
              ]
            : []),
          ...(courseIds.length
            ? [
                {
                  courseId: {
                    in: courseIds,
                  },
                },
              ]
            : []),
        ],
      };
    }

    /**
     * -------------------------------------------------------
     * Fetch both transaction sources
     * -------------------------------------------------------
     *
     * PaystackTransaction is legacy/specialized.
     * PaymentTransaction is unified.
     *
     * If gateway is PAYSTACK, fetch:
     * - PaystackTransaction rows
     * - PaymentTransaction rows where paymentGateway = PAYSTACK
     *
     * If gateway is START_BUTTON/STRIPE/PAYSTACK, only fetch unified rows.
     * -------------------------------------------------------
     */
    const shouldFetchPaystackTable =
      gateway === undefined || gateway === "all" || gateway === "PAYSTACK";

    const unifiedGatewayFilter =
      typeof gateway === "string" && gateway !== "all"
        ? {
            paymentGateway: gateway as PAYMENT_GATEWAY,
          }
        : {};

    const [paystackRows, paymentRows] = await Promise.all([
      shouldFetchPaystackTable
        ? prismadb.paystackTransaction.findMany({
            where: {
              ...dateFilter,
              ...txStatusFilter,
              ...searchFilter,
            },
            include: transactionInclude,
            orderBy: [
              {
                paymentDate: "desc",
              },
              {
                createdAt: "desc",
              },
            ],
          })
        : Promise.resolve([]),

      prismadb.paymentTransaction.findMany({
        where: {
          ...dateFilter,
          ...unifiedGatewayFilter,
          ...txStatusFilter,
          ...searchFilter,
        },
        include: transactionInclude,
        orderBy: [
          {
            paymentDate: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
      }),
    ]);

    /**
     * -------------------------------------------------------
     * Tag source
     * -------------------------------------------------------
     */
    const tagged: any[] = [
      ...paystackRows.map((transaction) => ({
        ...transaction,
        source: "paystack" as const,
        paymentGateway: "PAYSTACK",
      })),
      ...paymentRows.map((transaction) => ({
        ...transaction,
        source: "unified" as const,
      })),
    ];

    /**
     * -------------------------------------------------------
     * Enrich missing paymentStatus
     * -------------------------------------------------------
     * Some old rows may not have paymentStatusId, but they still
     * have userId/courseId. This keeps the UI stable.
     * -------------------------------------------------------
     */
    const missingDataTransactions = tagged.filter(
      (transaction) => !transaction.paymentStatus,
    );

    let enrichedTransactions = tagged;

    if (missingDataTransactions.length > 0) {
      const userIds = [
        ...new Set(
          missingDataTransactions
            .map((transaction) => transaction.userId)
            .filter(Boolean),
        ),
      ];

      const courseIds = [
        ...new Set(
          missingDataTransactions
            .map((transaction) => transaction.courseId)
            .filter(Boolean),
        ),
      ];

      const [users, courses] = await Promise.all([
        userIds.length
          ? prismadb.user.findMany({
              where: {
                id: {
                  in: userIds,
                },
              },
              select: {
                id: true,
                name: true,
                email: true,
                phone_number: true,
              },
            })
          : Promise.resolve([]),

        courseIds.length
          ? prismadb.course.findMany({
              where: {
                id: {
                  in: courseIds,
                },
              },
              select: {
                id: true,
                title: true,
                price: true,
              },
            })
          : Promise.resolve([]),
      ]);

      const userMap = new Map(users.map((user) => [user.id, user]));
      const courseMap = new Map(courses.map((course) => [course.id, course]));

      enrichedTransactions = tagged.map((transaction) => {
        if (transaction.paymentStatus) return transaction;

        return {
          ...transaction,
          paymentStatus: {
            id: transaction.paymentStatusId || null,
            user: userMap.get(transaction.userId) || null,
            course: courseMap.get(transaction.courseId) || null,
            cohort: null,
          },
        };
      });
    }

    /**
     * -------------------------------------------------------
     * Sort, paginate, count
     * -------------------------------------------------------
     */
    const sorted = sortByPaymentDateDesc(
      withPlanCompletion(enrichedTransactions),
    );

    const total = sorted.length;
    const totalPages = Math.ceil(total / take);
    const paginated = sorted.slice(skip, skip + take);

    const countBySource = {
      paystack:
        sorted.filter((transaction) => transaction.source === "paystack")
          .length +
        sorted.filter(
          (transaction) =>
            transaction.source === "unified" &&
            transaction.paymentGateway === "PAYSTACK",
        ).length,

      stripe: sorted.filter(
        (transaction) =>
          transaction.source === "unified" &&
          transaction.paymentGateway === "STRIPE",
      ).length,

      startButton: sorted.filter(
        (transaction) =>
          transaction.source === "unified" &&
          transaction.paymentGateway === "START_BUTTON",
      ).length,
    };

    return res.json({
      transactions: paginated,
      count: paginated.length,
      total,
      countBySource,
      pagination: {
        page: pageNumber,
        limit: take,
        total,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);

    res.status(500).json({
      error: "Failed to fetch transactions",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// 7. Single transaction details
salesDashboardApp.get(
  "/transactions/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { source } = req.query;

      let transaction: any = null;
      let txSource: "paystack" | "unified" | null = null;

      const include = {
        paymentStatus: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone_number: true,
              },
            },
            course: true,
            cohort: true,
            paymentInstallments: {
              orderBy: { installmentNumber: "asc" as const },
            },
            paystackTransactions: {
              orderBy: { createdAt: "desc" as const },
            },
            transactions: {
              orderBy: { createdAt: "desc" as const },
            },
          },
        },
      };

      if (source === "paystack") {
        transaction = await prismadb.paystackTransaction.findUnique({
          where: { id },
          include,
        });
        if (transaction) txSource = "paystack";
      } else if (source === "unified") {
        transaction = await prismadb.paymentTransaction.findUnique({
          where: { id },
          include,
        });
        if (transaction) txSource = "unified";
      } else {
        const [paystackTx, paymentTx] = await Promise.all([
          prismadb.paystackTransaction.findUnique({ where: { id }, include }),
          prismadb.paymentTransaction.findUnique({ where: { id }, include }),
        ]);

        if (paystackTx) {
          transaction = paystackTx;
          txSource = "paystack";
        } else if (paymentTx) {
          transaction = paymentTx;
          txSource = "unified";
        }
      }

      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      const metadata = parseMetadata(transaction.metadata);
      const paymentStatus = transaction.paymentStatus;

      let matchedInstallment = null;

      if (paymentStatus?.paymentInstallments?.length) {
        if (metadata.installmentNumber) {
          matchedInstallment =
            paymentStatus.paymentInstallments.find(
              (i: any) =>
                Number(i.installmentNumber) ===
                Number(metadata.installmentNumber),
            ) ?? null;
        }

        if (!matchedInstallment) {
          matchedInstallment =
            paymentStatus.paymentInstallments.find(
              (i: any) =>
                Number(i.amount) === Number(transaction.amount) && i.paid,
            ) ?? null;
        }
      }

      if (!paymentStatus) {
        const [user, course] = await Promise.all([
          prismadb.user.findUnique({
            where: { id: transaction.userId },
            select: {
              id: true,
              name: true,
              email: true,
              phone_number: true,
            },
          }),
          prismadb.course.findUnique({
            where: { id: transaction.courseId },
          }),
        ]);

        return res.json({
          ...transaction,
          source: txSource,
          metadataParsed: metadata,
          isInstallmentPayment: Boolean(metadata.installmentNumber),
          matchedInstallment: null,
          paymentStatus: {
            user,
            course,
            cohort: null,
            status: transaction.status,
            paymentPlan: transaction.paymentPlan,
            paymentInstallments: [],
          },
        });
      }

      const plan = serializePaymentPlan(paymentStatus);

      return res.json({
        ...transaction,
        source: txSource,
        metadataParsed: metadata,
        isInstallmentPayment: Boolean(
          matchedInstallment || metadata.installmentNumber,
        ),
        matchedInstallment,
        paymentStatus: plan,
      });
    } catch (error) {
      console.error("Error fetching transaction detail:", error);
      res.status(500).json({ error: "Failed to fetch transaction detail" });
    }
  },
);

// 8. Export to Google Sheets
salesDashboardApp.post(
  "/export-to-sheets",
  async (req: Request, res: Response) => {
    try {
      const { GoogleSheetsSyncService } =
        await import("../../utils/googleSheets");
      const result = await GoogleSheetsSyncService.syncPaymentData();

      if (result && result.success) {
        const spreadsheetId = process.env.GOOGLE_SHEETS_PAYMENTS_SPREADSHEET_ID;
        const sheetUrl = spreadsheetId
          ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
          : null;

        res.json({
          success: true,
          message: `Successfully exported ${result.count} records to Google Sheets.`,
          sheetUrl,
        });
      } else {
        res.status(500).json({
          success: false,
          error: result?.error || "Unknown error occurred during sync",
        });
      }
    } catch (error) {
      console.error("Error exporting to sheets:", error);
      res.status(500).json({
        success: false,
        error: "Failed to export data to Google Sheets",
      });
    }
  },
);

salesDashboardApp.get(
  "/payment-plans/create-options",
  async (_req: Request, res: Response) => {
    try {
      const [users, courses] = await Promise.all([
        prismadb.user.findMany({
          where: {
            role: "USER",
          },
          select: {
            id: true,
            name: true,
            email: true,
            phone_number: true,
          },
          orderBy: {
            name: "asc",
          },
        }),

        prismadb.course.findMany({
          select: {
            id: true,
            title: true,
            price: true,
            discount: true,
            pricingPlans: {
              orderBy: {
                installmentsCount: "asc",
              },
            },
            cohorts: {
              select: {
                id: true,
                name: true,
                startDate: true,
                endDate: true,
              },
              orderBy: {
                startDate: "desc",
              },
            },
          },
          orderBy: {
            title: "asc",
          },
        }),
      ]);

      res.json({
        users,
        courses,
      });
    } catch (error) {
      console.error("Error fetching create payment plan options:", error);
      res.status(500).json({
        error: "Failed to fetch payment plan create options",
      });
    }
  },
);

salesDashboardApp.get(
  "/payment-plans/preview",
  async (req: Request, res: Response) => {
    try {
      const { courseId, cohortId, planType } = req.query;

      if (!courseId || !planType) {
        return res.status(400).json({
          error: "courseId and planType are required",
        });
      }

      const course = await prismadb.course.findUnique({
        where: {
          id: String(courseId),
        },
        include: {
          pricingPlans: true,
        },
      });

      if (!course) {
        return res.status(404).json({
          error: "Course not found",
        });
      }

      const pricingPlan = course.pricingPlans.find(
        (plan) => plan.planType === String(planType),
      );

      if (!pricingPlan) {
        return res.status(404).json({
          error: "Pricing plan not found for selected course",
        });
      }

      const cohort = cohortId
        ? await prismadb.cohort.findUnique({
            where: {
              id: String(cohortId),
            },
          })
        : null;

      const installments = buildInstallmentSchedule({
        amountPerInstallment: pricingPlan.amountPerInstallment,
        installmentsCount: pricingPlan.installmentsCount,
        cohortStartDate: cohort?.startDate || null,
      });

      const expectedAmount =
        pricingPlan.installmentsCount > 1
          ? pricingPlan.amountPerInstallment * pricingPlan.installmentsCount
          : pricingPlan.amountPerInstallment || Number(course.price || 0);

      res.json({
        course,
        cohort,
        pricingPlan,
        expectedAmount,
        installments,
      });
    } catch (error) {
      console.error("Error previewing payment plan:", error);
      res.status(500).json({
        error: "Failed to preview payment plan",
      });
    }
  },
);

salesDashboardApp.get("/payment-plans", async (req: Request, res: Response) => {
  try {
    const {
      query,
      userId,
      courseId,
      status,
      dateFrom,
      dateTo,
      page = "1",
      limit = "20",
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (pageNumber - 1) * take;

    const where: Prisma.PaymentStatusWhereInput = {};

    if (typeof userId === "string" && userId) {
      where.userId = userId;
    }

    if (typeof courseId === "string" && courseId) {
      where.courseId = courseId;
    }

    if (typeof status === "string" && status && status !== "all") {
      where.status = status as any;
    }

    if (typeof dateFrom === "string" || typeof dateTo === "string") {
      where.createdAt = {
        ...(typeof dateFrom === "string" && dateFrom
          ? { gte: new Date(dateFrom) }
          : {}),
        ...(typeof dateTo === "string" && dateTo
          ? { lte: new Date(dateTo) }
          : {}),
      };
    }

    if (typeof query === "string" && query.trim()) {
      where.OR = [
        {
          user: {
            name: {
              contains: query.trim(),
              mode: "insensitive",
            },
          },
        },
        {
          user: {
            email: {
              contains: query.trim(),
              mode: "insensitive",
            },
          },
        },
        {
          course: {
            title: {
              contains: query.trim(),
              mode: "insensitive",
            },
          },
        },
      ];
    }

    const include = {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone_number: true,
        },
      },
      course: true,
      cohort: true,
      paymentInstallments: {
        orderBy: { installmentNumber: "asc" as const },
      },
      paystackTransactions: true,
      transactions: true,
    };

    const [rows, total] = await Promise.all([
      prismadb.paymentStatus.findMany({
        where,
        include,
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take,
      }),
      prismadb.paymentStatus.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(total / take);

    res.json({
      paymentPlans: rows.map(serializePaymentPlan),
      pagination: {
        page: pageNumber,
        limit: take,
        total,
        totalPages,
        hasNextPage: pageNumber < totalPages,
        hasPrevPage: pageNumber > 1,
      },
    });
  } catch (error) {
    console.error("Error fetching payment plans:", error);
    res.status(500).json({
      error: "Failed to fetch payment plans",
    });
  }
});

salesDashboardApp.get(
  "/payment-plans/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const paymentPlan = await prismadb.paymentStatus.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone_number: true,
            },
          },
          course: true,
          cohort: true,
          paymentInstallments: {
            orderBy: { installmentNumber: "asc" },
          },
          paystackTransactions: {
            orderBy: { createdAt: "desc" },
          },
          transactions: {
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!paymentPlan) {
        return res.status(404).json({ error: "Payment plan not found" });
      }

      res.json(serializePaymentPlan(paymentPlan));
    } catch (error) {
      console.error("Error fetching payment plan detail:", error);
      res.status(500).json({ error: "Failed to fetch payment plan detail" });
    }
  },
);

salesDashboardApp.post(
  "/payment-plans",
  async (req: Request, res: Response) => {
    try {
      const { userId, courseId, cohortId, planType, notes } = req.body;

      if (!userId || !courseId || !planType) {
        return res.status(400).json({
          error: "userId, courseId and planType are required",
        });
      }

      const [user, course, existingPaymentStatus] = await Promise.all([
        prismadb.user.findUnique({
          where: { id: userId },
        }),

        prismadb.course.findUnique({
          where: { id: courseId },
          include: {
            pricingPlans: true,
          },
        }),

        prismadb.paymentStatus.findUnique({
          where: {
            userId_courseId: {
              userId,
              courseId,
            },
          },
        }),
      ]);

      if (!user) {
        return res.status(404).json({
          error: "User not found",
        });
      }

      if (!course) {
        return res.status(404).json({
          error: "Course not found",
        });
      }

      if (existingPaymentStatus) {
        return res.status(409).json({
          error: "This user already has a payment plan for this course",
          paymentStatusId: existingPaymentStatus.id,
        });
      }

      const pricingPlan = course.pricingPlans.find(
        (plan) => plan.planType === planType,
      );

      if (!pricingPlan) {
        return res.status(404).json({
          error: "Pricing plan not found for selected course",
        });
      }

      let cohort = null;

      if (cohortId) {
        cohort = await prismadb.cohort.findUnique({
          where: {
            id: cohortId,
          },
        });

        if (!cohort) {
          return res.status(404).json({
            error: "Cohort not found",
          });
        }
      }

      const installments = buildInstallmentSchedule({
        amountPerInstallment: pricingPlan.amountPerInstallment,
        installmentsCount: pricingPlan.installmentsCount,
        cohortStartDate: cohort?.startDate || null,
      });

      const expectedAmount =
        pricingPlan.installmentsCount > 1
          ? pricingPlan.amountPerInstallment * pricingPlan.installmentsCount
          : pricingPlan.amountPerInstallment || Number(course.price || 0);

      const paymentStatus = await prismadb.paymentStatus.create({
        data: {
          userId,
          courseId,
          cohortId: cohortId || null,
          paymentPlan: planType,
          paymentType: planType,
          expectedAmount,
          notes,
          manuallyCreated: true,
          desiredStartDate: cohort?.startDate || null,
          status:
            pricingPlan.installmentsCount > 1
              ? "BALANCE_HALF_PAYMENT"
              : "PENDING_SEAT_CONFIRMATION",
          paymentInstallments:
            installments.length > 0
              ? {
                  create: installments.map((item) => ({
                    amount: item.amount,
                    dueDate: item.dueDate,
                    installmentNumber: item.installmentNumber,
                    paid: false,
                  })),
                }
              : undefined,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone_number: true,
            },
          },
          course: true,
          cohort: true,
          paymentInstallments: {
            orderBy: {
              installmentNumber: "asc",
            },
          },
          paystackTransactions: true,
          transactions: true,
        },
      });

      res.status(201).json(serializePaymentPlan(paymentStatus));
    } catch (error) {
      console.error("Error creating payment plan:", error);
      res.status(500).json({
        error: "Failed to create payment plan",
      });
    }
  },
);

salesDashboardApp.patch(
  "/payment-installments/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { amount, dueDate, paid } = req.body;

      const installment = await prismadb.paymentInstallment.update({
        where: { id },
        data: {
          ...(amount !== undefined ? { amount: Number(amount) } : {}),
          ...(dueDate !== undefined ? { dueDate: new Date(dueDate) } : {}),
          ...(paid !== undefined ? { paid: Boolean(paid) } : {}),
        },
      });

      res.json(installment);
    } catch (error) {
      console.error("Error updating installment:", error);
      res.status(500).json({ error: "Failed to update installment" });
    }
  },
);

export default salesDashboardApp;
