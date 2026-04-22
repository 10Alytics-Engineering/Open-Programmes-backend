"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertNairaToOtherCurrency = exports.verifyStartButtonTransaction = exports.initiateStartButtonPayment = exports.verifyPaystackPayment = exports.generatePaymentLink = void 0;
const axios_1 = __importDefault(require("axios"));
const index_1 = require("../index");
const generate_ref_1 = require("../helpers/generate-ref");
const currency_1 = require("./currency");
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const START_BUTTON_URL = process.env.START_BUTTON_API_URL;
const START_BUTTON_SECRET_KEY = process.env.START_BUTTON_SECRET_KEY;
const START_BUTTON_PUBLIC_KEY = process.env.START_BUTTON_PUBLIC_KEY;
const generatePaymentLink = async (userId, paymentType, itemId, amount, // in kobo
description) => {
    try {
        const response = await axios_1.default.post("https://api.paystack.co/transaction/initialize", {
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
        }, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json",
            },
        });
        return response.data.data.authorization_url;
    }
    catch (error) {
        console.error("Error generating payment link:", error);
        throw new Error("Failed to generate payment link");
    }
};
exports.generatePaymentLink = generatePaymentLink;
const verifyPaystackPayment = async (reference) => {
    try {
        const response = await axios_1.default.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            },
        });
        return response.data.data;
    }
    catch (error) {
        console.error("Error verifying payment:", error);
        throw new Error("Payment verification failed");
    }
};
exports.verifyPaystackPayment = verifyPaystackPayment;
const initiateStartButtonPayment = async (email, amount, currency, metaData, paymentMethods) => {
    try {
        const ref = (0, generate_ref_1.generatePaymentRef)();
        console.log({ amount, currency });
        const response = await axios_1.default.post(`${START_BUTTON_URL}/transaction/initialize`, {
            amount: Number(Number(amount).toFixed(2)),
            currency: currency || "NGN",
            email,
            redirectUrl: `${process.env.START_BUTTON_CALLBACK_URL}?reference=${ref}`,
            metaData,
            reference: ref,
            paymentMethods: paymentMethods || ["bank", "card", "bank_transfer"],
            webhookUrl: `${process.env.BACKEND_URL}/start-button/webhook`,
        }, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${START_BUTTON_PUBLIC_KEY}`,
            },
        });
        if (typeof response?.data?.data !== "string") {
            return {
                error: "Failed to initiate start button payment",
                details: response.data,
            };
        }
        return { url: response.data.data, reference: ref };
    }
    catch (error) {
        console.error("Error verifying payment:", error);
        throw new Error("Payment verification failed");
    }
};
exports.initiateStartButtonPayment = initiateStartButtonPayment;
const verifyStartButtonTransaction = async (reference) => {
    try {
        const response = await axios_1.default.get(`${START_BUTTON_URL}/transaction/status/${reference}`, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${START_BUTTON_SECRET_KEY}`,
            },
        });
        return response.data.data;
    }
    catch (error) {
        console.error("Error verifying start button payment:", error);
        throw new Error("Payment verification failed");
    }
};
exports.verifyStartButtonTransaction = verifyStartButtonTransaction;
const convertNairaToOtherCurrency = async (toCurrency, amountInNGN) => {
    if (!amountInNGN || typeof amountInNGN !== "number")
        return { error: "Amount is required and should be a valid number" };
    if (!toCurrency)
        return { error: "Currency is required and should be a valid number" };
    const acceptedCurrencies = ["GHS", "NGN", "ZAR", "KES", "UGX"];
    if (!acceptedCurrencies.includes(toCurrency)) {
        throw new Error("Currency not supported");
    }
    try {
        const response = await axios_1.default.get(`${START_BUTTON_URL}/transaction/exchange`, {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${START_BUTTON_PUBLIC_KEY}`,
            },
        });
        if (response?.data?.success) {
            const rates = response.data.data;
            if (toCurrency === "NGN")
                return { status: "success", amount: amountInNGN }; // no conversion needed
            const inUSD = (0, currency_1.ngnToUSD)(amountInNGN, rates);
            const amountInTargetCurreny = (0, currency_1.usdToTarget)(inUSD, toCurrency, rates);
            return { status: "success", amount: amountInTargetCurreny };
        }
        throw new Error("An error occured while getting rates");
    }
    catch (error) {
        console.log("Currency Conversion Failed: ", error instanceof Error ? error.message : "Unknown");
        return { status: "failed", error: `Currency conversion failed` };
    }
};
exports.convertNairaToOtherCurrency = convertNairaToOtherCurrency;
const getUserEmail = async (userId) => {
    const user = await index_1.prismadb.user.findUnique({
        where: { id: userId },
        select: { email: true },
    });
    return user.email;
};
//# sourceMappingURL=paymentService.js.map