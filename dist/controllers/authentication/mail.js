"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendClassroomNotificationEmail = exports.sendPasswordResetEmail = exports.sendVerificationEmail = void 0;
const resend_1 = require("resend");
const dotenv = __importStar(require("dotenv"));
// Load environment variables
dotenv.config();
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
const domain = process.env.NEXT_PUBLIC_APP_URL;
const nodemailer_1 = require("../../utils/nodemailer");
const sendVerificationEmail = async (email, token) => {
    const confirmLink = `${domain}/auth/new-verification?token=${token}`;
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'programrelations@nebiant.com',
        to: email,
        subject: 'Confirm your email',
        html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Email Verification</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background-color: #f9f9f9;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 20px auto;
              background: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 15px rgba(0,0,0,0.05);
            }
            .header {
              background-color: #6742FA;
              padding: 30px;
              text-align: center;
              color: white;
            }
            h1 {
              color: white;
              text-align: center;
              margin: 20px 0 0 0;
              font-size: 24px;
            }
            p {
              color: #555;
              line-height: 1.6;
              margin: 15px 0;
            }
            .content {
              padding: 40px 30px;
            }
            .token {
              font-size: 18px;
              font-weight: bold;
              text-align: center;
              margin-top: 20px;
              padding: 10px;
              background-color: #f0f0f0;
              border-radius: 5px;
            }
            .confirm-link {
              display: inline-block;
              text-align: center;
              margin-top: 20px;
              padding: 12px 24px;
              background-color: #6742FA;
              color: white !important;
              text-decoration: none;
              border-radius: 8px;
              font-weight: bold;
            }
            .footer {
              background-color: #f4f4f4;
              padding: 20px;
              text-align: center;
              font-size: 12px;
              color: #777;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="vertical-align: middle; padding-right: 10px;">
                    <img src="${process.env.BACKEND_URL}/logo.png" alt="Logo" width="40" style="display: block; border: 0;">
                  </td>
                  <td style="vertical-align: middle;">
                    <h1 style="margin: 0; font-size: 24px; color: white;">10Alytics Business</h1>
                  </td>
                </tr>
              </table>
            </div>
            <div class="content">
            <div class="content">
              <p>Thank you for registering with our service. Please use the following token to verify your email address:</p>
              <div class="token">${token}</div>
              <p>or</p>
              <a class="confirm-link" href="${confirmLink}">Click here to confirm your email</a>
            </div>
            <div class="footer">
              <p>© 2026 10Alytics Inc. All rights reserved.</p>
            </div>
        </body>
      </html>
    `,
    };
    try {
        await (0, nodemailer_1.sendMail)(mailOptions);
    }
    catch (error) {
        console.error("Error sending verification email:", error);
        throw error;
    }
};
exports.sendVerificationEmail = sendVerificationEmail;
const sendPasswordResetEmail = async (email, token) => {
    const resetLink = `${domain}/auth/new-password?token=${token}`;
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'programrelations@nebiant.com',
        to: email,
        subject: "Reset your password",
        html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Password Reset</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background-color: #f9f9f9;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 20px auto;
              background: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 15px rgba(0,0,0,0.05);
            }
            .header {
              background-color: #6742FA;
              padding: 30px;
              text-align: center;
              color: white;
            }
            h1 {
              color: white;
              text-align: center;
              margin: 20px 0 0 0;
              font-size: 24px;
            }
            p {
              color: #555;
              line-height: 1.6;
              margin: 15px 0;
            }
            .content {
              padding: 40px 30px;
            }
            .token {
              font-size: 18px;
              font-weight: bold;
              text-align: center;
              margin-top: 20px;
              padding: 10px;
              background-color: #f0f0f0;
              border-radius: 5px;
            }
            .reset-link {
              display: inline-block;
              text-align: center;
              margin-top: 20px;
              padding: 12px 24px;
              background-color: #6742FA;
              color: white !important;
              text-decoration: none;
              border-radius: 8px;
              font-weight: bold;
            }
            .footer {
              background-color: #f4f4f4;
              padding: 20px;
              text-align: center;
              font-size: 12px;
              color: #777;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="vertical-align: middle; padding-right: 10px;">
                    <img src="${process.env.BACKEND_URL}/logo.png" alt="Logo" width="40" style="display: block; border: 0;">
                  </td>
                  <td style="vertical-align: middle;">
                    <h1 style="margin: 0; font-size: 24px; color: white;">10Alytics Business</h1>
                  </td>
                </tr>
              </table>
            </div>
            <div class="content">
              <p>We received a request to reset your password. Use the following token or click the button below:</p>
              <div class="token">${token}</div>
              <a href="${resetLink}" class="reset-link">Reset Password</a>
              <p>If you didn't request this, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>© 2026 10Alytics Inc. All rights reserved.</p>
            </div>
        </body>
      </html>
    `,
    };
    try {
        await (0, nodemailer_1.sendMail)(mailOptions);
    }
    catch (error) {
        console.error("Error sending password reset email:", error);
        throw error;
    }
};
exports.sendPasswordResetEmail = sendPasswordResetEmail;
const sendClassroomNotificationEmail = async (emails, cohortName, type, title, content, authorName) => {
    if (!emails || emails.length === 0)
        return;
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'programrelations@nebiant.com',
        to: emails.join(','),
        subject: `New ${type} in ${cohortName}: ${title}`,
        html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Classroom Notification</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; padding: 0; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
            .header { background-color: #6742FA; padding: 30px; text-align: center; color: white; }
            .header h1 { margin: 0; font-size: 24px; color: white; }
            .content { padding: 40px 30px; }
            .type-badge { display: inline-block; padding: 4px 12px; border-radius: 16px; background-color: #dbeafe; color: #1e40af; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 10px; }
            .title { font-size: 20px; font-weight: bold; color: #111; margin-bottom: 10px; }
            .meta { font-size: 14px; color: #666; margin-bottom: 20px; }
            .body-text { background-color: #f9fafb; padding: 15px; border-radius: 4px; border-left: 4px solid #6742FA; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
            .btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #6742FA; color: white !important; text-decoration: none; border-radius: 6px; font-weight: bold; }
            p { color: #555; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="vertical-align: middle; padding-right: 10px;">
                    <img src="${process.env.BACKEND_URL}/logo.png" alt="Logo" width="40" style="display: block; border: 0;">
                  </td>
                  <td style="vertical-align: middle;">
                    <h1 style="margin: 0; font-size: 24px; color: white;">Classroom Update</h1>
                  </td>
                </tr>
              </table>
            </div>
            <div class="content">
              <div class="type-badge">${type}</div>
              <div class="title">${title}</div>
              <div class="meta">Posted by <strong>${authorName}</strong> in <strong>${cohortName}</strong></div>
              <div class="body-text">
                ${content.substring(0, 500)}${content.length > 500 ? '...' : ''}
              </div>
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" class="btn">View in Classroom</a>
            </div>
            <div class="footer">
              <p>You're receiving this because you're enrolled in ${cohortName} at ${process.env.NEXT_PUBLIC_APP_NAME || '10Alytics Business'}.</p>
              <p>© 2026 10Alytics Inc. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    };
    try {
        await (0, nodemailer_1.sendMail)(mailOptions);
        console.log(`✅ Classroom notification sent to ${emails.length} users in ${cohortName}`);
    }
    catch (error) {
        console.error("Error sending classroom notification email:", error);
    }
};
exports.sendClassroomNotificationEmail = sendClassroomNotificationEmail;
//# sourceMappingURL=mail.js.map