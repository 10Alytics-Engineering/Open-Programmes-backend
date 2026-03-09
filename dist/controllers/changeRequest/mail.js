"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendCompletionEmail = exports.sendRejectionEmail = exports.sendApprovalEmail = exports.sendChangeRequestNotification = exports.sendEmail = void 0;
const nodemailer_1 = require("../../utils/nodemailer");
const sendEmail = async (options) => {
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'programrelations@nebiant.com',
        to: options.to,
        subject: options.subject,
        html: options.html,
    };
    try {
        await (0, nodemailer_1.sendMail)(mailOptions);
        console.log(`Email sent to ${options.to}`);
    }
    catch (error) {
        console.error("Error sending email:", error);
        throw error;
    }
};
exports.sendEmail = sendEmail;
const sendChangeRequestNotification = async (request) => {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@nebiant.com';
    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>New Change Request</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff; border-radius: 5px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
          h1 { color: #333; text-align: center; }
          .info { margin: 10px 0; padding: 10px; background-color: #f9f9f9; border-radius: 5px; }
          .label { font-weight: bold; color: #555; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>New ${request.type === "COURSE_CHANGE" ? "Course Change" : "Deferment"} Request</h1>
          <div class="info">
            <span class="label">User:</span> ${request.user.name} (${request.user.email})
          </div>
          <div class="info">
            <span class="label">Request Type:</span> ${request.type}
          </div>
          ${request.type === "COURSE_CHANGE" ? `
            <div class="info">
              <span class="label">From Course:</span> ${request.currentCourse?.title}
            </div>
            <div class="info">
              <span class="label">To Course:</span> ${request.desiredCourse?.title}
            </div>
          ` : `
            <div class="info">
              <span class="label">From Cohort:</span> ${request.currentCohort?.name}
            </div>
            <div class="info">
              <span class="label">To Cohort:</span> ${request.desiredCohort?.name}
            </div>
          `}
          <div class="info">
            <span class="label">Reason:</span> ${request.reason}
          </div>
          <div class="info">
            <span class="label">Request Date:</span> ${new Date(request.createdAt).toLocaleDateString()}
          </div>
          <p>Please review this request in the admin panel.</p>
        </div>
      </body>
    </html>
  `;
    await (0, exports.sendEmail)({
        to: adminEmail,
        subject: `New ${request.type === "COURSE_CHANGE" ? "Course Change" : "Deferment"} Request from ${request.user.name}`,
        html
    });
};
exports.sendChangeRequestNotification = sendChangeRequestNotification;
const sendApprovalEmail = async (user, request, paymentLink) => {
    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Request Approved</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff; border-radius: 5px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
          h1 { color: #333; text-align: center; }
          .button { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .info { margin: 10px 0; padding: 10px; background-color: #f9f9f9; border-radius: 5px; }
          .label { font-weight: bold; color: #555; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Request Approved</h1>
          <p>Hello ${user.name},</p>
          <p>Your ${request.type === "COURSE_CHANGE" ? "course change" : "deferment"} request has been approved.</p>
          
          ${request.type === "COURSE_CHANGE" ? `
            <div class="info">
              <span class="label">From:</span> ${request.currentCourse?.title}
            </div>
            <div class="info">
              <span class="label">To:</span> ${request.desiredCourse?.title}
            </div>
          ` : `
            <div class="info">
              <span class="label">From Cohort:</span> ${request.currentCohort?.name}
            </div>
            <div class="info">
              <span class="label">To Cohort:</span> ${request.desiredCohort?.name}
            </div>
          `}
          
          <p>Please complete your payment of ₦50,000 to proceed with the change:</p>
          <div style="text-align: center;">
            <a href="${paymentLink}" class="button">Pay Now</a>
          </div>
          <p>This payment link will expire in 7 days.</p>
          <p>If you have any questions, please contact support.</p>
        </div>
      </body>
    </html>
  `;
    await (0, exports.sendEmail)({
        to: user.email,
        subject: `Your ${request.type === "COURSE_CHANGE" ? "Course Change" : "Deferment"} Request Has Been Approved`,
        html
    });
};
exports.sendApprovalEmail = sendApprovalEmail;
const sendRejectionEmail = async (user, request, adminReason) => {
    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Request Not Approved</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff; border-radius: 5px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
          h1 { color: #333; text-align: center; }
          .info { margin: 10px 0; padding: 10px; background-color: #f9f9f9; border-radius: 5px; }
          .label { font-weight: bold; color: #555; }
          .reason { background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Request Not Approved</h1>
          <p>Hello ${user.name},</p>
          <p>Your ${request.type === "COURSE_CHANGE" ? "course change" : "deferment"} request could not be approved at this time.</p>
          
          <div class="reason">
            <span class="label">Reason:</span> ${adminReason}
          </div>
          
          <p>If you have any questions or would like to discuss this further, please contact support.</p>
        </div>
      </body>
    </html>
  `;
    await (0, exports.sendEmail)({
        to: user.email,
        subject: `Update on Your ${request.type === "COURSE_CHANGE" ? "Course Change" : "Deferment"} Request`,
        html
    });
};
exports.sendRejectionEmail = sendRejectionEmail;
const sendCompletionEmail = async (user, request) => {
    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Change Completed</title>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #fff; border-radius: 5px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
          h1 { color: #333; text-align: center; }
          .success { background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 5px; padding: 15px; margin: 15px 0; text-align: center; }
          .info { margin: 10px 0; padding: 10px; background-color: #f9f9f9; border-radius: 5px; }
          .label { font-weight: bold; color: #555; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">
            <h1>Change Completed Successfully!</h1>
          </div>
          <p>Hello ${user.name},</p>
          <p>Your ${request.type === "COURSE_CHANGE" ? "course change" : "deferment"} has been successfully processed.</p>
          
          ${request.type === "COURSE_CHANGE" ? `
            <div class="info">
              <span class="label">You are now enrolled in:</span> ${request.desiredCourse?.title}
            </div>
          ` : `
            <div class="info">
              <span class="label">You are now in cohort:</span> ${request.desiredCohort?.name}
            </div>
            <div class="info">
              <span class="label">Start Date:</span> ${new Date(request.desiredCohort?.startDate).toLocaleDateString()}
            </div>
          `}
          
          <p>Thank you for your payment. You can now access your new course/cohort in your dashboard.</p>
          <p>If you have any questions, please contact support.</p>
        </div>
      </body>
    </html>
  `;
    await (0, exports.sendEmail)({
        to: user.email,
        subject: `Your ${request.type === "COURSE_CHANGE" ? "Course Change" : "Deferment"} Has Been Completed`,
        html
    });
};
exports.sendCompletionEmail = sendCompletionEmail;
//# sourceMappingURL=mail.js.map