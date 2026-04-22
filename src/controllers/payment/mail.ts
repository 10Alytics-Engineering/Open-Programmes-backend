import { Resend } from "resend";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const domain = process.env.NEXT_PUBLIC_APP_URL;
import { sendMail } from "../../utils/nodemailer";

export const sendPaymentReminder = async (
  email: string,
  userName: string,
  courseTitle: string,
  installmentNumber: number,
  dueDate: Date,
  amount: number,
  paymentLink: string,
  daysUntilDue?: number,
  milestone?: string
) => {
  // Determine the milestone message based on installment number
  let milestoneMessage = "";
  if (milestone) {
    milestoneMessage = `<p>🚀 <strong>This payment unlocks:</strong> ${milestone}</p>`;
  } else {
    switch (installmentNumber) {
      case 1:
        milestoneMessage = "<p>🚀 <strong>This payment unlocks:</strong> Seat reservation and course access</p>";
        break;
      case 2:
        milestoneMessage = "<p>🚀 <strong>This payment unlocks:</strong> Full course materials and community access</p>";
        break;
      case 3:
        milestoneMessage = "<p>🚀 <strong>This payment unlocks:</strong> Advanced modules and project work</p>";
        break;
      case 4:
        milestoneMessage = "<p>🎓 <strong>This payment completes:</strong> Your program investment and certification</p>";
        break;
    }
  }

  // Calculate days until due if not provided
  const daysLeft = daysUntilDue !== undefined ? daysUntilDue : Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const urgencyLevel = daysLeft <= 1 ? "high" : daysLeft <= 3 ? "medium" : "low";

  const mailOptions = {
    from: process.env.EMAIL_FROM || "programrelations@nebiant.com",
    to: email,
    subject: `⏰ Payment Reminder: ${courseTitle} - Installment ${installmentNumber} (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
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
            background: white;
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
          .header h2 {
            margin: 0 0 5px 0;
            font-size: 24px;
            color: white;
          }
          .header p {
            margin: 5px 0 0 0;
            font-size: 14px;
            opacity: 0.9;
          }
          .content {
            background: white;
            padding: 30px;
          }
          p {
            color: #555;
            line-height: 1.6;
            margin: 15px 0;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .urgency-high { color: #dc3545; font-weight: bold; }
          .urgency-medium { color: #fd7e14; font-weight: bold; }
          .urgency-low { color: #28a745; font-weight: bold; }
          .payment-details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #6742FA;
          }
          .payment-button {
            display: block;
            width: 100%;
            padding: 15px;
            background: #6742FA;
            color: white !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            text-align: center;
            margin: 25px 0;
            transition: transform 0.2s;
          }
          .payment-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(103, 66, 250, 0.3);
          }
          .timeline {
            margin: 25px 0;
            padding: 20px;
            background: #e8f4ff;
            border-radius: 8px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
            color: #6c757d;
            font-size: 0.9em;
            text-align: center;
          }
          .badge {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
            margin-right: 10px;
          }
          .badge-primary { background: #6742FA; color: white; }
          .badge-success { background: #28a745; color: white; }
          .badge-warning { background: #ffc107; color: black; }
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
                  <h2 style="margin: 0; font-size: 24px; color: white;">10Alytics Business</h2>
                </td>
              </tr>
            </table>
          </div>
          <div class="content">
            <h3 style="color: #6742FA; text-align: center; margin: 0 0 10px 0;">⏰ Payment Reminder</h3>
              <p>Dear ${userName},</p>
            </div>

            <div class="payment-details">
              <h3>Payment Details</h3>
              <p><span class="badge badge-primary">Course</span> ${courseTitle}</p>
              <p><span class="badge badge-${urgencyLevel === 'high' ? 'warning' : urgencyLevel === 'medium' ? 'warning' : 'success'}">Due In</span> 
                 <span class="urgency-${urgencyLevel}">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</span></p>
              <p><span class="badge badge-primary">Installment</span> #${installmentNumber}</p>
              <p><span class="badge badge-primary">Amount</span> <strong>₦${amount.toLocaleString()}</strong></p>
              <p><span class="badge badge-primary">Due Date</span> ${dueDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}</p>
            </div>

            ${milestoneMessage}

            <div class="timeline">
              <h4>📅 Payment Timeline</h4>
              <p>This payment is aligned with your cohort's program milestones. Paying on time ensures uninterrupted access to:</p>
              <ul>
                <li>Course materials and resources</li>
                <li>Live sessions and mentorship</li>
                <li>Community access and support</li>
                <li>Project feedback and grading</li>
              </ul>
            </div>

            <a href="${paymentLink}" class="payment-button">
              💳 PAY INSTALLMENT ${installmentNumber} NOW - ₦${amount.toLocaleString()}
            </a>

            <p style="text-align: center; color: #6c757d; font-size: 0.9em;">
              🔒 Secure payment processed by Paystack
            </p>

            <div class="footer">
              <p><strong>Need assistance?</strong><br>
              Contact our support team at <a href="mailto:${process.env.EMAIL_FROM || "programrelations@nebiant.com"}">${process.env.EMAIL_FROM || "programrelations@nebiant.com"
      }</a></p>
              
              <p style="margin-top: 15px; color: #999; font-size: 0.8em;">
                This is an automated reminder. Please do not reply to this email.
              </p>
            </div>
          </div>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #777;">
            <p>© 2026 10Alytics Inc. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sendMail(mailOptions);
    console.log(`Payment reminder sent to ${email} for installment ${installmentNumber}`);
  } catch (error) {
    console.error("Error sending payment reminder:", error);
    throw error;
  }
};

export const sendSecondHalfReminder = async (
  email: string,
  userName: string,
  courseTitle: string,
  dueDate: Date,
  amount: number,
  paymentLink: string,
  daysUntilDue?: number
) => {
  const daysLeft = daysUntilDue !== undefined ? daysUntilDue : Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const urgencyLevel = daysLeft <= 1 ? "high" : daysLeft <= 3 ? "medium" : "low";

  const formattedDate = dueDate.toLocaleDateString("en-NG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const mailOptions = {
    from: process.env.EMAIL_FROM || "programrelations@nebiant.com",
    to: email,
    subject: `🎓 Final Payment Due: Complete Your ${courseTitle} Program (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left)`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
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
            background: white;
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
          .header h2 {
            margin: 0 0 5px 0;
            font-size: 24px;
            color: white;
          }
          .header p {
            margin: 5px 0 0 0;
            font-size: 14px;
            opacity: 0.9;
          }
          .content {
            background: white;
            padding: 30px;
          }
          p {
            color: #555;
            line-height: 1.6;
            margin: 15px 0;
          }
          h3 {
            margin: 0 0 10px 0;
          }
          .urgency-high { color: #dc3545; font-weight: bold; }
          .urgency-medium { color: #fd7e14; font-weight: bold; }
          .urgency-low { color: #28a745; font-weight: bold; }
          .payment-details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #6742FA;
          }
          .payment-button {
            display: block;
            width: 100%;
            padding: 15px;
            background: #6742FA;
            color: white !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            text-align: center;
            margin: 25px 0;
            transition: transform 0.2s;
          }
          .payment-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(103, 66, 250, 0.3);
          }
          .benefits {
            margin: 25px 0;
            padding: 20px;
            background: #f0e8ff;
            border-radius: 8px;
            border-left: 4px solid #6742FA;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
            color: #6c757d;
            font-size: 0.9em;
            text-align: center;
          }
          .badge {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
            margin-right: 10px;
          }
          .badge-success { background: #6742FA; color: white; }
          .badge-warning { background: #ffc107; color: black; }
          .badge-danger { background: #dc3545; color: white; }
          .badge-info { background: #6742FA; color: white; }
          .milestone-icon {
            font-size: 1.2em;
            margin-right: 8px;
            vertical-align: middle;
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
                  <h2 style="margin: 0; font-size: 24px; color: white;">10Alytics Business</h2>
                </td>
              </tr>
            </table>
          </div>
          <div class="content">
            <div class="header">
              <h1 style="color: #28a745; margin-bottom: 10px;">🎓 Complete Your Journey</h1>
              <p style="color: #6c757d;">Final Payment Reminder - ${courseTitle}</p>
            </div>

            <div class="payment-details">
              <h3>Final Payment Details</h3>
              <p><span class="badge badge-success">Course</span> ${courseTitle}</p>
              <p><span class="badge badge-${urgencyLevel === 'high' ? 'danger' : urgencyLevel === 'medium' ? 'warning' : 'success'}">Due In</span> 
                 <span class="urgency-${urgencyLevel}">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</span></p>
              <p><span class="badge badge-info">Amount</span> <strong>₦${amount.toLocaleString()}</strong></p>
              <p><span class="badge badge-info">Due Date</span> ${formattedDate}</p>
            </div>

            <div class="benefits">
              <h4>✨ What Completing Your Payment Unlocks:</h4>
              <p><span class="milestone-icon">🏆</span> Full program certification and badge</p>
              <p><span class="milestone-icon">📜</span> Official course completion certificate</p>
              <p><span class="milestone-icon">🤝</span> Lifetime access to alumni network</p>
              <p><span class="milestone-icon">💼</span> Career support and job placement assistance</p>
              <p><span class="milestone-icon">🔄</span> Continued access to all course materials</p>
              <p><span class="milestone-icon">👨‍💻</span> Project feedback and portfolio review</p>
            </div>

            <p style="text-align: center; color: #495057; font-weight: 500;">
              You're almost there! Complete your payment to finalize your investment and unlock all program benefits.
            </p>

            <a href="${paymentLink}" class="payment-button">
              🎯 COMPLETE PAYMENT NOW - ₦${amount.toLocaleString()}
            </a>

            <p style="text-align: center; color: #6c757d; font-size: 0.9em;">
              🔒 Secure payment processed by Paystack
            </p>

            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
              <h4 style="color: #856404; margin: 0 0 10px 0;">💡 Need more time?</h4>
              <p style="color: #856404; margin: 0;">
                If you need a payment extension, please contact our support team at 
                <a href="mailto:${process.env.EMAIL_FROM || "programrelations@nebiant.com"}" style="color: #856404; text-decoration: underline;">
                  ${process.env.EMAIL_FROM || "programrelations@nebiant.com"}
                </a>
              </p>
            </div>

            <div class="footer">
              <p><strong>Congratulations on reaching this milestone! 🎉</strong></p>
              <p>You've completed most of your program - this final step ensures you receive all the benefits you've earned.</p>
              
              <p style="margin-top: 20px;">
                Need assistance? Contact our support team at 
                <a href="mailto:${process.env.EMAIL_FROM || "programrelations@nebiant.com"}" style="color: #28a745; text-decoration: none;">
                  ${process.env.EMAIL_FROM || "programrelations@nebiant.com"}
                </a>
              </p>
              
              <p style="margin-top: 15px; color: #999; font-size: 0.8em;">
                This is an automated reminder. Please do not reply directly to this email.
              </p>
            </div>
          </div>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #777;">
            <p>© 2026 10Alytics Inc. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sendMail(mailOptions);
    console.log(`Second half reminder sent to ${email}`);
  } catch (error) {
    console.error("Error sending second half reminder:", error);
    throw new Error("Failed to send second half reminder");
  }
};

export const sendPaymentConfirmation = async (
  email: string,
  userName: string,
  courseTitle: string,
  installmentNumber: number
) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || "programrelations@nebiant.com",
    to: email,
    subject: `Payment Confirmation for ${courseTitle} - Installment ${installmentNumber}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
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
          .header h1 {
            margin: 0;
            font-size: 24px;
            color: white;
          }
          .content {
            padding: 40px 30px;
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
          .dashboard-button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #6742FA;
            color: white !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            margin: 20px 0;
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
            <h2 style="color: #333; text-align: center; margin: 0 0 20px 0;">Payment Received</h2>
          <p>Dear ${userName},</p>
          <p>We've successfully received your payment for installment ${installmentNumber} of ${courseTitle}.</p>
          <p>Thank you for staying current with your payments!</p>
          <a href="${domain}/dashboard" class="dashboard-button">Access Dashboard</a>
          <p>Best regards,<br>10Alytics Team</p>
          </div>
          <div class="footer">
            <p>© 2026 10Alytics Inc. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sendMail(mailOptions);
  } catch (error) {
    console.error("Error sending payment confirmation:", error);
    throw error;
  }
};

export const sendPurchaseConfirmationMail = async (
  email: string,
  courseTitle: string,
  user_name: string,
  courseAccessLink: string
) => {
  console.log("Send email initiated +1");
  const mailOptions = {
    from: process.env.EMAIL_FROM || "programrelations@nebiant.com",
    to: email,
    subject: "Payment Status",
    html: `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Course Purchase Confirmation</title>
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
            background-color: #fff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
          }
          .header {
            background-color: #6742FA;
            padding: 30px;
            text-align: center;
            color: white;
          }
          .header h2 {
            margin: 0;
            font-size: 24px;
            color: white;
          }
          .content {
            padding: 40px 30px;
          }
          h1 {
            color: #333;
            text-align: center;
            margin: 0 0 20px 0;
          }
          p {
            color: #555;
            line-height: 1.6;
          }
          .course-name {
            font-weight: bold;
            color: #6742FA;
          }
          .course-access-link {
            display: inline-block;
            text-align: center;
            margin-top: 20px;
            padding: 12px 24px;
            background-color: #6742FA;
            color: #fff !important;
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
                  <h2 style="margin: 0; font-size: 24px; color: white;">10Alytics Business</h2>
                </td>
              </tr>
            </table>
          </div>
          <div class="content">
            <h1>${courseTitle} Course Purchase Confirmation</h1>
    <p>Dear ${user_name},</p>
    <p>Congratulations! Your purchase of the course <span class="course-name">${courseTitle}</span> has been successfully completed.</p>
    <p>We're thrilled to have you join our learning community. Your course access is now active, and you can start your learning journey immediately.</p>
    <p>Here's what you can now access:</p>
    <ul>
      <li>All course materials and resources</li>
      <li>Interactive learning sessions</li>
      <li>Assignments and projects</li>
      <li>Our supportive learning community</li>
    </ul>
    <p>To begin your course, please click the link below:</p>
    <a class="course-access-link" href="${courseAccessLink}">Access Your Course</a>
    <p>If you have any questions or need assistance as you start your course, please don't hesitate to contact our support team.</p>
    <p>We wish you an enriching learning experience!</p>
    <p>Best regards,<br>10Alytics Team</p>
    </div>
    <div class="footer">
      <p>© 2026 10Alytics Inc. All rights reserved.</p>
    </div>
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
  console.log("Send email done +1");
};

export const sendAccountDeactivationNotification = async (
  email: string,
  userName: string,
  courseTitle: string,
  paymentPlan: string,
  overdueDays: number,
  installmentNumber?: number,
  nextCohortDate?: Date
) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || "programrelations@nebiant.com",
    to: email,
    subject: `⚠️ Account Deactivated - ${courseTitle} Payment Required`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          .container {
            max-width: 600px;
            margin: 20px auto;
            padding: 40px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
            border-radius: 15px;
            color: #333;
          }
          .content {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .warning-badge {
            background: #dc3545;
            color: white;
            padding: 8px 15px;
            border-radius: 20px;
            font-weight: bold;
            display: inline-block;
            margin-bottom: 15px;
          }
          .deactivation-details {
            background: #f8d7da;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #dc3545;
          }
          .action-section {
            background: #d1ecf1;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #0c5460;
          }
          .contact-button {
            display: inline-block;
            padding: 12px 25px;
            background: #007bff;
            color: white !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            margin: 10px 10px 10px 0;
            transition: background 0.2s;
          }
          .contact-button:hover {
            background: #0056b3;
          }
          .urgent-contact {
            background: #dc3545;
          }
          .urgent-contact:hover {
            background: #c82333;
          }
          .next-steps {
            margin: 25px 0;
            padding: 20px;
            background: #fff3cd;
            border-radius: 8px;
            border-left: 4px solid #ffc107;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
            color: #6c757d;
            font-size: 0.9em;
            text-align: center;
          }
          .badge {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
            margin-right: 10px;
          }
          .badge-danger { background: #dc3545; color: white; }
          .badge-warning { background: #ffc107; color: black; }
          .badge-info { background: #17a2b8; color: white; }
          .highlight-box {
            background: #e2e3e5;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            text-align: center;
            font-weight: 500;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <div class="header">
              <div class="warning-badge">⚠️ ACCOUNT DEACTIVATED</div>
              <h1 style="color: #dc3545; margin-bottom: 10px;">Payment Required</h1>
              <p>Dear ${userName},</p>
            </div>

            <div class="deactivation-details">
              <h3>📋 Deactivation Details</h3>
              <p><span class="badge badge-danger">Course</span> ${courseTitle}</p>
              <p><span class="badge badge-warning">Payment Plan</span> ${paymentPlan.replace(/_/g, ' ')}</p>
              ${installmentNumber ? `<p><span class="badge badge-info">Overdue Installment</span> #${installmentNumber}</p>` : ''}
              <p><span class="badge badge-danger">Days Overdue</span> ${overdueDays} days</p>
              <p><span class="badge badge-danger">Status</span> Account temporarily suspended</p>
            </div>

            <div class="highlight-box">
              <p style="margin: 0; color: #721c24;">
                <strong>Your account has been temporarily deactivated due to overdue payment.</strong><br>
                This means you currently cannot access course materials, live sessions, or community features.
              </p>
            </div>

            ${nextCohortDate ? `
            <div class="action-section">
              <h4>🔄 Good News - We've Moved You Forward</h4>
              <p>To help you continue your learning journey, we've automatically enrolled you in the next available cohort starting on <strong>${nextCohortDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })}</strong>.</p>
              <p>Once you make your payment, your access will be restored and you can join the new cohort.</p>
            </div>
            ` : ''}

            <div class="next-steps">
              <h4>📞 What Should You Do Next?</h4>
              <p><strong>Option 1:</strong> If you believe this deactivation was done in error or too early, please contact us immediately:</p>
              <a href="mailto:hello@nebiant.com?subject=Account Deactivated - Need Review&body=Hello, my account for ${courseTitle} was deactivated and I believe this was done in error. Please review my payment status. My email: ${email}" class="contact-button urgent-contact">
                🚨 Report Error - hello@nebiant.com
              </a>
              
              <p style="margin-top: 20px;"><strong>Option 2:</strong> If the deactivation is correct, contact our payment support team to discuss payment options:</p>
              <a href="mailto:programrelations@nebiant.com?subject=Payment Assistance Needed&body=Hello, I need assistance with my overdue payment for ${courseTitle}. Please help me resolve this. My email: ${email}" class="contact-button">
                💬 Payment Support
              </a>
            </div>

            <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
              <h4 style="color: #155724; margin: 0 0 10px 0;">✅ Quick Resolution</h4>
              <p style="color: #155724; margin: 0;">
                Most payment issues can be resolved within 24 hours. Our team is here to help you get back to learning as quickly as possible.
              </p>
            </div>

            <div class="footer">
              <p><strong>We want you to succeed! 💪</strong></p>
              <p>This temporary suspension doesn't mean the end of your learning journey. Contact us and we'll work together to get you back on track.</p>
              
              <p style="margin-top: 20px;">
                <strong>Questions?</strong><br>
                • General Support: <a href="mailto:programrelations@nebiant.com">programrelations@nebiant.com</a><br>
                • Urgent Issues: <a href="mailto:hello@nebiant.com">hello@nebiant.com</a>
              </p>
              
              <p style="margin-top: 15px; color: #999; font-size: 0.8em;">
                This is an automated notification. For assistance, please use the contact options above.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sendMail(mailOptions);
    console.log(`Account deactivation notification sent to ${email}`);
  } catch (error) {
    console.error("Error sending account deactivation notification:", error);
    throw error;
  }
};

export const sendWrongfulDeactivationAlert = async (
  email: string,
  userName: string,
  courseTitle: string,
  paymentPlan: string,
  deactivationReason: string,
  userEmail: string
) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || "programrelations@nebiant.com",
    to: "hello@nebiant.com", // Internal alert email
    cc: [email, "programrelations@nebiant.com"], // Copy to user and support
    subject: `🚨 URGENT: Potential Wrongful Account Deactivation - ${userName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          .container {
            max-width: 700px;
            margin: 20px auto;
            padding: 40px;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%);
            border-radius: 15px;
            color: #333;
          }
          .content {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
          }
          .alert-header {
            background: #dc3545;
            color: white;
            padding: 15px;
            border-radius: 8px;
            text-align: center;
            margin-bottom: 25px;
          }
          .user-details {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #ffc107;
          }
          .reason-box {
            background: #fff3cd;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            border-left: 4px solid #856404;
          }
          .action-required {
            background: #d1ecf1;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #0c5460;
          }
          .badge {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
            margin-right: 10px;
          }
          .badge-danger { background: #dc3545; color: white; }
          .badge-warning { background: #ffc107; color: black; }
          .badge-info { background: #17a2b8; color: white; }
          .badge-primary { background: #007bff; color: white; }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #dee2e6;
            color: #6c757d;
            font-size: 0.9em;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <div class="alert-header">
              <h1 style="margin: 0;">🚨 URGENT REVIEW REQUIRED</h1>
              <p style="margin: 5px 0 0 0; font-size: 1.1em;">Potential Wrongful Account Deactivation</p>
            </div>

            <div class="user-details">
              <h3>👤 Affected User Details</h3>
              <p><span class="badge badge-primary">Name</span> ${userName}</p>
              <p><span class="badge badge-primary">Email</span> ${userEmail}</p>
              <p><span class="badge badge-info">Course</span> ${courseTitle}</p>
              <p><span class="badge badge-warning">Payment Plan</span> ${paymentPlan.replace(/_/g, ' ')}</p>
              <p><span class="badge badge-danger">Deactivated</span> ${new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}</p>
            </div>

            <div class="reason-box">
              <h4 style="color: #856404; margin: 0 0 10px 0;">⚠️ Detected Issue</h4>
              <p style="color: #856404; margin: 0; font-weight: 500;">
                ${deactivationReason}
              </p>
            </div>

            <div class="action-required">
              <h4>🎯 Immediate Actions Required</h4>
              <ol style="margin: 0; padding-left: 20px;">
                <li><strong>Review Payment History:</strong> Check the user's complete payment timeline and cohort schedule</li>
                <li><strong>Verify Cohort Status:</strong> Confirm whether their cohort has actually started and if payments are truly overdue</li>
                <li><strong>Check System Logic:</strong> Review the cron job logic that triggered this deactivation</li>
                <li><strong>Immediate Reactivation:</strong> If wrongful, reactivate the account immediately</li>
                <li><strong>User Communication:</strong> Send apology and explanation to the affected user</li>
              </ol>
            </div>

            <div style="background: #e2e3e5; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <h4 style="margin: 0 0 10px 0;">📊 Investigation Checklist</h4>
              <ul style="margin: 0; padding-left: 20px;">
                <li>✅ Has the user's cohort actually started?</li>
                <li>✅ Are we past the appropriate grace period for their payment plan?</li>
                <li>✅ Did they make their required payments on time relative to cohort milestones?</li>
                <li>✅ Is there a system bug in the payment tracking logic?</li>
              </ul>
            </div>

            <div style="background: #d4edda; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
              <h4 style="color: #155724; margin: 0 0 10px 0;">📞 User Has Been Notified</h4>
              <p style="color: #155724; margin: 0;">
                The user has been copied on this email and informed that if they believe this deactivation was wrongful, 
                they should contact hello@nebiant.com immediately. They expect a quick resolution.
              </p>
            </div>

            <div class="footer">
              <p><strong>Priority Level: HIGH</strong> ⚡</p>
              <p>This alert was automatically generated by the system when a potentially incorrect deactivation was detected.</p>
              
              <p style="margin-top: 20px;">
                <strong>Time Sensitive:</strong> Please investigate and resolve within 2 hours to maintain user trust and satisfaction.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await sendMail(mailOptions);
    console.log(`Wrongful deactivation alert sent for user: ${userEmail}`);
  } catch (error) {
    console.error("Error sending wrongful deactivation alert:", error);
    throw error;
  }
};