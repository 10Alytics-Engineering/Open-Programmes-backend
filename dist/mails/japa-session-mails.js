"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendJapaSessionRegistrationEmail = void 0;
const mailgun_1 = require("../utils/mailgun");
const generic_mails_1 = require("./generic-mails");
const sendJapaSessionRegistrationEmail = async ({ email, fullName, targetCountry, wantsConsultation, }) => {
    const html = (0, generic_mails_1.genericEmailTemplate)({
        title: "Your Spot Has Been Reserved",
        greeting: `Hi ${fullName},`,
        message: `Thank you for registering for the Global Career Relocation Session. Your spot has been reserved successfully.`,
        highlightText: `Target Country: ${targetCountry}${wantsConsultation ? "\nYou also requested a free consultation." : ""}`,
        buttonText: "Join the Community",
        buttonUrl: process.env.JAPA_SESSION_COMMUNITY_LINK || "",
        footerNote: "We’ll send you updates and session reminders using the email you registered with.",
    });
    await (0, mailgun_1.sendEmail)(email, "Your Global Career Relocation Session Spot Is Reserved", html);
};
exports.sendJapaSessionRegistrationEmail = sendJapaSessionRegistrationEmail;
//# sourceMappingURL=japa-session-mails.js.map