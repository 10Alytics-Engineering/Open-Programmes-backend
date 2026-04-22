import express from "express";
import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { Paystack } from "paystack-sdk";
import { Prisma, PaymentStatusType } from "@prisma/client";
import jwt from "jsonwebtoken";
import {
  sendPurchaseConfirmationMail,
  sendPaymentReminder,
  sendPaymentConfirmation,
  sendSecondHalfReminder,
  sendAccountDeactivationNotification,
  sendWrongfulDeactivationAlert,
} from "./mail";
import cron from "node-cron";
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  isWithinInterval,
} from "date-fns";
import {
  convertNairaToOtherCurrency,
  CurrrencyType,
  initiateStartButtonPayment,
  verifyStartButtonTransaction,
} from "../../utils/paymentService";

if (!process.env.PAYSTACK_SECRET_KEY) {
  console.warn("⚠️ PAYSTACK_SECRET_KEY is missing from environment variables!");
}

const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY as string);
const paymentApp = express.Router();
paymentApp.use(express.json());

// Logging middleware for payment routes
paymentApp.use((req, res, next) => {
  console.log(`[Payment] ${req.method} ${req.path}`, req.body || req.query);
  next();
});

// Define payment plans as constants
const PAYMENT_PLANS = {
  FULL_PAYMENT: "FULL_PAYMENT",
  TWO_INSTALLMENTS: "TWO_INSTALLMENTS",
  THREE_INSTALLMENTS: "THREE_INSTALLMENTS",
  FOUR_INSTALLMENTS: "FOUR_INSTALLMENTS",
  FIVE_INSTALLMENTS: "FIVE_INSTALLMENTS",
  // Legacy
  FIRST_HALF_COMPLETE: "FIRST_HALF_COMPLETE",
  SECOND_HALF_PAYMENT: "SECOND_HALF_PAYMENT",
} as const;

type PAYMENT_GATEWAY = "STRIPE" | "PAYSTACK" | "START_BUTTON";

type PaymentPlan = (typeof PAYMENT_PLANS)[keyof typeof PAYMENT_PLANS] | null;

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
const getCohortSchedule = (startDate: Date) => ({
  seatReservationDue: new Date(startDate),
  cohortAccessDue: addMonths(startDate, 0),
  month1Due: addMonths(startDate, 1),
  month2Due: addMonths(startDate, 2),
});

const getThreeInstallmentSchedule = (startDate: Date) => ({
  initialPaymentDue: new Date(startDate),
  month1Due: addMonths(startDate, 1),
  month2Due: addMonths(startDate, 2),
});

async function getCourseDetails(courseId: string) {
  return prismadb.course.findUniqueOrThrow({
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
function parseCoursePrice(raw: string | null | undefined): number {
  if (!raw) return TOTAL_COURSE_FEE;
  const parsed = Number(String(raw).replace(/,/g, "").trim());
  return parsed > 0 ? parsed : TOTAL_COURSE_FEE;
}

async function getUserDetails(userId: string) {
  return prismadb.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      phone_number: true,
    },
  });
}

function validatePaymentPlan(input: string | null | undefined): PaymentPlan {
  if (!input) return null;
  return Object.values(PAYMENT_PLANS).includes(input as any)
    ? (input as PaymentPlan)
    : null;
}

// Helper to get payment plan from either new or old field
async function getPaymentPlanFromRecord(record: any): Promise<PaymentPlan> {
  return record.paymentPlan || record.paymentType || null;
}

function getPaymentPlan(record: any): PaymentPlan {
  return record.paymentPlan || record.paymentType || null;
}

async function assignToSelectedCohort(
  tx: Prisma.TransactionClient,
  userId: string,
  courseId: string,
  cohortName: string,
  paymentPlan?: PaymentPlan,
) {
  // Fetch all cohorts for the course to perform robust matching
  const course = await tx.course.findUniqueOrThrow({
    where: { id: courseId },
    include: {
      cohorts: true, // Fetch all cohorts
    },
  });

  // Find cohort with case-insensitive and whitespace-insensitive matching
  const targetCohort = course.cohorts.find(
    (c) => c.name.trim().toLowerCase() === cohortName.trim().toLowerCase(),
  );

  if (!targetCohort) {
    throw new Error(`Cohort "${cohortName}" not found for this course`);
  }

  let isPaymentActive = false;

  if (paymentPlan === PAYMENT_PLANS.FULL_PAYMENT) {
    isPaymentActive = true;
  } else if (paymentPlan === PAYMENT_PLANS.FIRST_HALF_COMPLETE) {
    isPaymentActive = true;
  } else if (paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS) {
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

async function sendPaymentNotifications(
  userId: string,
  courseId: string,
  installmentNumber?: number,
) {
  const [user, course, paymentStatus] = await Promise.all([
    getUserDetails(userId),
    getCourseDetails(courseId),
    prismadb.paymentStatus.findUnique({
      where: { userId_courseId: { userId, courseId } },
      include: {
        paymentInstallments: { orderBy: { installmentNumber: "asc" } },
        cohort: true,
      },
    }),
  ]);

  if (!paymentStatus) return;

  const paymentPlan = await getPaymentPlanFromRecord(paymentStatus);

  if (paymentPlan === PAYMENT_PLANS.FULL_PAYMENT) {
    await sendPurchaseConfirmationMail(
      user.email!,
      course.title,
      user.name || "Student",
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    );
  } else if (paymentPlan === PAYMENT_PLANS.FIRST_HALF_COMPLETE) {
    if (paymentStatus.status === PaymentStatusType.COMPLETE) {
      await sendPurchaseConfirmationMail(
        user.email!,
        course.title,
        user.name || "Student",
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      );
    } else {
      await sendPaymentConfirmation(
        user.email!,
        user.name || "Student",
        course.title,
        1,
      );
    }
  } else if (
    paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS &&
    installmentNumber
  ) {
    if (installmentNumber === 4) {
      await sendPurchaseConfirmationMail(
        user.email!,
        course.title,
        user.name || "Student",
        `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
      );
    } else {
      await sendPaymentConfirmation(
        user.email!,
        user.name || "Student",
        course.title,
        installmentNumber,
      );
    }
  }
}

// Add better error logging
const logPaymentError = (message: string, data: any = {}) => {
  console.error(`[PAYMENT_ERROR] ${message}`, JSON.stringify(data, null, 2));
};
//#endregion

paymentApp.post("/convert-ngn-to-other-currencies", async (req, res) => {
  const { currency, amountInNGN } = req.body;

  const result = await convertNairaToOtherCurrency(currency, amountInNGN);

  if (!result.status)
    return res.status(500).json({
      status: "failed",
      error: "Failed to process currency conversion",
    });

  return res.json(result);
});

//#region Payment Status Check
paymentApp.get("/payment-status", async (req: Request, res: Response) => {
  const { userId, courseId } = req.query;

  if (!userId || !courseId) {
    return res
      .status(400)
      .json({ error: "Missing required parameters: userId and courseId" });
  }

  try {
    const [paymentStatus, course] = await Promise.all([
      prismadb.paymentStatus.findUnique({
        where: {
          userId_courseId: {
            userId: userId as string,
            courseId: courseId as string,
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
      prismadb.course.findUnique({
        where: { id: courseId as string },
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
      PAYMENT_PLANS.TWO_INSTALLMENTS,
      PAYMENT_PLANS.THREE_INSTALLMENTS,
      PAYMENT_PLANS.FOUR_INSTALLMENTS,
      PAYMENT_PLANS.FIVE_INSTALLMENTS,
    ].includes(paymentPlan as any);

    if (
      paymentPlan === PAYMENT_PLANS.FIRST_HALF_COMPLETE &&
      paymentStatus.status === PaymentStatusType.BALANCE_HALF_PAYMENT
    ) {
      remainingAmount = halfFee;
    } else if (isMultiInstallment) {
      // Sum of all unpaid installment amounts — the true remaining balance
      remainingAmount = paymentStatus.paymentInstallments
        .filter((i) => !i.paid)
        .reduce((sum, i) => sum + i.amount, 0);
    }

    res.json({
      ...paymentStatus,
      remainingAmount,
    });
  } catch (error) {
    console.error("Error fetching payment status:", error);
    res.status(500).json({
      error: "Failed to fetch payment status",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

//#region Link Generation
paymentApp.get("/payment-link", async (req: Request, res: Response) => {
  const {
    userId,
    courseId,
    planType,
    channels,
    paymentGateway,
    currency,
    paymentMethods,
  } = req.query;

  if (!userId || !courseId) {
    return res.status(400).json({ error: "Missing userId or courseId" });
  }

  try {
    // Validate planType if provided
    const validPlanTypes = ["FULL", "HALF", "THREE_INSTALLMENT", "INSTALLMENT"];
    if (planType && !validPlanTypes.includes(planType as string)) {
      return res.status(400).json({ error: "Invalid plan type" });
    }

    // First find the payment status record for this user and course
    const paymentStatus = await prismadb.paymentStatus.findUnique({
      where: {
        userId_courseId: {
          userId: userId as string,
          courseId: courseId as string,
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
          error:
            "No cohort assigned. Please initiate payment through the normal flow first.",
        });
      }

      const [user, course] = await Promise.all([
        getUserDetails(userId as string),
        getCourseDetails(courseId as string),
      ]);

      // Use the cohort name from existing payment status
      const cohortName = paymentStatus.cohort.name;

      const paymentData = getPaymentData(
        planType as string,
        cohortName,
        course,
      );
      if (!paymentData) {
        return res.status(400).json({ error: "Invalid plan type" });
      }

      // Check for existing pending transaction that MATCHES this plan and amount
      const pendingTx = paymentStatus.transactions.find(
        (tx) =>
          tx.paymentPlan === paymentData.callbackParams.paymentPlan &&
          tx.amount === paymentData.amount.toString(),
      );

      if (pendingTx?.authorizationUrl) {
        return res.json({
          authorizationUrl: pendingTx.authorizationUrl,
          exists: true,
        });
      }

      const conversionData = await convertNairaToOtherCurrency(
        currency as CurrrencyType,
        paymentData.amount,
      );

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
          email: user.email!,
          channels: (channels as string[]) || [
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
        await prismadb.paymentTransaction.create({
          data: {
            transactionRef: paymentLink.data.reference,
            userId: userId as string,
            courseId: courseId as string,
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
      } else {
        const paymentLink = await initiateStartButtonPayment(
          user.email,
          conversionData.amount * 100,
          (currency as CurrrencyType) || "NGN",
          metadata,
          paymentMethods as string[],
        );

        if (!paymentLink?.url) {
          console.log("Start button payment link error", paymentLink);
          res.status(500).json({
            error: "Failed to fetch payment link",
            details:
              "An error occured while processing start button payment link",
          });
        }

        await prismadb.paymentTransaction.create({
          data: {
            transactionRef: paymentLink.reference,
            userId: userId as string,
            courseId: courseId as string,
            amount: paymentData.amount.toString(),
            status: "pending",
            authorizationUrl: paymentLink.url,
            paymentPlan: paymentData.callbackParams.paymentPlan,
            metadata: JSON.stringify(paymentData.metadata),
            paymentGateway: paymentGateway as PAYMENT_GATEWAY,
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
  } catch (error) {
    console.error("Error fetching payment link:", error);
    res.status(500).json({
      error: "Failed to fetch payment link",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

paymentApp.get("/start-button-test", async (req: Request, res: Response) => {
  try {
    // const paymentData = await initiateStartButtonPayment(
    //   "ebirenidavid@gmail.com",
    //   110000,
    //   "GHS",
    //   { userId: "748374H43Jsadaa" },
    //   ["card", "mobile_money"],
    // // );
    // const converted = await convertNairaToOtherCurrency("GHS", 40000);
    // const paymentData = await verifyStartButtonTransaction("RXVKFA3YJDA");
    // return res.status(200).json({ converted });

    const results = await prismadb.paymentTransaction.findMany({
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    res.status(200).json({ results });
  } catch (error) {
    console.log("Start Button Error: " + error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

//#region Payment Initialization Endpoints
paymentApp.post("/initiate-payment", async (req: Request, res: Response) => {
  const {
    courseId,
    userId,
    planType,
    cohortName,
    isIWD,
    applicationId,
    amount,
    channels,
    installmentNumber,
    paymentGateway,
    currency,
  } = req.body;

  try {
    let email = "";
    let name = "";
    let phone = "";

    if (isIWD && applicationId) {
      const application = await prismadb.scholarshipApplication.findUnique({
        where: { id: applicationId },
      });
      if (!application)
        return res.status(404).json({ error: "Application not found" });
      email = application.email;
      name = application.fullName;
      phone = application.phone_number;
    } else {
      if (!userId) return res.status(400).json({ error: "Missing userId" });
      const user = await getUserDetails(userId);
      email = user.email!;
      name = user.name || "Student";
      phone = user.phone_number || "";
    }

    const course = await getCourseDetails(courseId);

    let existingPayment = userId
      ? await prismadb.paymentStatus.findUnique({
          where: { userId_courseId: { userId, courseId } },
          include: { paymentInstallments: true },
        })
      : null;

    // Reset layout if they previously started a different plan but haven't actually paid yet
    if (
      existingPayment &&
      existingPayment.status === "PENDING_SEAT_CONFIRMATION"
    ) {
      await prismadb.paymentStatus.delete({
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

    const [pendingTx] = await prismadb.paymentTransaction.findMany({
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
    const conversionData = await convertNairaToOtherCurrency(
      currency,
      paymentData.amount,
    );

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
        url: paystackLink.data.authorization_url,
        reference: paystackLink.data.reference,
      };
    } else {
      const startButtonLink = await initiateStartButtonPayment(
        email,
        conversionData.amount * 100,
        (currency as CurrrencyType) || "NGN",
        metadata,
        channels as string[],
      );

      if (!startButtonLink?.url) {
        console.log("Start button payment link error", startButtonLink);
        res.status(422).json({
          error: "Failed to fetch payment link",
          details:
            "An error occured while processing start button payment link",
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

    const transaction = await prismadb.$transaction(
      async (tx) => {
        if (userId && !existingPayment) {
          await createPaymentStatus(tx, {
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
              installmentNumber:
                installmentNumber ??
                paymentData.callbackParams.installmentNumber ??
                1,
              cohortName,
            }),
            paymentDate: new Date(),
          },
        });
      },
      {
        maxWait: 20000,
        timeout: 15000,
      },
    );

    res.json({
      authorizationUrl: paymentLink.url,
      isExisting: false,
    });
  } catch (error) {
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
function getPaymentData(planType: string, cohortName: string, course: any) {
  // Find the specific plan for this course
  const plan = course.pricingPlans.find((p: any) => p.planType === planType);

  if (!plan) {
    // Fallback for legacy "FULL" or "HALF" if they don't have pricingPlans yet
    if (planType === "FULL") {
      const fee = parseCoursePrice(course.price);
      return {
        amount: fee,
        metadata: { planType: "FULL_PAYMENT", cohortName },
        callbackParams: { paymentPlan: PAYMENT_PLANS.FULL_PAYMENT, cohortName },
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

async function createPaymentStatus(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    courseId: string;
    paymentData: any;
    planType: string;
    cohortName: string;
    course: any;
  },
) {
  const cohort = await assignToSelectedCohort(
    tx,
    params.userId,
    params.courseId,
    params.cohortName,
    params.paymentData.callbackParams.paymentPlan,
  );

  const createData: any = {
    userId: params.userId,
    courseId: params.courseId,
    paymentPlan: params.paymentData.callbackParams.paymentPlan,
    paymentType: params.paymentData.callbackParams.paymentPlan,
    status: PaymentStatusType.PENDING_SEAT_CONFIRMATION,
    cohortId: cohort.cohortId,
  };

  const plan = params.course.pricingPlans.find(
    (p: any) => p.planType === params.planType,
  );

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
        dueDate: addMonths(actualStartDate, 1),
        installmentNumber: 2,
      });
    } else {
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
          dueDate: addMonths(actualStartDate, i - 2),
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

async function verifyPayment(reference: string) {
  if (!reference) return { error: "Payment reference is required" };

  const existingTx = await prismadb.paymentTransaction.findUnique({
    where: { transactionRef: reference as string },
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
    return { error: "Transaction not found" };
  }

  if (existingTx.status === "success") {
    return {
      status: "success",
      data: existingTx,
      message: "Payment already processed",
    };
  }

  if (existingTx.paymentGateway === "PAYSTACK") {
    const verification = await paystack.transaction.verify(reference as string);

    if (verification.data.status !== "success") {
      await prismadb.paymentTransaction.update({
        where: { transactionRef: reference as string },
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
  } else {
    const startButtonVerification = await verifyStartButtonTransaction(
      reference as string,
    );

    if (startButtonVerification?.transaction?.status !== "successful") {
      await prismadb.paymentTransaction.update({
        where: { transactionRef: reference as string },
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

  const result = await prismadb.$transaction(
    async (tx) => {
      let updatedTx = await tx.paymentTransaction.update({
        where: { transactionRef: reference as string },
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

        // Checking if user already exists
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
          console.log(
            `✅ Created user ${user.id} from IWD application ${application.id}`,
          );
        } else {
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
      if (
        existingTx.paymentStatus?.user?.inactive ||
        userId !== "IWD_PENDING"
      ) {
        const userToCheck =
          userId !== "IWD_PENDING" ? userId : updatedTx.userId;
        const u = await tx.user.findUnique({ where: { id: userToCheck } });
        if (u?.inactive) {
          await tx.user.update({
            where: { id: userToCheck },
            data: { inactive: false },
          });
          console.log(
            `Reactivated user ${userToCheck} after successful payment`,
          );
        }
      }

      let paymentResult;
      switch (paymentPlan) {
        case PAYMENT_PLANS.FULL_PAYMENT:
          paymentResult = await handleFullPayment(tx, {
            userId: userId,
            courseId: updatedTx.courseId,
            reference: reference as string,
          });
          break;

        case PAYMENT_PLANS.FIRST_HALF_COMPLETE:
          paymentResult = await handleFirstHalfPayment(tx, {
            userId: userId,
            courseId: updatedTx.courseId,
            reference: reference as string,
          });
          break;

        case PAYMENT_PLANS.SECOND_HALF_PAYMENT:
          paymentResult = await handleSecondHalfPayment(tx, {
            userId: userId,
            courseId: updatedTx.courseId,
            reference: reference as string,
          });
          break;

        case PAYMENT_PLANS.TWO_INSTALLMENTS:
        case PAYMENT_PLANS.THREE_INSTALLMENTS:
        case PAYMENT_PLANS.FOUR_INSTALLMENTS:
        case PAYMENT_PLANS.FIVE_INSTALLMENTS:
          const metadata = JSON.parse(updatedTx.metadata || "{}");
          paymentResult = await handleInstallmentPayment(
            tx,
            {
              userId: userId,
              courseId: updatedTx.courseId,
              installmentNumber: metadata.installmentNumber || 1,
              paymentPlan: paymentPlan as string,
              reference: reference as string,
            },
            Number(updatedTx.amount),
          );
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
        console.log(
          `✅ Created purchase record for user ${userId} and course ${updatedTx.courseId}`,
        );
      }

      return updatedTx;
    },
    {
      maxWait: 30000,
      timeout: 25000,
    },
  );

  try {
    const metadata = JSON.parse(result.metadata || "{}");
    await sendPaymentNotifications(
      result.userId,
      result.courseId,
      metadata.installmentNumber,
    );
  } catch (emailError) {
    console.error("Email notification failed:", emailError);
  }

  // 🔄 Auto-sync payment data to Google Sheets after successful payment
  try {
    const { GoogleSheetsSyncService } =
      await import("../../utils/googleSheets");
    GoogleSheetsSyncService.syncPaymentData().catch((e) =>
      console.error("Google Sheets sync error:", e.message),
    );
  } catch (sheetError) {
    console.error("Sheet service error:", sheetError);
  }

  const isIWD = JSON.parse(result.metadata || "{}").isIWD;
  let tokens = {};

  if (isIWD) {
    const user = await prismadb.user.findUnique({
      where: { id: result.userId },
    });
    if (user) {
      const access_token = jwt.sign(
        { email: user.email, id: user.id, role: user.role },
        process.env.JWT_SECRET as string,
        { expiresIn: "30d" },
      );
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

//#endregion

//#region Payment Callback
paymentApp.get("/payment/callback", async (req: Request, res: Response) => {
  const { reference } = req.query;

  try {
    const verification = await paystack.transaction.verify(reference as string);

    if (verification.data.status === "success") {
      res.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/payment/success?reference=${reference}`,
      );
    } else {
      res.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/payment/failed?reference=${reference}`,
      );
    }
  } catch (error) {
    res.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/payment/failed?reason=verification`,
    );
  }
});

paymentApp.get(
  "/startbutton-payment/callback",
  async (req: Request, res: Response) => {
    const { reference } = req.query;

    try {
      const verification = await verifyStartButtonTransaction(
        reference as string,
      );

      if (verification.transaction?.status === "successful") {
        res.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/payment/success?reference=${reference}`,
        );
      } else {
        res.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL}/payment/failed?reference=${reference}`,
        );
      }
    } catch (error) {
      res.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/payment/failed?reason=verification`,
      );
    }
  },
);

//#region Payment Verification
//#region Payment Verification
paymentApp.get("/verify", async (req: Request, res: Response) => {
  const { reference } = req.query;

  if (!reference) {
    return res.status(400).json({ error: "Missing reference parameter" });
  }

  try {
    const verificationResponse = await verifyPayment(reference as string);

    if (verificationResponse.status === "success") {
      return res.json(verificationResponse);
    } else if (verificationResponse) {
      return res.status(422).json(verificationResponse);
    }
  } catch (error) {
    console.error("Verification error:", error);
    res.status(500).json({
      status: "error",
      error: "Payment verification failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

paymentApp.get("/start-button/webhook", async (req: Request, res: Response) => {
  const { event, data } = req.body;

  try {
    if (!data.transaction?.id) {
      return res
        .status(400)
        .json({ error: "Invalid expected start button data" });
    }

    console.log(
      `Start Button Webhook Triggered [${data?.transaction.createdAt}]: ${data.transaction?.transactionReference} - ${event}`,
    );
    if (event === "collection.completed") {
      const verifiedTransaction = await verifyPayment(
        data.transaction?.transactionReference,
      );

      if (verifiedTransaction.status === "success") {
        console.log(
          `Start Button Webhook Payment Successful [${data?.transaction.createdAt}]: ${data.transaction?.transactionReference}`,
        );
        res.json(verifiedTransaction);
      }
    }
  } catch (err) {
    console.error("Start button webhook error: ", err);
    return res.status(500).json({
      status: "error",
      error: "Start button webhook failed",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

async function verifyPurchaseCreation(
  tx: Prisma.TransactionClient,
  userId: string,
  courseId: string,
) {
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

    throw new Error(
      `Purchase record not created for user ${userId} and course ${courseId}`,
    );
  }

  return purchase;
}

//#region Payment Handlers
async function handleFullPayment(tx: Prisma.TransactionClient, metadata: any) {
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

    const cohort = await assignToSelectedCohort(
      tx,
      metadata.userId,
      metadata.courseId,
      cohortName,
      PAYMENT_PLANS.FULL_PAYMENT,
    );

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
          status: PaymentStatusType.COMPLETE,
          cohortId: cohort.cohortId,
        },
      });
    }

    return tx.paymentStatus.create({
      data: {
        userId: metadata.userId,
        courseId: metadata.courseId,
        paymentPlan: PAYMENT_PLANS.FULL_PAYMENT,
        status: PaymentStatusType.COMPLETE,
        cohortId: cohort.cohortId,
      },
    });
  } catch (error) {
    logPaymentError("Full payment processing failed", {
      userId: metadata.userId,
      courseId: metadata.courseId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

async function handleFirstHalfPayment(
  tx: Prisma.TransactionClient,
  metadata: any,
) {
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

    const cohort = await assignToSelectedCohort(
      tx,
      metadata.userId,
      metadata.courseId,
      cohortName,
      PAYMENT_PLANS.FIRST_HALF_COMPLETE,
    );

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
          status: PaymentStatusType.BALANCE_HALF_PAYMENT,
          secondPaymentDueDate: addMonths(new Date(), 1),
          cohortId: cohort.cohortId,
        },
      });
    }

    return tx.paymentStatus.create({
      data: {
        userId: metadata.userId,
        courseId: metadata.courseId,
        paymentPlan: PAYMENT_PLANS.FIRST_HALF_COMPLETE,
        status: PaymentStatusType.BALANCE_HALF_PAYMENT,
        secondPaymentDueDate: addMonths(new Date(), 1),
        cohortId: cohort.cohortId,
      },
    });
  } catch (error) {
    logPaymentError("First half payment processing failed", {
      userId: metadata.userId,
      courseId: metadata.courseId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

async function handleSecondHalfPayment(
  tx: Prisma.TransactionClient,
  metadata: any,
) {
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
        status: PaymentStatusType.COMPLETE,
        paymentPlan: PAYMENT_PLANS.FULL_PAYMENT,
      },
    });
  } catch (error) {
    logPaymentError("Second half payment processing failed", {
      userId: metadata.userId,
      courseId: metadata.courseId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

async function handleInstallmentPayment(
  tx: Prisma.TransactionClient,
  metadata: any,
  amountPaid: number,
) {
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
      throw new Error(
        `PaymentStatus record not found for user ${metadata.userId} on course ${metadata.courseId}. ` +
          `The payment initialization record may be missing. Please contact support with reference: ${metadata.reference}`,
      );
    }

    // ✅ SELF-HEAL: If paymentStatus exists but has NO installments, auto-create them
    if (paymentStatus.paymentInstallments.length === 0) {
      console.warn(
        `⚠️  PaymentStatus ${paymentStatus.id} has no installments. Auto-creating for plan: ${paymentStatus.paymentPlan}`,
      );

      const courseForPlan = await tx.course.findUnique({
        where: { id: metadata.courseId },
        select: { pricingPlans: true },
      });

      const planType = paymentStatus.paymentPlan;
      const plan = (courseForPlan?.pricingPlans as any[])?.find(
        (p: any) => p.planType === planType,
      );

      if (!plan || plan.installmentsCount <= 1) {
        throw new Error(
          `Cannot auto-create installments: pricing plan "${planType}" not found or has ≤1 installment for course ${metadata.courseId}`,
        );
      }

      const cohortStartDate = paymentStatus.cohort?.startDate || new Date();
      const installments: {
        amount: number;
        dueDate: Date;
        installmentNumber: number;
      }[] = [];

      if (plan.installmentsCount === 2) {
        installments.push({
          amount: plan.amountPerInstallment,
          dueDate: new Date(),
          installmentNumber: 1,
        });
        installments.push({
          amount: plan.amountPerInstallment,
          dueDate: addMonths(cohortStartDate, 1),
          installmentNumber: 2,
        });
      } else {
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
            dueDate: addMonths(cohortStartDate, i - 2),
            installmentNumber: i,
          });
        }
      }

      await tx.paymentInstallment.createMany({
        data: installments.map((inst) => ({
          ...inst,
          paymentStatusId: paymentStatus!.id,
        })),
      });

      console.log(
        `✅ Auto-created ${installments.length} installments for paymentStatus ${paymentStatus.id}`,
      );

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
    const installmentToUpdate = paymentStatus.paymentInstallments.find(
      (i) => i.installmentNumber === installmentNumber,
    );

    if (!installmentToUpdate) {
      throw new Error(
        `Installment ${installmentNumber} not found for this payment plan (plan has ${paymentStatus.paymentInstallments.length} installments)`,
      );
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

    if (
      (paymentPlan === PAYMENT_PLANS.THREE_INSTALLMENTS &&
        installmentNumber === 1) ||
      (paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS &&
        installmentNumber === 2)
    ) {
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
          status: PaymentStatusType.BALANCE_HALF_PAYMENT,
        },
      });

      const remainingInstallments = await tx.paymentInstallment.findMany({
        where: {
          paymentStatusId: paymentStatus.id,
          installmentNumber: { gt: installmentNumber },
        },
      });

      for (const remainingInstallment of remainingInstallments) {
        const newDueDate = addMonths(
          cohort.startDate,
          remainingInstallment.installmentNumber -
            (paymentPlan === PAYMENT_PLANS.THREE_INSTALLMENTS ? 1 : 2),
        );

        await tx.paymentInstallment.update({
          where: { id: remainingInstallment.id },
          data: { dueDate: newDueDate },
        });
      }
    }

    if (
      (paymentPlan === PAYMENT_PLANS.THREE_INSTALLMENTS &&
        installmentNumber === 1) ||
      (paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS &&
        installmentNumber === 2)
    ) {
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

    const isFinalInstallment =
      (paymentPlan === PAYMENT_PLANS.THREE_INSTALLMENTS &&
        installmentNumber === 3) ||
      (paymentPlan === PAYMENT_PLANS.FOUR_INSTALLMENTS &&
        installmentNumber === 4);

    if (isFinalInstallment) {
      await tx.paymentStatus.update({
        where: { id: installment.paymentStatusId },
        data: { status: PaymentStatusType.COMPLETE },
      });
    }

    return installment;
  } catch (error) {
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
paymentApp.get("/purchase-status", async (req: Request, res: Response) => {
  const { userId, courseId } = req.query;

  if (!userId || !courseId) {
    return res.status(400).json({ error: "Missing userId or courseId" });
  }

  try {
    const purchase = await prismadb.purchase.findFirst({
      where: {
        userId: userId as string,
        courseId: courseId as string,
      },
    });

    res.json({ hasPurchase: !!purchase, purchase });
  } catch (error) {
    res.status(500).json({ error: "Failed to check purchase status" });
  }
});
//#endregion

//#region Cron Jobs
cron.schedule("0 * * * *", async () => {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  await prismadb.paystackTransaction.updateMany({
    where: {
      status: "pending",
      createdAt: { lt: thirtyMinutesAgo },
    },
    data: {
      status: "expired",
    },
  });

  await prismadb.paymentTransaction.updateMany({
    where: {
      status: "pending",
      createdAt: { lt: thirtyMinutesAgo },
    },
    data: {
      status: "expired",
    },
  });
});

cron.schedule("0 9 * * *", async () => {
  const today = new Date();

  // Find installments due in the next 3 days
  const dueInstallments = await prismadb.paymentInstallment.findMany({
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
          transactions: true,
        },
      },
    },
  });

  for (const installment of dueInstallments) {
    try {
      const paymentPlan = getPaymentPlan(installment.paymentStatus);

      // Calculate days until due
      const daysUntilDue = Math.ceil(
        (installment.dueDate.getTime() - today.getTime()) / 86400000,
      );

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
      const paymentLink = await initiateStartButtonPayment(
        installment.paymentStatus.user.email,
        installment.amount * 100,
        "NGN",
        {
          installmentId: installment.id,
          paymentPlan: paymentPlan,
          userId: installment.paymentStatus.userId,
          courseId: installment.paymentStatus.courseId,
          installmentNumber: installment.installmentNumber,
        },
      ).then((data) => data.url);

      await sendPaymentReminder(
        installment.paymentStatus.user.email!,
        installment.paymentStatus.user.name || "Student",
        installment.paymentStatus.course.title,
        installment.installmentNumber,
        installment.dueDate,
        installment.amount,
        paymentLink,
        daysUntilDue,
      );

      await prismadb.paymentInstallment.update({
        where: { id: installment.id },
        data: { lastReminderSent: new Date() },
      });
    } catch (error) {
      console.error(
        `Reminder failed for installment ${installment.id}:`,
        error,
      );
    }
  }
});

// Comprehensive Fixed Cron Job - No Premature Deactivation
cron.schedule("0 0 * * *", async () => {
  console.log("Running overdue payment check...");

  try {
    const overduePayments = await prismadb.paymentInstallment.findMany({
      where: {
        dueDate: { lt: new Date() },
        paid: false,
        paymentStatus: {
          status: {
            notIn: [PaymentStatusType.EXPIRED, PaymentStatusType.COMPLETE],
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

    console.log(
      `Found ${overduePayments.length} potentially overdue installments`,
    );

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
            ? Math.floor(
                (now.getTime() - cohortStartDate.getTime()) /
                  (24 * 60 * 60 * 1000),
              )
            : -1;
          const monthsSinceCohortStart = Math.floor(
            daysSinceCohortStart / 30.44,
          );

          console.log(
            `Checking user ${paymentStatus.user.email} - Plan: ${paymentPlan}, Installment: ${installment.installmentNumber}, Cohort Started: ${cohortHasStarted}, Days Since Start: ${daysSinceCohortStart}`,
          );

          if (paymentPlan === PAYMENT_PLANS.FULL_PAYMENT) {
            // Full payment - should never be deactivated if payment was made
            shouldDeactivate = false;
          } else if (paymentPlan === PAYMENT_PLANS.FIRST_HALF_COMPLETE) {
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
            } else if (installment.installmentNumber === 2) {
              // Second half - due based on secondPaymentDueDate, typically 1 month after first payment
              if (paymentStatus.secondPaymentDueDate) {
                const secondPaymentOverdue =
                  now > paymentStatus.secondPaymentDueDate;
                const gracePeriodDays = 14; // More lenient for second half
                const gracePeriodEnd = new Date(
                  paymentStatus.secondPaymentDueDate.getTime() +
                    gracePeriodDays * 24 * 60 * 60 * 1000,
                );

                if (now > gracePeriodEnd && paidCount < 2) {
                  shouldDeactivate = true;
                  reason = "Second half payment overdue after grace period";
                }
              }
            }
          } else if (
            Object.values(PAYMENT_PLANS).includes(paymentPlan as any) &&
            allInstallments.length > 1
          ) {
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
            } else if (installment.installmentNumber === 2) {
              // Second installment logic
              if (allInstallments.length >= 3) {
                // For 3+ installments: MUST be paid before cohort starts
                if (cohortHasStarted && paidCount < 2) {
                  shouldDeactivate = true;
                  reason =
                    "Second installment must be paid before cohort starts for 3+ installment plans";
                }
              } else {
                // For 2 installments: due 1 month into program
                if (cohortHasStarted && monthsSinceCohortStart >= 1) {
                  const gracePeriodDays = 14;
                  const expectedDueDate = addMonths(cohortStartDate, 1);
                  if (
                    now >
                      new Date(
                        expectedDueDate.getTime() + gracePeriodDays * 86400000,
                      ) &&
                    paidCount < 2
                  ) {
                    shouldDeactivate = true;
                    reason =
                      "Second installment for 2-plan overdue (1 month into cohort)";
                  }
                }
              }
            } else if (installment.installmentNumber >= 3) {
              // 3rd, 4th, 5th installments: monthly from start date
              const monthsNeeded = installment.installmentNumber - 2; // Installment 3 is 1 month after start
              if (cohortHasStarted && monthsSinceCohortStart >= monthsNeeded) {
                const gracePeriodDays = 14;
                const expectedDueDate = addMonths(
                  cohortStartDate,
                  monthsNeeded,
                );
                if (
                  now >
                    new Date(
                      expectedDueDate.getTime() + gracePeriodDays * 86400000,
                    ) &&
                  paidCount < installment.installmentNumber
                ) {
                  shouldDeactivate = true;
                  reason = `Installment ${installment.installmentNumber} overdue (${monthsNeeded} month(s) into cohort)`;
                }
              }
            }
          }
        } else {
          // Fallback for payments without cohort assignment (edge case)
          console.log(
            `Warning: Payment status ${paymentStatus.id} has no cohort assigned`,
          );

          // Very lenient fallback - only deactivate if REALLY overdue
          const daysPastDue = Math.floor(
            (now.getTime() - installment.dueDate.getTime()) /
              (24 * 60 * 60 * 1000),
          );
          if (daysPastDue > 30) {
            // 30-day grace for edge cases
            shouldDeactivate = true;
            reason = "No cohort assigned and payment overdue by 30+ days";
          }
        }

        if (shouldDeactivate) {
          console.log(
            `🚫 DEACTIVATING user ${paymentStatus.user.email} - Reason: ${reason}`,
          );

          let nextCohort = null;

          await prismadb.$transaction([
            prismadb.user.update({
              where: { id: paymentStatus.userId },
              data: { inactive: true },
            }),
            prismadb.paymentStatus.update({
              where: { id: paymentStatus.id },
              data: { status: PaymentStatusType.EXPIRED },
            }),
          ]);

          // Move to next available cohort
          if (paymentStatus.cohort) {
            nextCohort = paymentStatus.course.cohorts
              .filter((c) => c.startDate > paymentStatus.cohort!.startDate)
              .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];

            if (nextCohort) {
              await prismadb.userCohort.updateMany({
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
            const overdueDays = Math.floor(
              (now.getTime() - installment.dueDate.getTime()) /
                (24 * 60 * 60 * 1000),
            );
            await sendAccountDeactivationNotification(
              paymentStatus.user.email!,
              paymentStatus.user.name || "Student",
              paymentStatus.course.title,
              paymentPlan || "Unknown Plan",
              overdueDays,
              installment.installmentNumber,
              nextCohort?.startDate,
            );
          } catch (emailError) {
            console.error(
              `Failed to send deactivation email to ${paymentStatus.user.email}:`,
              emailError,
            );
          }
        } else {
          console.log(
            `✅ User ${paymentStatus.user.email} installment ${installment.installmentNumber} - No deactivation needed`,
          );
        }
      } catch (error) {
        console.error(
          `❌ Overdue handling failed for installment ${installment.id}:`,
          error,
        );
      }
    }

    console.log("✅ Overdue payment check completed");
  } catch (error) {
    console.error("❌ Overdue payment cron job failed:", error);
  }
});

//safety cron job - runs weekly to catch any incorrectly deactivated users
cron.schedule("0 3 * * 1", async () => {
  // Monday 3 AM
  console.log("🔍 Running weekly payment status audit...");

  try {
    // Find recently deactivated users who might have been incorrectly processed
    const recentlyDeactivated = await prismadb.user.findMany({
      where: {
        inactive: true,
        updatedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
      include: {
        paymentStatus: {
          where: {
            status: PaymentStatusType.EXPIRED,
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
        const paidCount = paymentStatus.paymentInstallments.filter(
          (i) => i.paid,
        ).length;
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
        } else if (paidCount > 0 && paidCount === totalInstallments) {
          // All installments paid but still deactivated
          suspicious = true;
          suspiciousReason = "All installments paid but deactivated";
        } else if (paymentPlan === PAYMENT_PLANS.FULL_PAYMENT) {
          // Full payment users should never be deactivated
          suspicious = true;
          suspiciousReason = "Full payment user deactivated";
        }

        if (suspicious) {
          console.log(
            `🚨 SUSPICIOUS DEACTIVATION: User ${user.email} - ${suspiciousReason} - Needs manual review`,
          );

          // Send alert email for wrongful deactivation
          try {
            await sendWrongfulDeactivationAlert(
              user.email!,
              user.name || "Student",
              paymentStatus.cohort?.name || "Unknown Course",
              paymentPlan || "Unknown Plan",
              suspiciousReason,
              user.email!,
            );
          } catch (emailError) {
            console.error(
              `Failed to send wrongful deactivation alert for ${user.email}:`,
              emailError,
            );
          }
        }
      }
    }

    console.log("✅ Weekly audit completed");
  } catch (error) {
    console.error("❌ Weekly audit failed:", error);
  }
});
//#endregion

//#region Admin Tracking
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

paymentApp.get("/admin/payments", async (req: Request, res: Response) => {
  try {
    const {
      status,
      paymentPlan,
      courseId,
      cohortId,
      search,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const where: any = {};

    if (status) where.status = status;
    if (paymentPlan) where.paymentPlan = paymentPlan;
    if (courseId) where.courseId = courseId;
    if (cohortId) where.cohortId = cohortId;

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

    const payments = await prismadb.paymentStatus.findMany({
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
        [sortBy as string]: sortOrder,
      },
    });

    const total = await prismadb.paymentStatus.count({ where });

    const metricsRaw = await prismadb.$queryRaw<
      Array<{
        totalPayments: bigint;
        completedPayments: bigint;
        pendingPayments: bigint;
        pendingSeatConfirmations: bigint;
        expiredPayments: bigint;
      }>
    >`
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
  } catch (error) {
    console.error("Error fetching payment data:", error);
    res.status(500).json({
      error: "Failed to fetch payment data",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

paymentApp.get("/admin/payments/stats", async (req: Request, res: Response) => {
  try {
    const totalRevenueRaw = await prismadb.$queryRaw<
      { total: bigint | null }[]
    >`
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

    const revenueByTypeRaw = await prismadb.$queryRaw<
      Array<{
        paymentPlan: string;
        revenue: bigint;
        count: bigint;
      }>
    >`
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

    const revenueByCourseRaw = await prismadb.$queryRaw<
      Array<{
        id: string;
        title: string;
        revenue: bigint;
        count: bigint;
      }>
    >`
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
  } catch (error) {
    console.error("Error fetching payment stats:", error);
    res.status(500).json({
      error: "Failed to fetch payment stats",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Admin endpoint: Manually verify and record a Paystack payment by reference.
 * Useful when automatic verification fails (e.g. missing installment records).
 * POST /admin/payments/manual-verify
 * Body: { reference: string, userId: string, courseId: string, installmentNumber?: number }
 */
paymentApp.post(
  "/admin/payments/manual-verify",
  async (req: Request, res: Response) => {
    const { reference, userId, courseId, installmentNumber = 1 } = req.body;

    if (!reference || !userId || !courseId) {
      return res
        .status(400)
        .json({ error: "reference, userId, and courseId are required" });
    }

    try {
      // Verify with Paystack first
      const verification = await paystack.transaction.verify(
        reference as string,
      );

      if (verification.data.status !== "success") {
        return res.status(400).json({
          status: "error",
          error: "Paystack reports this transaction is not successful",
          paystackStatus: verification.data.status,
        });
      }

      const amountPaid = (verification.data.amount || 0) / 100; // kobo → naira

      const result = await prismadb.$transaction(
        async (tx) => {
          // Upsert the paystackTransaction record
          let paystackTx = await tx.paystackTransaction.findUnique({
            where: { transactionRef: reference },
          });

          if (!paystackTx) {
            paystackTx = await tx.paystackTransaction.create({
              data: {
                transactionRef: reference,
                userId,
                courseId,
                amount: amountPaid.toString(),
                status: "success",
                paymentDate: new Date(),
                paymentPlan:
                  ((verification.data.metadata as any)
                    ?.paymentPlan as string) || "MANUAL",
                metadata: JSON.stringify(
                  (verification.data.metadata as any) || {},
                ),
              },
            });
          } else if (paystackTx.status !== "success") {
            paystackTx = await tx.paystackTransaction.update({
              where: { id: paystackTx.id },
              data: { status: "success", paymentDate: new Date() },
            });
          }

          // Ensure paymentStatus exists
          let paymentStatus = await tx.paymentStatus.findUnique({
            where: { userId_courseId: { userId, courseId } },
            include: {
              paymentInstallments: { orderBy: { installmentNumber: "asc" } },
              cohort: true,
            },
          });

          const paymentPlan: string =
            paystackTx.paymentPlan ||
            ((verification.data.metadata as any)?.paymentPlan as string) ||
            "FULL_PAYMENT";

          if (!paymentStatus) {
            // Create a basic paymentStatus — admin must assign cohort separately if needed
            paymentStatus = (await tx.paymentStatus.create({
              data: {
                userId,
                courseId,
                paymentPlan,
                status: PaymentStatusType.PENDING_SEAT_CONFIRMATION,
              },
              include: {
                paymentInstallments: true,
                cohort: true,
              },
            })) as any;
            console.log(
              `[ADMIN] Created paymentStatus for user ${userId} / course ${courseId}`,
            );
          }

          // Determine if this is an installment plan
          const isInstallmentPlan = [
            PAYMENT_PLANS.TWO_INSTALLMENTS,
            PAYMENT_PLANS.THREE_INSTALLMENTS,
            PAYMENT_PLANS.FOUR_INSTALLMENTS,
            PAYMENT_PLANS.FIVE_INSTALLMENTS,
          ].includes(paymentPlan as any);

          if (isInstallmentPlan) {
            // Self-heal missing installments
            if (paymentStatus.paymentInstallments.length === 0) {
              const courseForPlan = await tx.course.findUnique({
                where: { id: courseId },
                select: { pricingPlans: true },
              });
              const plan = (courseForPlan?.pricingPlans as any[])?.find(
                (p: any) => p.planType === paymentPlan,
              );
              if (plan && plan.installmentsCount > 1) {
                const cohortStartDate =
                  paymentStatus.cohort?.startDate || new Date();
                const installments: any[] = [];
                if (plan.installmentsCount === 2) {
                  installments.push({
                    amount: plan.amountPerInstallment,
                    dueDate: new Date(),
                    installmentNumber: 1,
                    paymentStatusId: paymentStatus.id,
                  });
                  installments.push({
                    amount: plan.amountPerInstallment,
                    dueDate: addMonths(cohortStartDate, 1),
                    installmentNumber: 2,
                    paymentStatusId: paymentStatus.id,
                  });
                } else {
                  installments.push({
                    amount: plan.amountPerInstallment,
                    dueDate: new Date(),
                    installmentNumber: 1,
                    paymentStatusId: paymentStatus.id,
                  });
                  installments.push({
                    amount: plan.amountPerInstallment,
                    dueDate: cohortStartDate,
                    installmentNumber: 2,
                    paymentStatusId: paymentStatus.id,
                  });
                  for (let i = 3; i <= plan.installmentsCount; i++) {
                    installments.push({
                      amount: plan.amountPerInstallment,
                      dueDate: addMonths(cohortStartDate, i - 2),
                      installmentNumber: i,
                      paymentStatusId: paymentStatus.id,
                    });
                  }
                }
                await tx.paymentInstallment.createMany({ data: installments });
                console.log(
                  `[ADMIN] Auto-created ${installments.length} installments`,
                );
              }
              // Re-fetch
              paymentStatus = await tx.paymentStatus.findUniqueOrThrow({
                where: { id: paymentStatus.id },
                include: {
                  paymentInstallments: {
                    orderBy: { installmentNumber: "asc" },
                  },
                  cohort: true,
                },
              });
            }

            // Mark the specified installment as paid
            const targetInstallment = paymentStatus.paymentInstallments.find(
              (i) => i.installmentNumber === Number(installmentNumber),
            );
            if (targetInstallment && !targetInstallment.paid) {
              await tx.paymentInstallment.update({
                where: { id: targetInstallment.id },
                data: { paid: true },
              });
              console.log(
                `[ADMIN] Marked installment ${installmentNumber} as paid`,
              );
            }

            // Check if all installments are now paid
            const allInstallments = await tx.paymentInstallment.findMany({
              where: { paymentStatusId: paymentStatus.id },
            });
            const allPaid = allInstallments.every(
              (i) =>
                i.paid || i.installmentNumber === Number(installmentNumber),
            );
            await tx.paymentStatus.update({
              where: { id: paymentStatus.id },
              data: {
                status: allPaid
                  ? PaymentStatusType.COMPLETE
                  : PaymentStatusType.BALANCE_HALF_PAYMENT,
              },
            });
          } else {
            // Full payment or legacy plan
            await tx.paymentStatus.update({
              where: { id: paymentStatus.id },
              data: {
                paymentPlan,
                status: PaymentStatusType.COMPLETE,
              },
            });
          }

          // Ensure purchase record exists
          const existingPurchase = await tx.purchase.findFirst({
            where: { userId, courseId },
          });
          if (!existingPurchase) {
            await tx.purchase.create({ data: { userId, courseId } });
            console.log(`[ADMIN] Created purchase record for user ${userId}`);
          }

          // Reactivate user if inactive
          const user = await tx.user.findUnique({ where: { id: userId } });
          if (user?.inactive) {
            await tx.user.update({
              where: { id: userId },
              data: { inactive: false },
            });
            console.log(`[ADMIN] Reactivated user ${userId}`);
          }

          return {
            paystackTxId: paystackTx.id,
            paymentStatusId: paymentStatus.id,
          };
        },
        { maxWait: 30000, timeout: 25000 },
      );

      res.json({
        status: "success",
        message: `Payment reference ${reference} successfully verified and recorded for user ${userId}`,
        data: result,
      });
    } catch (error) {
      console.error("[ADMIN] Manual verify error:", error);
      res.status(500).json({
        status: "error",
        error: "Manual verification failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

export default paymentApp;
