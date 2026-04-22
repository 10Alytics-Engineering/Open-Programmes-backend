import axios from "axios";
import { prismadb } from "../index";
import { generatePaymentRef } from "../helpers/generate-ref";
import { ngnToUSD, usdToTarget } from "./currency";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const START_BUTTON_URL = process.env.START_BUTTON_API_URL;
const START_BUTTON_SECRET_KEY = process.env.START_BUTTON_SECRET_KEY;
const START_BUTTON_PUBLIC_KEY = process.env.START_BUTTON_PUBLIC_KEY;

export type CurrrencyType = "GHS" | "NGN" | "ZAR" | "KES" | "UGX" | "RWF";

export const generatePaymentLink = async (
  userId: string,
  paymentType: string,
  itemId: string,
  amount: number, // in kobo
  description: string,
): Promise<string> => {
  try {
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email: await getUserEmail(userId),
        amount,
        metadata: {
          userId,
          paymentType,
          itemId,
          custom_fields: [
            {
              display_name: "Payment For",
              variable_name: "payment_for",
              value: description,
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    return response.data.data.authorization_url;
  } catch (error) {
    console.error("Error generating payment link:", error);
    throw new Error("Failed to generate payment link");
  }
};

export const verifyPaystackPayment = async (reference: string) => {
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      },
    );

    return response.data.data;
  } catch (error) {
    console.error("Error verifying payment:", error);
    throw new Error("Payment verification failed");
  }
};

export const initiateStartButtonPayment = async (
  email: string,
  amount: number,
  currency: CurrrencyType,
  metaData: { [key: string]: any },
  paymentMethods?: string[],
) => {
  try {
    const ref = generatePaymentRef();

    console.log({ amount, currency });

    const response = await axios.post(
      `${START_BUTTON_URL}/transaction/initialize`,
      {
        amount: Math.round(Number(amount)),
        currency: currency || "NGN",
        email,
        redirectUrl: `${process.env.START_BUTTON_CALLBACK_URL}?reference=${ref}`,
        metaData,
        reference: ref,
        paymentMethods: paymentMethods || ["bank", "card", "bank_transfer"],
        webhookUrl: `${process.env.BACKEND_URL}/start-button/webhook`,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${START_BUTTON_PUBLIC_KEY}`,
        },
      },
    );

    if (typeof response?.data?.data !== "string") {
      return {
        error: "Failed to initiate start button payment",
        details: response.data,
      };
    }

    return { url: response.data.data, reference: ref };
  } catch (error) {
    console.error("Error verifying payment:", error);
    throw new Error("Payment verification failed");
  }
};

export const verifyStartButtonTransaction = async (reference: string) => {
  try {
    const response = await axios.get(
      `${START_BUTTON_URL}/transaction/status/${reference}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${START_BUTTON_SECRET_KEY}`,
        },
      },
    );

    return response.data.data;
  } catch (error) {
    console.error("Error verifying start button payment:", error);
    throw new Error("Payment verification failed");
  }
};

export const convertNairaToOtherCurrency = async (
  toCurrency: CurrrencyType,
  amountInNGN: number,
) => {
  if (!amountInNGN || typeof amountInNGN !== "number")
    return { error: "Amount is required and should be a valid number" };
  if (!toCurrency)
    return { error: "Currency is required and should be a valid number" };

  const acceptedCurrencies = ["GHS", "NGN", "ZAR", "KES", "UGX", "RWF"];

  if (!acceptedCurrencies.includes(toCurrency)) {
    return { status: "failed", error: "Currency not supported" };
  }

  try {
    const response = await axios.get(
      `${START_BUTTON_URL}/transaction/exchange`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${START_BUTTON_PUBLIC_KEY}`,
        },
      },
    );

    if (response?.data?.success) {
      const rates = response.data.data;

      if (toCurrency === "NGN")
        return { status: "success", amount: amountInNGN }; // no conversion needed

      const inUSD = ngnToUSD(amountInNGN, rates);
      const amountInTargetCurreny = usdToTarget(inUSD, toCurrency, rates);

      return { status: "success", amount: amountInTargetCurreny };
    }

    return { status: "failed", error: "An error occured while getting rates" };
  } catch (error) {
    console.log(
      "Currency Conversion Failed: ",
      error instanceof Error ? error.message : "Unknown",
    );
    return { status: "failed", error: `Currency conversion failed` };
  }
};

const getUserEmail = async (userId: string): Promise<string> => {
  const user = await prismadb.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  return user.email;
};
