"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllNotifications = exports.deleteNotification = exports.markAllNotificationsAsRead = exports.markNotificationsAsRead = exports.getUnreadNotificationsCount = exports.getUserNotifications = void 0;
const prismadb_1 = require("../../lib/prismadb");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
// Get all notifications for a user
const getUserNotifications = async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, limit = "20", offset = "0" } = req.query;
        const where = {
            userId,
        };
        if (status === "read")
            where.isRead = true;
        if (status === "unread")
            where.isRead = false;
        const take = Number(limit);
        const skip = Number(offset);
        const [notifications, total, unreadCount] = await Promise.all([
            prismadb_1.prismadb.notification.findMany({
                where,
                orderBy: {
                    createdAt: "desc",
                },
                take,
                skip,
            }),
            prismadb_1.prismadb.notification.count({ where }),
            prismadb_1.prismadb.notification.count({
                where: {
                    userId,
                    isRead: false,
                },
            }),
        ]);
        return res.status(200).json({
            status: "success",
            message: null,
            data: {
                notifications,
                total,
                unreadCount,
                limit: take,
                offset: skip,
                hasMore: skip + notifications.length < total,
            },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getUserNotifications = getUserNotifications;
// Get unread notifications count
const getUnreadNotificationsCount = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ message: "UserId is required" });
        }
        const count = await prismadb_1.prismadb.notification.count({
            where: {
                userId,
                isRead: false,
            },
        });
        return res.status(200).json({
            status: "success",
            data: {
                unreadCount: count,
            },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getUnreadNotificationsCount = getUnreadNotificationsCount;
// Mark notification as read
const markNotificationsAsRead = async (req, res) => {
    try {
        const { notificationIds, userId } = req.body;
        if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
            return res.status(400).json({
                message: "notificationIds is required",
            });
        }
        if (!userId) {
            return res.status(400).json({
                message: "user id is required",
            });
        }
        await prismadb_1.prismadb.notification.updateMany({
            where: {
                userId,
                id: {
                    in: notificationIds,
                },
                isRead: false,
            },
            data: {
                isRead: true,
            },
        });
        return res.status(200).json({
            status: "success",
            message: "Notifications marked as read",
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.markNotificationsAsRead = markNotificationsAsRead;
// Mark all notifications as read
const markAllNotificationsAsRead = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ message: "UserId is required" });
        }
        const result = await prismadb_1.prismadb.notification.updateMany({
            where: {
                userId,
                isRead: false,
            },
            data: { isRead: true },
        });
        return res.status(200).json({
            status: "success",
            data: {
                updated: result.count,
            },
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
// Delete notification
const deleteNotification = async (req, res) => {
    try {
        const { notificationId } = req.params;
        if (!notificationId) {
            return res.status(400).json({ message: "NotificationId is required" });
        }
        await prismadb_1.prismadb.notification.delete({
            where: { id: notificationId },
        });
        return res.status(200).json({
            status: "success",
            message: "Notification deleted successfully",
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.deleteNotification = deleteNotification;
// Get recent notifications (admin view)
const getAllNotifications = async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const notifications = await prismadb_1.prismadb.notification.findMany({
            orderBy: { createdAt: "desc" },
            take: parseInt(limit),
        });
        return res.status(200).json({ status: "success", data: notifications });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.getAllNotifications = getAllNotifications;
//# sourceMappingURL=index.js.map