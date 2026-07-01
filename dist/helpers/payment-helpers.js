"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializePaymentPlan = exports.getPaymentPlanState = exports.getPlanTotals = exports.parseMetadata = void 0;
exports.buildInstallmentSchedule = buildInstallmentSchedule;
const date_fns_1 = require("date-fns");
const parseAmount = (amount) => {
    const value = Number(amount ?? 0);
    return Number.isFinite(value) ? value : 0;
};
const parseMetadata = (metadata) => {
    if (!metadata)
        return {};
    try {
        return JSON.parse(metadata);
    }
    catch {
        return {};
    }
};
exports.parseMetadata = parseMetadata;
const getPlanTotals = (paymentStatus) => {
    const installments = paymentStatus?.paymentInstallments ?? [];
    const installmentExpected = installments.reduce((sum, installment) => sum + Number(installment.amount || 0), 0);
    const paystackPaid = (paymentStatus?.paystackTransactions ?? [])
        .filter((tx) => tx.status === "success")
        .reduce((sum, tx) => sum + parseAmount(tx.amount), 0);
    const unifiedPaid = (paymentStatus?.transactions ?? [])
        .filter((tx) => tx.status === "success")
        .reduce((sum, tx) => sum + parseAmount(tx.amount), 0);
    const paidAmount = paystackPaid + unifiedPaid;
    const expectedAmount = Number(paymentStatus?.expectedAmount || 0) ||
        installmentExpected ||
        paidAmount;
    const pendingAmount = Math.max(expectedAmount - paidAmount, 0);
    const overdueAmount = installments
        .filter((i) => !i.paid && new Date(i.dueDate) < new Date())
        .reduce((sum, i) => sum + Number(i.amount || 0), 0);
    return {
        expectedAmount,
        paidAmount,
        pendingAmount,
        overdueAmount,
        installmentExpected,
    };
};
exports.getPlanTotals = getPlanTotals;
const getPaymentPlanState = (paymentStatus) => {
    if (!paymentStatus)
        return "unknown";
    if (paymentStatus.status === "EXPIRED")
        return "expired";
    const installments = paymentStatus.paymentInstallments ?? [];
    const totals = (0, exports.getPlanTotals)(paymentStatus);
    const hasOverdue = installments.some((i) => !i.paid && new Date(i.dueDate) < new Date());
    const allInstallmentsPaid = installments.length > 0 && installments.every((i) => i.paid);
    const isFullPayment = paymentStatus.paymentPlan === "FULL_PAYMENT" ||
        paymentStatus.paymentType === "FULL_PAYMENT";
    if (paymentStatus.status === "COMPLETE")
        return "paid_in_full";
    if (isFullPayment && totals.paidAmount >= totals.expectedAmount) {
        return "paid_in_full";
    }
    if (allInstallmentsPaid)
        return "paid_in_full";
    if (hasOverdue)
        return "overdue";
    if (totals.paidAmount > 0)
        return "in_progress";
    return "pending";
};
exports.getPaymentPlanState = getPaymentPlanState;
const serializePaymentPlan = (paymentStatus) => {
    const totals = (0, exports.getPlanTotals)(paymentStatus);
    const state = (0, exports.getPaymentPlanState)(paymentStatus);
    const installments = paymentStatus.paymentInstallments ?? [];
    const transactions = [
        ...(paymentStatus.paystackTransactions ?? []).map((tx) => ({
            ...tx,
            source: "paystack",
            paymentGateway: "PAYSTACK",
        })),
        ...(paymentStatus.transactions ?? []).map((tx) => ({
            ...tx,
            source: "unified",
        })),
    ].sort((a, b) => {
        const dateA = new Date(a.paymentDate || a.createdAt).getTime();
        const dateB = new Date(b.paymentDate || b.createdAt).getTime();
        return dateB - dateA;
    });
    return {
        ...paymentStatus,
        state,
        totals,
        installmentSummary: {
            total: installments.length,
            paid: installments.filter((i) => i.paid).length,
            unpaid: installments.filter((i) => !i.paid).length,
            overdue: installments.filter((i) => !i.paid && new Date(i.dueDate) < new Date()).length,
        },
        transactions,
    };
};
exports.serializePaymentPlan = serializePaymentPlan;
function buildInstallmentSchedule(params) {
    const { amountPerInstallment, installmentsCount, cohortStartDate } = params;
    if (installmentsCount <= 1) {
        return [];
    }
    const now = new Date();
    const startDate = cohortStartDate || now;
    const installments = [];
    if (installmentsCount === 2) {
        installments.push({
            amount: amountPerInstallment,
            dueDate: now,
            installmentNumber: 1,
        });
        installments.push({
            amount: amountPerInstallment,
            dueDate: (0, date_fns_1.addMonths)(startDate, 1),
            installmentNumber: 2,
        });
        return installments;
    }
    installments.push({
        amount: amountPerInstallment,
        dueDate: now,
        installmentNumber: 1,
    });
    installments.push({
        amount: amountPerInstallment,
        dueDate: startDate,
        installmentNumber: 2,
    });
    for (let i = 3; i <= installmentsCount; i++) {
        installments.push({
            amount: amountPerInstallment,
            dueDate: (0, date_fns_1.addMonths)(startDate, i - 2),
            installmentNumber: i,
        });
    }
    return installments;
}
//# sourceMappingURL=payment-helpers.js.map