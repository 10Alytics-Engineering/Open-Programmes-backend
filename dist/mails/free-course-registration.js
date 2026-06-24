"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendFreeCourseAccessEmail = void 0;
const mailgun_1 = require("../utils/mailgun");
const generic_mails_1 = require("./generic-mails");
const sendFreeCourseAccessEmail = async ({ email, firstName, courseTitle, accessUrl, }) => {
    const html = (0, generic_mails_1.genericEmailTemplate)({
        title: `Your Free Access to ${courseTitle} is Ready`,
        greeting: `Hi ${firstName}`,
        message: `
    Thank you for registering for free access to our learning experience.

    You have successfully unlocked selected free learning content from the course "${courseTitle}".

    This gives you an opportunity to explore the course, experience the learning platform, and begin developing practical skills before deciding to continue with the full program.
    `,
        highlightText: `
    Course: ${courseTitle} Access has been activated immediately.
    `,
        buttonText: "Access Your Free Course",
        buttonUrl: accessUrl,
        footerNote: "If you do not yet have an account, please sign up using this same email address to automatically gain access to your free learning content.",
    });
    await (0, mailgun_1.sendEmail)(email, `Your Free Access to ${courseTitle} is Ready`, html);
};
exports.sendFreeCourseAccessEmail = sendFreeCourseAccessEmail;
//# sourceMappingURL=free-course-registration.js.map