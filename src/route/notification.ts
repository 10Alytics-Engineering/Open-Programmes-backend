import express from "express";
import {
  getUserNotifications,
  getUnreadNotificationsCount,
  markAllNotificationsAsRead,
  deleteNotification,
  getAllNotifications,
  markNotificationsAsRead,
} from "../controllers/notification";
import { isAuthorized } from "../middleware/index";

export default (router: express.Router) => {
  // Admin: recent notifications
  router.get("/notifications", getAllNotifications);
  router.get(
    "/users/:userId/notifications",
    isAuthorized,
    getUserNotifications,
  );
  router.get(
    "/users/:userId/notifications/unread/count",
    isAuthorized,
    getUnreadNotificationsCount,
  );
  router.patch("/notifications/read", isAuthorized, markNotificationsAsRead);
  router.patch(
    "/users/:userId/notifications/read-all",
    isAuthorized,
    markAllNotificationsAsRead,
  );
  router.delete(
    "/notifications/:notificationId",
    isAuthorized,
    deleteNotification,
  );
};
