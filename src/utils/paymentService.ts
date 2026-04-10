import axios from "axios";
import { prismadb } from "../index";
import { generatePaymentRef } from "../helpers/generate-ref";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const START_BUTTON_URL = process.env.START_BUTTON_API_URL;
const START_BUTTON_SECRET_KEY = process.env.START_BUTTON_SECRET_KEY;
const START_BUTTON_PUBLIC_KEY = process.env.START_BUTTON_PUBLIC_KEY;

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
  currency: "GHS" | "NGN" | "ZAR" | "KES" | "UGX",
  metaData: { [key: string]: any },
  paymentMethods?: string[],
) => {
  try {
    const ref = generatePaymentRef();

    const response = await axios.post(
      `${START_BUTTON_URL}/transaction/initialize`,
      {
        amount,
        currency: currency || "NGN",
        email,
        redirectUrl: `${process.env.START_BUTTON_CALLBACK_URL}?reference=${ref}`,
        metaData,
        reference: ref,
        paymentMethods: paymentMethods || ["bank", "card", "bank_transfer"],
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

const getUserEmail = async (userId: string): Promise<string> => {
  const user = await prismadb.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  return user.email;
};
