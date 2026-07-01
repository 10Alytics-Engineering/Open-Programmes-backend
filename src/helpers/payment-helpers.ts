import { addMonths } from "date-fns";

const parseAmount = (amount: string | number | null | undefined) => {
  const value = Number(amount ?? 0);
  return Number.isFinite(value) ? value : 0;
};

export const parseMetadata = (metadata?: string | null) => {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
};

export const getPlanTotals = (paymentStatus: any) => {
  const installments = paymentStatus?.paymentInstallments ?? [];

  const installmentExpected = installments.reduce(
    (sum: number, installment: any) => sum + Number(installment.amount || 0),
    0,
  );

  const paystackPaid = (paymentStatus?.paystackTransactions ?? [])
    .filter((tx: any) => tx.status === "success")
    .reduce((sum: number, tx: any) => sum + parseAmount(tx.amount), 0);

  const unifiedPaid = (paymentStatus?.transactions ?? [])
    .filter((tx: any) => tx.status === "success")
    .reduce((sum: number, tx: any) => sum + parseAmount(tx.amount), 0);

  const paidAmount = paystackPaid + unifiedPaid;

  const expectedAmount =
    Number(paymentStatus?.expectedAmount || 0) ||
    installmentExpected ||
    paidAmount;

  const pendingAmount = Math.max(expectedAmount - paidAmount, 0);

  const overdueAmount = installments
    .filter((i: any) => !i.paid && new Date(i.dueDate) < new Date())
    .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);

  return {
    expectedAmount,
    paidAmount,
    pendingAmount,
    overdueAmount,
    installmentExpected,
  };
};

export const getPaymentPlanState = (paymentStatus: any) => {
  if (!paymentStatus) return "unknown";

  if (paymentStatus.status === "EXPIRED") return "expired";

  const installments = paymentStatus.paymentInstallments ?? [];
  const totals = getPlanTotals(paymentStatus);

  const hasOverdue = installments.some(
    (i: any) => !i.paid && new Date(i.dueDate) < new Date(),
  );

  const allInstallmentsPaid =
    installments.length > 0 && installments.every((i: any) => i.paid);

  const isFullPayment =
    paymentStatus.paymentPlan === "FULL_PAYMENT" ||
    paymentStatus.paymentType === "FULL_PAYMENT";

  if (paymentStatus.status === "COMPLETE") return "paid_in_full";
  if (isFullPayment && totals.paidAmount >= totals.expectedAmount) {
    return "paid_in_full";
  }
  if (allInstallmentsPaid) return "paid_in_full";
  if (hasOverdue) return "overdue";
  if (totals.paidAmount > 0) return "in_progress";

  return "pending";
};

export const serializePaymentPlan = (paymentStatus: any) => {
  const totals = getPlanTotals(paymentStatus);
  const state = getPaymentPlanState(paymentStatus);

  const installments = paymentStatus.paymentInstallments ?? [];
  const transactions = [
    ...(paymentStatus.paystackTransactions ?? []).map((tx: any) => ({
      ...tx,
      source: "paystack",
      paymentGateway: "PAYSTACK",
    })),
    ...(paymentStatus.transactions ?? []).map((tx: any) => ({
      ...tx,
      source: "unified",
    })),
  ].sort((a: any, b: any) => {
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
      paid: installments.filter((i: any) => i.paid).length,
      unpaid: installments.filter((i: any) => !i.paid).length,
      overdue: installments.filter(
        (i: any) => !i.paid && new Date(i.dueDate) < new Date(),
      ).length,
    },
    transactions,
  };
};

export function buildInstallmentSchedule(params: {
  amountPerInstallment: number;
  installmentsCount: number;
  cohortStartDate?: Date | null;
}) {
  const { amountPerInstallment, installmentsCount, cohortStartDate } = params;

  if (installmentsCount <= 1) {
    return [];
  }

  const now = new Date();
  const startDate = cohortStartDate || now;

  const installments: Array<{
    amount: number;
    dueDate: Date;
    installmentNumber: number;
  }> = [];

  if (installmentsCount === 2) {
    installments.push({
      amount: amountPerInstallment,
      dueDate: now,
      installmentNumber: 1,
    });

    installments.push({
      amount: amountPerInstallment,
      dueDate: addMonths(startDate, 1),
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
      dueDate: addMonths(startDate, i - 2),
      installmentNumber: i,
    });
  }

  return installments;
}
