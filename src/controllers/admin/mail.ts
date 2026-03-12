import { prismadb } from "../../lib/prismadb";
import * as dotenv from 'dotenv';
import { sendMail } from '../../utils/nodemailer';

// Load environment variables
dotenv.config();

const domain = process.env.NEXT_PUBLIC_APP_URL;

interface WelcomeEmailParams {
  email: string;
  name: string;
  password: string;
  courseId: string;
}



export const sendWelcomeEmail = async ({ email, name, password, courseId }: WelcomeEmailParams) => {
  try {
    const course = await prismadb.course.findUnique({
      where: { id: courseId },
      select: { title: true },
    });

    const loginLink = `${domain}/login`;

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'programrelations@nebiant.com',
      to: email,
      subject: 'Welcome to Our Academy!',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Welcome to Our Academy</title>
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
              .credentials {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
                border-left: 4px solid #6742FA;
              }
              .credentials strong {
                color: #333333;
              }
              .login-button {
                display: inline-block;
                padding: 12px 24px;
                background-color: #6742FA;
                color: #ffffff !important;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                margin: 20px 0;
              }
              .course-name {
                font-weight: bold;
                color: #6742FA;
              }
              .footer {
                background-color: #f4f4f4;
                padding: 20px;
                text-align: center;
                color: #999999;
                font-size: 12px;
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
                <h1 style="color: #333; text-align: center; margin: 0 0 20px 0;">Welcome, ${name}!</h1>
              <p>Your account has been created by the academy admin.</p>
              
              <div class="credentials">
                <p>Here are your login credentials:</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Password:</strong> ${password}</p>
              </div>

              <p>You have been enrolled in: <span class="course-name">${course?.title || "a course"}</span></p>
              <p>For security reasons, please change your password after logging in.</p>

              <div style="text-align: center;">
                <a href="${loginLink}" class="login-button">Login to Your Account</a>
              </div>

              <p>If you didn't request this account, please contact our support team immediately.</p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} 10Alytics Inc. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    };

    await sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending welcome email:", error);
    throw error;
  }
};