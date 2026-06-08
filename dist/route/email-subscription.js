"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const emailSubscription_1 = require("../controllers/emailSubscription");
exports.default = (router) => {
    // Endpoints for all email subscription
    router.post("/email-subscriptions", emailSubscription_1.subscribeToEvent);
    router.get("/email-subscriptions/unsubscribe/:action/:token", emailSubscription_1.unsubscribeFromEvent);
};
//# sourceMappingURL=email-subscription.js.map