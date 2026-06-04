"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const notification_1 = require("../controllers/notification");
const index_1 = require("../middleware/index");
exports.default = (router) => {
    // Admin: recent notifications
    router.get("/notifications", notification_1.getAllNotifications);
    router.get("/users/:userId/notifications", index_1.isAuthorized, notification_1.getUserNotifications);
    router.get("/users/:userId/notifications/unread/count", index_1.isAuthorized, notification_1.getUnreadNotificationsCount);
    router.patch("/notifications/read", index_1.isAuthorized, notification_1.markNotificationsAsRead);
    router.patch("/users/:userId/notifications/read-all", index_1.isAuthorized, notification_1.markAllNotificationsAsRead);
    router.delete("/notifications/:notificationId", index_1.isAuthorized, notification_1.deleteNotification);
};
//# sourceMappingURL=notification.js.map