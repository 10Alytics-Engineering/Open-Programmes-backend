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
} from "../../utils/paymentService";
import { Prisma } from "@prisma/client";

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
    },
  },
};

// 6. List all transactions
salesDashboardApp.get("/transactions", async (req: Request, res: Response) => {
  try {
    const { duration = "all", gateway, status } = req.query; // Default to all for list page unless specified
    let dateFilter = {};

    if (duration !== "all") {
      let startDate = new Date();
      if (duration === "30d") {
        startDate.setDate(startDate.getDate() - 30);
      } else if (duration === "90d") {
        startDate.setDate(startDate.getDate() - 90);
      } else {
        startDate.setDate(startDate.getDate() - 7); // Default 7d
      }
      startDate.setHours(0, 0, 0, 0);
      dateFilter = {
        createdAt: {
          gte: startDate,
        },
      };
    }

    const TX_STATUS_VALUES = ["success", "pending", "failed"];
    let txStatusFilter: any = {};
    if (typeof status === "string" && TX_STATUS_VALUES.includes(status)) {
      if (status === "failed") {
        txStatusFilter = { status: { in: ["failed", "expired"] } };
      } else {
        txStatusFilter = { status };
      }
    }

    const PLAN_STATUS_VALUES = [
      "paid_in_full",
      "in_progress",
      "overdue",
      "abandoned",
    ];
    let planStatusFilter: string[] | null = null;

    if (typeof status === "string" && PLAN_STATUS_VALUES.includes(status)) {
      // Build the WHERE clause for this status. Each clause asserts the plan
      // matches *this* bucket AND doesn't qualify for any higher-priority bucket.
      // Priority order matches the dashboard CASE statement:
      //   paid_in_full > overdue > in_progress > abandoned
      // This keeps the dashboard counts and the click-through results in sync.

      const isPaidInFull = Prisma.sql`
        status_text != 'EXPIRED' AND (
          ("paymentPlan" = 'FULL_PAYMENT' AND has_success_tx)
          OR (total_count > 0 AND paid_count = total_count)
        )
      `;

      const isOverdue = Prisma.sql`
        status_text != 'EXPIRED' AND overdue_count > 0
      `;

      const isInProgress = Prisma.sql`
        status_text != 'EXPIRED'
        AND "paymentPlan" != 'FULL_PAYMENT'
        AND "paymentPlan" IS NOT NULL
        AND total_count > 0
        AND paid_count > 0
        AND paid_count < total_count
        AND overdue_count = 0
      `;

      const isAbandoned = Prisma.sql`
        (
          ("paymentPlan" = 'FULL_PAYMENT' AND tx_count > 0 AND NOT has_success_tx AND NOT has_pending_tx)
          OR ("paymentPlan" != 'FULL_PAYMENT' AND "paymentPlan" IS NOT NULL AND NOT has_success_tx AND NOT has_pending_tx)
        )
      `;

      let classificationSql: Prisma.Sql;
      if (status === "paid_in_full") {
        // Highest priority — no exclusions needed.
        classificationSql = isPaidInFull;
      } else if (status === "overdue") {
        // Excludes paid_in_full.
        classificationSql = Prisma.sql`NOT (${isPaidInFull}) AND ${isOverdue}`;
      } else if (status === "in_progress") {
        // Excludes paid_in_full and overdue.
        classificationSql = Prisma.sql`
          NOT (${isPaidInFull})
          AND NOT (${isOverdue})
          AND ${isInProgress}
        `;
      } else if (status === "abandoned") {
        // Excludes everything above it.
        classificationSql = Prisma.sql`
          NOT (${isPaidInFull})
          AND ${isAbandoned}
        `;
      } else {
        // Defensive fallback — should be unreachable since we checked PLAN_STATUS_VALUES.
        classificationSql = Prisma.sql`FALSE`;
      }

      const matchingPlans = await prismadb.$queryRaw<Array<{ id: string }>>`
    WITH ps_state AS (
      SELECT
        ps.id,
        ps.status::text AS status_text,
        ps."paymentPlan",
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
        COUNT(pi.id) FILTER (WHERE pi.paid = false AND pi."dueDate" < NOW()) AS overdue_count,
        COUNT(pi.id) FILTER (WHERE pi.paid = true) AS paid_count,
        COUNT(pi.id) AS total_count
      FROM "PaymentStatus" ps
      LEFT JOIN "PaymentInstallment" pi ON pi."paymentStatusId" = ps.id
      GROUP BY ps.id, ps.status, ps."paymentPlan"
    )
    SELECT id FROM ps_state WHERE ${classificationSql}
  `;

      planStatusFilter = matchingPlans.map((p) => p.id);

      if (planStatusFilter.length === 0) {
        return res.json({
          transactions: [],
          count: 0,
          countBySource: { paystack: 0, unified: 0 },
        });
      }
    }

    if (
      gateway &&
      gateway !== "PAYSTACK" &&
      gateway !== "STRIPE" &&
      gateway !== "START_BUTTON"
    ) {
      return res
        .status(400)
        .json({ error: "Invalid payment gateway specified" });
    }

    const [paystackRows, paymentRows] = await Promise.all([
      gateway === "PAYSTACK" || gateway === undefined
        ? prismadb.paystackTransaction.findMany({
            where: {
              ...dateFilter,
              ...txStatusFilter,
              ...(planStatusFilter
                ? { paymentStatusId: { in: planStatusFilter } }
                : {}),
            },
            include: transactionInclude,
            orderBy: { paymentDate: "desc" },
          })
        : Promise.resolve([]),

      prismadb.paymentTransaction.findMany({
        where: {
          ...dateFilter,
          ...(gateway && { paymentGateway: gateway as PAYMENT_GATEWAY }),
          ...txStatusFilter,
          ...(planStatusFilter
            ? { paymentStatusId: { in: planStatusFilter } }
            : {}),
        },
        include: transactionInclude,
        orderBy: { paymentDate: "desc" },
      }),
    ]);

    // Tag each row with its source so the frontend can disambiguate.
    const tagged: any[] = [
      ...paystackRows.map((t) => ({ ...t, source: "paystack" as const })),
      ...paymentRows.map((t) => ({ ...t, source: "unified" as const })),
    ];

    // Check if we need to manually fill in some user/course data
    const missingDataTransactions = tagged.filter((t) => !t.paymentStatus);

    if (missingDataTransactions.length > 0) {
      const userIds = [
        ...new Set(missingDataTransactions.map((t) => t.userId)),
      ];
      const courseIds = [
        ...new Set(missingDataTransactions.map((t) => t.courseId)),
      ];

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

      const userMap = new Map(users.map((u) => [u.id, u]));
      const courseMap = new Map(courses.map((c) => [c.id, c]));

      const enrichedTransactions = tagged.map((t) => {
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
              paymentInstallments: [] as any[],
            },
          };
        }
        return t;
      });

      const sorted = sortByPaymentDateDesc(enrichedTransactions);
      return res.json({
        transactions: sorted,
        count: sorted.length,
        countBySource: {
          paystack:
            sorted.filter((t) => t.source === "paystack").length +
            sorted.filter(
              (t) => t.source === "unified" && t.paymentGateway === "PAYSTACK",
            ).length,
          stripe: sorted.filter(
            (t) => t.source === "unified" && t.paymentGateway === "STRIPE",
          ).length,
          startButton: sorted.filter(
            (t) =>
              t.source === "unified" && t.paymentGateway === "START_BUTTON",
          ).length,
        },
      });
    }

    const sorted = sortByPaymentDateDesc(tagged);
    res.json({
      transactions: sorted,
      count: sorted.length,
      countBySource: {
        paystack:
          sorted.filter((t) => t.source === "paystack").length +
          sorted.filter(
            (t) => t.source === "unified" && t.paymentGateway === "PAYSTACK",
          ).length,
        stripe: sorted.filter(
          (t) => t.source === "unified" && t.paymentGateway === "STRIPE",
        ).length,
        startButton: sorted.filter(
          (t) => t.source === "unified" && t.paymentGateway === "START_BUTTON",
        ).length,
      },
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
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

      if (source === "paystack") {
        transaction = await prismadb.paystackTransaction.findUnique({
          where: { id },
          include: transactionDetailInclude,
        });
        if (transaction) txSource = "paystack";
      } else if (source === "unified") {
        transaction = await prismadb.paymentTransaction.findUnique({
          where: { id },
          include: transactionDetailInclude,
        });
        if (transaction) txSource = "unified";
      } else {
        // No source hint — try both in parallel and take whichever hits.
        const [paystackTx, paymentTx] = await Promise.all([
          prismadb.paystackTransaction.findUnique({
            where: { id },
            include: transactionDetailInclude,
          }),
          prismadb.paymentTransaction.findUnique({
            where: { id },
            include: transactionDetailInclude,
          }),
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

      // const paymentInstallments = await prismadb.paymentInstallment.findMany({
      //   where: {
      //     paymentStatusId: transaction.paymentStatusId,
      //   },
      //   orderBy: { installmentNumber: "asc" },
      // });

      // Manual enrichment if paymentStatus is null
      if (!transaction.paymentStatus) {
        const [user, course] = await Promise.all([
          prismadb.user.findUnique({
            where: { id: transaction.userId },
            select: { id: true, name: true, email: true, phone_number: true },
          }),
          prismadb.course.findUnique({
            where: { id: transaction.courseId },
            select: { id: true, title: true },
          }),
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
            paymentInstallments: [] as any[],
          },
        };

        return res.json({ ...enrichedTransaction });
      }

      res.json({ ...transaction });
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

export default salesDashboardApp;
