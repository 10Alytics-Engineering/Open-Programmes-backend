"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOTPVerificationEmail = void 0;
const sendOTPVerificationEmail = async (email, res) => {
    try {
        res.json({
            status: "pending",
            message: "Verification email sent",
            data: `Verification email sent to ${email}`,
        });
    }
    catch (error) {
        console.log({ OTP_catch: error });
    }
};
exports.sendOTPVerificationEmail = sendOTPVerificationEmail;
//# sourceMappingURL=otpVerification.js.map