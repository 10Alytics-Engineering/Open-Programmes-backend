"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPaystackPayment = exports.generatePaymentLink = void 0;
const axios_1 = __importDefault(require("axios"));
const index_1 = require("../index");
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
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
                        value: description
                    }
                ]
            }
        }, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json"
            }
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
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`
            }
        });
        return response.data.data;
    }
    catch (error) {
        console.error("Error verifying payment:", error);
        throw new Error("Payment verification failed");
    }
};
exports.verifyPaystackPayment = verifyPaystackPayment;
const getUserEmail = async (userId) => {
    const user = await index_1.prismadb.user.findUnique({
        where: { id: userId },
        select: { email: true }
    });
    return user.email;
};
//# sourceMappingURL=paymentService.js.map