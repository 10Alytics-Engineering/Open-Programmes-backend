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
exports.sendPasswordResetEmail = exports.sendVerificationEmail = void 0;
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
              font-family: Arial, sans-serif;
              background-color: #f4f4f4;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #fff;
              border-radius: 5px;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            }
            h1 {
              color: #333;
              text-align: center;
            }
            p {
              color: #555;
              line-height: 1.6;
            }
            .token {
              font-size: 18px;
              font-weight: bold;
              text-align: center;
              margin-top: 20px;
              padding: 10px;
              background-color: #eee;
              border-radius: 5px;
            }
            .confirm-link {
              display: block;
              text-align: center;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Email Verification</h1>
            <p>Thank you for registering with our service. Please use the following token to verify your email address:</p>
            <div class="token">${token}</div>
            <p>or</p>
            <a class="confirm-link" href="${confirmLink}">Click here to confirm your email</a>
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
              font-family: Arial, sans-serif;
              background-color: #f4f4f4;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #fff;
              border-radius: 5px;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            }
            h1 {
              color: #333;
              text-align: center;
            }
            p {
              color: #555;
              line-height: 1.6;
            }
            .token {
              font-size: 18px;
              font-weight: bold;
              text-align: center;
              margin-top: 20px;
              padding: 10px;
              background-color: #eee;
              border-radius: 5px;
            }
            .reset-link {
              display: block;
              text-align: center;
              margin-top: 20px;
              padding: 10px 20px;
              background-color: #2563eb;
              color: white;
              text-decoration: none;
              border-radius: 5px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Reset Your Password</h1>
            <p>We received a request to reset your password. Use the following token or click the button below:</p>
            <div class="token">${token}</div>
            <a href="${resetLink}" class="reset-link">Reset Password</a>
            <p>If you didn't request this, please ignore this email.</p>
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
//# sourceMappingURL=mail.js.map