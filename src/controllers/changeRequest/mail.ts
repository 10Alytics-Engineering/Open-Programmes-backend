import { sendMail } from "../../utils/nodemailer";


export const sendEmail = async (options: {
  to: string;
  subject: string;
  html: string;
}) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || 'programrelations@nebiant.com',
    to: options.to,
    subject: options.subject,
    html: options.html,
  };

  try {
    await sendMail(mailOptions);
    console.log(`Email sent to ${options.to}`);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

export const sendChangeRequestNotification = async (request: any) => {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@nebiant.com';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>New Change Request</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); }
          .header { background-color: #6742FA; padding: 30px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 24px; color: white; }
          .content { padding: 40px 30px; }
          p { color: #555; line-height: 1.6; margin: 15px 0; }
          .info { margin: 10px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px; border-left: 4px solid #6742FA; }
          .label { font-weight: bold; color: #333; }
          .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #777; }
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
            <h2 style="color: #333; text-align: center; margin: 0 0 20px 0;">New ${request.type === "COURSE_CHANGE" ? "Course Change" : "Deferment"} Request</h2>
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
          <div class="footer">
            <p>© 2026 10Alytics Inc. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: adminEmail,
    subject: `New ${request.type === "COURSE_CHANGE" ? "Course Change" : "Deferment"} Request from ${request.user.name}`,
    html
  });
};

export const sendApprovalEmail = async (user: any, request: any, paymentLink: string) => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Request Approved</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); }
          .header { background-color: #6742FA; padding: 30px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 24px; color: white; }
          .content { padding: 40px 30px; }
          p { color: #555; line-height: 1.6; margin: 15px 0; }
          h2 { color: #333; text-align: center; margin: 0 0 20px 0; }
          .button { display: inline-block; padding: 12px 24px; background-color: #6742FA; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
          .info { margin: 10px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px; border-left: 4px solid #6742FA; }
          .label { font-weight: bold; color: #333; }
          .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #777; }
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
            <h2>Request Approved</h2>
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
          <div class="footer">
            <p>© 2026 10Alytics Inc. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: user.email,
    subject: `Your ${request.type === "COURSE_CHANGE" ? "Course Change" : "Deferment"} Request Has Been Approved`,
    html
  });
};

export const sendRejectionEmail = async (user: any, request: any, adminReason: string) => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Request Not Approved</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); }
          .header { background-color: #6742FA; padding: 30px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 24px; color: white; }
          .content { padding: 40px 30px; }
          p { color: #555; line-height: 1.6; margin: 15px 0; }
          h2 { color: #333; text-align: center; margin: 0 0 20px 0; }
          .reason { background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 15px 0; border-left: 4px solid #ffc107; }
          .label { font-weight: bold; color: #333; }
          .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #777; }
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
            <h2>Request Not Approved</h2>
          <p>Hello ${user.name},</p>
          <p>Your ${request.type === "COURSE_CHANGE" ? "course change" : "deferment"} request could not be approved at this time.</p>
          
          <div class="reason">
            <span class="label">Reason:</span> ${adminReason}
          </div>
          
          <p>If you have any questions or would like to discuss this further, please contact support.</p>
          </div>
          <div class="footer">
            <p>© 2026 10Alytics Inc. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: user.email,
    subject: `Update on Your ${request.type === "COURSE_CHANGE" ? "Course Change" : "Deferment"} Request`,
    html
  });
};

export const sendCompletionEmail = async (user: any, request: any) => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Change Completed</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f9f9f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05); }
          .header { background-color: #6742FA; padding: 30px; text-align: center; color: white; }
          .header h1 { margin: 0; font-size: 24px; color: white; }
          .content { padding: 40px 30px; }
          p { color: #555; line-height: 1.6; margin: 15px 0; }
          .success { background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 5px; padding: 15px; margin: 15px 0; text-align: center; border-left: 4px solid #28a745; }
          .success h2 { color: #155724; margin: 0; }
          .info { margin: 10px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px; border-left: 4px solid #6742FA; }
          .label { font-weight: bold; color: #333; }
          .footer { background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #777; }
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
            <div class="success">
              <h2>Change Completed Successfully!</h2>
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
          <div class="footer">
            <p>© 2026 10Alytics Inc. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  await sendEmail({
    to: user.email,
    subject: `Your ${request.type === "COURSE_CHANGE" ? "Course Change" : "Deferment"} Has Been Completed`,
    html
  });
};