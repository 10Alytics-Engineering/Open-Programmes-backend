import { sendMail } from '../../utils/nodemailer';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface AccountDeletionParams {
  email: string;
  name: string;
}

export const sendAccountDeletionEmail = async ({ email, name }: AccountDeletionParams) => {
  try {
    const deletionDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'programrelations@nebiant.com',
      to: email,
      subject: 'Notice Regarding Your Account Deletion',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Account Deletion Notice</title>
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
                padding: 0;
                background-color: #ffffff;
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
                color: #555555;
                line-height: 1.6;
                margin-bottom: 15px;
              }
              .footer {
                background-color: #f4f4f4;
                margin-top: 30px;
                text-align: center;
                color: #999999;
                font-size: 12px;
                padding: 20px;
                border-top: 1px solid #eee;
              }
              .date-notice {
                font-style: italic;
                color: #666;
                text-align: center;
                margin: 15px 0;
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
                <h1 style="color: #333; text-align: center; margin: 0 0 20px 0;">Account Deletion Notice</h1>
              
              <p>Dear ${name},</p>
              
              <p>We wanted to inform you that your account has been deleted from our system as of <span class="date-notice">${deletionDate}</span>.</p>
              
              <p>If you believe this was done in error or if you have any concerns, please do not hesitate to contact your class coordinator for further assistance.</p>
              
              <p>We apologize for any inconvenience this may have caused.</p>
              
              <p>Best regards,<br>10Alytics Team</p>

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
    console.error("Error sending account deletion email:", error);
    throw error;
  }
};