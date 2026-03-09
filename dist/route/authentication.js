"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const authentication_1 = require("../controllers/authentication");
exports.default = (router) => {
    router.post("/auth/signin", authentication_1.login);
    router.post("/auth/register", authentication_1.register);
    router.post("/auth/google", authentication_1.googleAuth);
    router.post("/auth/verify-otp", authentication_1.verifyEmail);
    router.post("/auth/resend-otp", authentication_1.resendEmailVerification);
    router.post("/auth/forgot-password", authentication_1.forgotPassword);
    router.post("/auth/reset-password", authentication_1.resetPassword);
    router.post("/auth/refresh-access-token", authentication_1.refreshAccessToken);
    router.post("/auth/accounts", authentication_1.account);
};
//# sourceMappingURL=authentication.js.map