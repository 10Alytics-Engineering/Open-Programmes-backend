"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendBlogNotificationEmail = void 0;
const mailgun_1 = require("../utils/mailgun");
const generic_mails_1 = require("./generic-mails");
const sendBlogNotificationEmail = async ({ email, blogTitle, blogId, unsubscribeToken, }) => {
    const blogUrl = `${process.env.NEXT_PUBLIC_APP_URL}/blog/${blogId}`;
    const unsubscribeUrl = `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe/blog/${unsubscribeToken}`;
    const html = (0, generic_mails_1.genericEmailTemplate)({
        title: "New Blog Article Published",
        greeting: "Hello,",
        message: `We just published a new article on 10Alytics Business:`,
        highlightText: blogTitle,
        buttonText: "Read Article",
        buttonUrl: blogUrl,
        footerNote: `
      You are receiving this email because you subscribed to 10Alytics Business updates.
      <br />
      <a href="${unsubscribeUrl}" style="color:#6742FA;">Unsubscribe from blog emails</a>
    `,
    });
    await (0, mailgun_1.sendEmail)(email, `New 10Alytics Business article: ${blogTitle}`, html);
};
exports.sendBlogNotificationEmail = sendBlogNotificationEmail;
//# sourceMappingURL=blog-mails.js.map