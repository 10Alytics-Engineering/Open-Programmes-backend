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
                font-family: Arial, sans-serif;
                background-color: #f4f4f4;
                margin: 0;
                padding: 0;
              }
              .container {
                max-width: 600px;
                margin: 20px auto;
                padding: 20px;
                background-color: #ffffff;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              }
              h1 {
                color: #333333;
                text-align: center;
                margin-bottom: 20px;
              }
              p {
                color: #555555;
                line-height: 1.6;
                margin-bottom: 15px;
              }
              .credentials {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
              }
              .credentials strong {
                color: #333333;
              }
              .login-button {
                display: inline-block;
                padding: 10px 20px;
                background-color: #2563eb;
                color: #ffffff;
                text-decoration: none;
                border-radius: 5px;
                font-weight: bold;
                margin: 20px 0;
              }
              .course-name {
                font-weight: bold;
                color: #2563eb;
              }
              .footer {
                margin-top: 30px;
                text-align: center;
                color: #999999;
                font-size: 12px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Welcome, ${name}!</h1>
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

              <div class="footer">
                <p>© ${new Date().getFullYear()} Academy. All rights reserved.</p>
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