import { Resend } from "resend";
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const domain = process.env.NEXT_PUBLIC_APP_URL
import { sendMail } from '../../utils/nodemailer';

export const sendVerificationEmail = async (email: string, token: string) => {
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
    await sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw error;
  }
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
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
    await sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw error;
  }
};

export const sendClassroomNotificationEmail = async (
  emails: string[],
  cohortName: string,
  type: string,
  title: string,
  content: string,
  authorName: string
) => {
  if (!emails || emails.length === 0) return;

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
            body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
            .header { border-bottom: 2px solid #eee; padding-bottom: 15px; margin-bottom: 20px; }
            .header h1 { color: #2563eb; margin: 0; font-size: 24px; }
            .content { color: #333; line-height: 1.6; }
            .type-badge { display: inline-block; padding: 4px 12px; border-radius: 16px; background-color: #dbeafe; color: #1e40af; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-bottom: 10px; }
            .title { font-size: 20px; font-weight: bold; color: #111; margin-bottom: 10px; }
            .meta { font-size: 14px; color: #666; margin-bottom: 20px; }
            .body-text { background-color: #f9fafb; padding: 15px; border-radius: 4px; border-left: 4px solid #2563eb; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
            .btn { display: inline-block; margin-top: 20px; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Classroom Update</h1>
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
            </div>
          </div>
        </body>
      </html>
    `,
  };

  try {
    await sendMail(mailOptions);
    console.log(`✅ Classroom notification sent to ${emails.length} users in ${cohortName}`);
  } catch (error) {
    console.error("Error sending classroom notification email:", error);
  }
};