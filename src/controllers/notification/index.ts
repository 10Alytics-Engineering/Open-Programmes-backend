import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

// Get all notifications for a user
export const getUserNotifications = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (!userId) {
      return res.status(400).json({ message: "UserId is required" });
    }

    // Get notifications
    const notifications = await prismadb.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    // Get total count
    const total = await prismadb.notification.count({
      where: { userId },
    });

    return res.status(200).json({
      status: "success",
      data: notifications,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        total,
        hasMore: parseInt(offset as string) + parseInt(limit as string) < total,
      },
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

// Get unread notifications count
export const getUnreadNotificationsCount = async (
  req: Request,
  res: Response
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "UserId is required" });
    }

    const count = await prismadb.notification.count({
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
  } catch (error) {
    handleServerError(error, res);
  }
};

// Mark notification as read
export const markNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;

    if (!notificationId) {
      return res.status(400).json({ message: "NotificationId is required" });
    }

    const notification = await prismadb.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    return res.status(200).json({
      status: "success",
      data: notification,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

// Mark all notifications as read
export const markAllNotificationsAsRead = async (
  req: Request,
  res: Response
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "UserId is required" });
    }

    const result = await prismadb.notification.updateMany({
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
  } catch (error) {
    handleServerError(error, res);
  }
};

// Delete notification
export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { notificationId } = req.params;

    if (!notificationId) {
      return res.status(400).json({ message: "NotificationId is required" });
    }

    await prismadb.notification.delete({
      where: { id: notificationId },
    });

    return res.status(200).json({
      status: "success",
      message: "Notification deleted successfully",
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

// Get recent notifications (admin view)
export const getAllNotifications = async (req: Request, res: Response) => {
  try {
    const { limit = 50 } = req.query;
    const notifications = await prismadb.notification.findMany({
      orderBy: { createdAt: "desc" },
      take: parseInt(limit as string),
    });

    return res.status(200).json({ status: "success", data: notifications });
  } catch (error) {
    handleServerError(error, res);
  }
};
