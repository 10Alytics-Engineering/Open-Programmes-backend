"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerInstallmentPaymentReminderJob = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const prismadb_1 = require("../../lib/prismadb");
const mail_1 = require("../../controllers/payment/mail");
const date_fns_1 = require("date-fns");
const shouldSendReminderToday = (cohortEndDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(cohortEndDate);
    end.setHours(0, 0, 0, 0);
    const diffInDays = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return [14, 7, 3, 2, 1].includes(diffInDays);
};
const getDaysUntilDue = (dueDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};
const registerInstallmentPaymentReminderJob = () => {
    // Runs every day at 6PM
    node_cron_1.default.schedule("0 18 * * *", async () => {
        try {
            console.log("💳 Running installment payment reminder job...");
            const paymentStatuses = await prismadb_1.prismadb.paymentStatus.findMany({
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
                if (!payment.user?.email || !payment.cohort?.endDate)
                    continue;
                const shouldSend = shouldSendReminderToday(payment.cohort.endDate);
                if (!shouldSend)
                    continue;
                const unpaidInstallments = payment.paymentInstallments.filter((installment) => !installment.paid);
                if (unpaidInstallments.length === 0)
                    continue;
                const nextInstallment = unpaidInstallments[0];
                const amountLeft = unpaidInstallments.reduce((sum, installment) => sum + installment.amount, 0);
                const totalAmount = payment.paymentInstallments.reduce((sum, installment) => sum + installment.amount, 0);
                const formattedDueDate = (0, date_fns_1.format)(new Date(payment.cohort.endDate), "MMMM d, yyyy");
                const paymentLink = `${process.env.FRONTEND_URL}/dashboard/billing?cached-route=billing`;
                await (0, mail_1.sendPaymentReminder)(payment.user.email, payment.user.name || "there", payment.course?.title || "your course", formattedDueDate, totalAmount, amountLeft, paymentLink, getDaysUntilDue(nextInstallment.dueDate), "Complete your pending installment to keep your course access active.", payment.cohort.name || "");
                console.log(`✅ Payment reminder sent to ${payment.user.email} for ${payment.course?.title}`);
            }
            console.log("✅ Payment reminder job completed");
        }
        catch (error) {
            console.error("Payment reminder job crashed:", error);
        }
    });
    console.log("✅ Payment reminder cron registered");
};
exports.registerInstallmentPaymentReminderJob = registerInstallmentPaymentReminderJob;
//# sourceMappingURL=payment-reminder.job.js.map