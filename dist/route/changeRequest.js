"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const changeRequest_1 = require("../controllers/changeRequest");
exports.default = (router) => {
    router.post("/change-request", middleware_1.isLoggedIn, changeRequest_1.createChangeRequest);
    router.get("/change-requests", middleware_1.isLoggedIn, changeRequest_1.getUserChangeRequests);
    router.get("/admin/change-requests", middleware_1.isAdmin, changeRequest_1.getAllChangeRequests);
    router.get("/admin/change-requests/count", middleware_1.isAdmin, changeRequest_1.getChangeRequestsCount);
    router.patch("/admin/change-requests/:requestId", middleware_1.isAdmin, changeRequest_1.updateChangeRequest);
    router.post("/change-request/verify-payment", middleware_1.isLoggedIn, changeRequest_1.handlePaymentVerification);
};
//# sourceMappingURL=changeRequest.js.map