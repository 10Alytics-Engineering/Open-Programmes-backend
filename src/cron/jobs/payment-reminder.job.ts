import cron from "node-cron";
import { prismadb } from "../../lib/prismadb";
import { sendPaymentReminder } from "../../controllers/payment/mail";
import { format } from "date-fns";

const shouldSendReminderToday = (cohortEndDate: Date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(cohortEndDate);
  end.setHours(0, 0, 0, 0);

  const diffInDays = Math.ceil(
    (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  return [14, 7, 3, 2, 1].includes(diffInDays);
};

const getDaysUntilDue = (dueDate: Date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);

  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export const registerInstallmentPaymentReminderJob = () => {
  // Runs every day at 6PM
  cron.schedule("0 18 * * *", async () => {
    try {
      console.log("💳 Running installment payment reminder job...");

      const paymentStatuses = await prismadb.paymentStatus.findMany({
        where: {
          status: {
            notIn: ["COMPLETE", "EXPIRED"],
          },
          paymentInstallments: {
            some: {
              paid: false,
            },
          },
          user: {
            email: {
              not: null,
            },
          },
          cohort: {
            endDate: {
              not: null,
            },
          },
        },
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

      for (const payment of paymentStatuses) {
        if (!payment.user?.email || !payment.cohort?.endDate) continue;

        const shouldSend = shouldSendReminderToday(payment.cohort.endDate);

        if (!shouldSend) continue;

        const unpaidInstallments = payment.paymentInstallments.filter(
          (installment) => !installment.paid,
        );

        if (unpaidInstallments.length === 0) continue;

        const nextInstallment = unpaidInstallments[0];

        const amountLeft = unpaidInstallments.reduce(
          (sum, installment) => sum + installment.amount,
          0,
        );

        const totalAmount = payment.paymentInstallments.reduce(
          (sum, installment) => sum + installment.amount,
          0,
        );

        const formattedDueDate = format(
          new Date(payment.cohort.endDate),
          "MMMM d, yyyy",
        );
        const paymentLink = `${process.env.FRONTEND_URL}/dashboard/billing?cached-route=billing`;

        await sendPaymentReminder(
          payment.user.email,
          payment.user.name || "there",
          payment.course?.title || "your course",
          formattedDueDate,
          totalAmount,
          amountLeft,
          paymentLink,
          getDaysUntilDue(nextInstallment.dueDate),
          "Complete your pending installment to keep your course access active.",
          payment.cohort.name || "",
        );

        console.log(
          `✅ Payment reminder sent to ${payment.user.email} for ${payment.course?.title}`,
        );
      }

      console.log("✅ Payment reminder job completed");
    } catch (error) {
      console.error("Payment reminder job crashed:", error);
    }
  });

  console.log("✅ Payment reminder cron registered");
};
