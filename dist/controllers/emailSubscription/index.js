"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unsubscribeFromEvent = exports.subscribeToEvent = void 0;
const prismadb_1 = require("../../lib/prismadb");
const subscriptionTypes = ["blog"];
const subscribeToEvent = async (req, res) => {
    const { email, action } = req.body;
    if (!email) {
        return res.status(400).json({
            message: "Email is required",
        });
    }
    if (!subscriptionTypes.includes(action)) {
        return res.status(400).json({
            message: "Invalid subscription",
        });
    }
    try {
        let subscriptionPayload;
        if (action === "blog") {
            subscriptionPayload = {
                email,
                notifyNewBlogs: true,
            };
        }
        const existing = await prismadb_1.prismadb.emailSubscription.findUnique({
            where: {
                ...subscriptionPayload,
            },
        });
        if (existing) {
            return res.status(400).json({
                message: "Email already subscribed",
            });
        }
        const subscription = await prismadb_1.prismadb.emailSubscription.upsert({
            where: {
                email: email,
            },
            create: {
                ...subscriptionPayload,
                blogSubscriptionAt: new Date(),
                blogUnSubscritpionAt: null,
            },
            update: {
                notifyNewBlogs: true,
                blogSubscriptionAt: new Date(),
                blogUnSubscritpionAt: null,
            },
        });
        if (subscription.id) {
            return res.status(201).json({
                status: "success",
                message: "Email subscribed successfully",
                data: subscription,
            });
        }
    }
    catch (error) {
        console.error("EMAIL_SUBSCRIPTION_ERROR]", error);
        res.status(500).json({ status: "error", message: "Failed to subscribe" });
    }
};
exports.subscribeToEvent = subscribeToEvent;
const unsubscribeFromEvent = async (req, res) => {
    try {
        const { action, token } = req.params;
        if (!subscriptionTypes.includes(action)) {
            return res.status(400).json({
                message: "Invalid subscription",
            });
        }
        const subscription = await prismadb_1.prismadb.emailSubscription.findUnique({
            where: {
                unsubscribeToken: token,
            },
        });
        if (!subscription) {
            return res.status(404).json({
                message: "Invalid unsubscribe link",
            });
        }
        let unsubscribePayload;
        if (action === "blog") {
            unsubscribePayload = {
                notifyNewBlogs: false,
                blogUnSubscritpionAt: new Date(),
            };
        }
        await prismadb_1.prismadb.emailSubscription.update({
            where: {
                id: subscription.id,
            },
            data: unsubscribePayload,
        });
        return res.status(200).json({
            status: "success",
            message: `You have unsubscribed from ${action} notifications.`,
        });
    }
    catch (error) {
        console.error("EMAIL_UNSUBSCRIBE_ERROR]", error);
        res.status(500).json({ status: "error", message: "Failed to unsubscribe" });
    }
};
exports.unsubscribeFromEvent = unsubscribeFromEvent;
//# sourceMappingURL=index.js.map