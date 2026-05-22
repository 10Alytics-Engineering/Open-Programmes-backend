"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllNotifications = exports.deleteNotification = exports.markAllNotificationsAsRead = exports.markNotificationAsRead = exports.getUnreadNotificationsCount = exports.getUserNotifications = void 0;
const prismadb_1 = require("../../lib/prismadb");
const handleServerError = (error, res) => {
    console.error({ error_server: error });
    res.status(500).json({ message: "Internal Server Error" });
};
// Get all notifications for a user
const getUserNotifications = async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 20, offset = 0 } = req.query;
        if (!userId) {
            return res.status(400).json({ message: "UserId is required" });
        }
        // Get notifications
        const notifications = await prismadb_1.prismadb.notification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: parseInt(limit),
            skip: parseInt(offset),
        });
        // Get total count
        const total = await prismadb_1.prismadb.notification.count({
            where: { userId },
        });
        return res.status(200).json({
            status: "success",
            data: notifications,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total,
                hasMore: parseInt(offset) + parseInt(limit) < total,
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
const markNotificationAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;
        if (!notificationId) {
            return res.status(400).json({ message: "NotificationId is required" });
        }
        const notification = await prismadb_1.prismadb.notification.update({
            where: { id: notificationId },
            data: { isRead: true },
        });
        return res.status(200).json({
            status: "success",
            data: notification,
        });
    }
    catch (error) {
        handleServerError(error, res);
    }
};
exports.markNotificationAsRead = markNotificationAsRead;
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