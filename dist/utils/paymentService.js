"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyStartButtonTransaction = exports.initiateStartButtonPayment = exports.verifyPaystackPayment = exports.generatePaymentLink = void 0;
const axios_1 = __importDefault(require("axios"));
const index_1 = require("../index");
const generate_ref_1 = require("../helpers/generate-ref");
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
        const response = await axios_1.default.post(`${START_BUTTON_URL}/transaction/initialize`, {
            amount,
            currency: currency || "NGN",
            email,
            redirectUrl: `${process.env.START_BUTTON_CALLBACK_URL}?reference=${ref}`,
            metaData,
            reference: ref,
            paymentMethods: paymentMethods || ["bank", "card", "bank_transfer"],
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
const getUserEmail = async (userId) => {
    const user = await index_1.prismadb.user.findUnique({
        where: { id: userId },
        select: { email: true },
    });
    return user.email;
};
//# sourceMappingURL=paymentService.js.map