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
    const { status, limit = "20", offset = "0" } = req.query;

    const where: any = {
      userId,
    };

    if (status === "read") where.isRead = true;
    if (status === "unread") where.isRead = false;

    const take = Number(limit);
    const skip = Number(offset);

    const [notifications, total, unreadCount] = await Promise.all([
      prismadb.notification.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        take,
        skip,
      }),

      prismadb.notification.count({ where }),

      prismadb.notification.count({
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
  } catch (error) {
    handleServerError(error, res);
  }
};

// Get unread notifications count
export const getUnreadNotificationsCount = async (
  req: Request,
  res: Response,
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
export const markNotificationsAsRead = async (req: Request, res: Response) => {
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

    await prismadb.notification.updateMany({
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
  } catch (error) {
    handleServerError(error, res);
  }
};
// Mark all notifications as read
export const markAllNotificationsAsRead = async (
  req: Request,
  res: Response,
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
