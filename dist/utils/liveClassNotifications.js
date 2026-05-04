"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyCohortMembers = exports.sendLiveClassEmail = void 0;
const prismadb_1 = require("../lib/prismadb");
const nodemailer_1 = require("./nodemailer");
const sendLiveClassEmail = async (recipient, liveClass, type) => {
    const joinLink = `${process.env.NEXT_PUBLIC_APP_URL}/join-live?classId=${liveClass.id}&email=${recipient.email}`;
    let subject = "";
    let message = "";
    switch (type) {
        case 'creation':
            subject = `Live Class Scheduled: ${liveClass.title}`;
            message = `A new live class has been scheduled for your cohort: <strong>${liveClass.title}</strong>.<br><br>Date & Time: ${new Date(liveClass.startTime).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`;
            break;
        case 'reminder':
            subject = `Reminder: Live Class in 30 minutes - ${liveClass.title}`;
            message = `Your live class <strong>${liveClass.title}</strong> is starting in about 30 minutes. Get ready!`;
            break;
        case 'started':
            subject = `Live Now: ${liveClass.title}`;
            message = `Your live class <strong>${liveClass.title}</strong> has started now! Click the join link below to join immediately.`;
            break;
    }
    const mailOptions = {
        from: process.env.EMAIL_FROM || 'programrelations@nebiant.com',
        to: recipient.email,
        subject: subject,
        html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f7ff; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); }
            .header { background: #6742FA; color: white; padding: 30px; text-align: center; }
            .content { padding: 40px 30px; }
            .btn { display: inline-block; padding: 14px 28px; background: #6742FA; color: white !important; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 25px; box-shadow: 0 4px 6px rgba(103, 66, 250, 0.2); }
            .footer { font-size: 12px; color: #999; margin: 20px 0; text-align: center; }
            .info-box { background: #f8f9fa; border-left: 4px solid #6742FA; padding: 15px; margin: 20px 0; border-radius: 4px; }
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
                    <h1 style="margin: 0; font-size: 24px; color: white;">10Alytics Business Live</h1>
                  </td>
                </tr>
              </table>
            </div>
            <div class="content">
              <p>Hi ${recipient.name || 'Student'},</p>
              <p style="font-size: 16px;">${message}</p>
              
              <div class="info-box">
                <strong>Topic:</strong> ${liveClass.title}<br>
                <strong>Start Time:</strong> ${new Date(liveClass.startTime).toLocaleString()}
              </div>

              <div style="text-align: center;">
                <a href="${joinLink}" class="btn">Join Class Now</a>
              </div>
            </div>
            <div class="footer">
              <p>You're receiving this because you're enrolled in a 10Alytics Business program.</p>
              <p>© 2026 10Alytics Inc. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `
    };
    try {
        await (0, nodemailer_1.sendMail)(mailOptions);
    }
    catch (err) {
        console.error(`Failed to send ${type} email to ${recipient.email}:`, err);
    }
};
exports.sendLiveClassEmail = sendLiveClassEmail;
const notifyCohortMembers = async (liveClassId, type) => {
    try {
        const liveClass = await prismadb_1.prismadb.liveClass.findUnique({
            where: { id: liveClassId },
            include: { cohortCourse: true }
        });
        if (!liveClass)
            return;
        const users = await prismadb_1.prismadb.userCohort.findMany({
            where: {
                cohortId: liveClass.cohortCourse.cohortId,
                isActive: true,
                user: { inactive: false }
            },
            include: { user: true }
        });
        console.log(`[LIVE_NOTIFY] Notifying ${users.length} users for "${liveClass.title}" (${type})`);
        // Process in batches to avoid rate limiting
        const batchSize = 10;
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            await Promise.all(batch.map(uc => {
                if (uc.user.email) {
                    return (0, exports.sendLiveClassEmail)({ email: uc.user.email, name: uc.user.name, userId: uc.user.id }, liveClass, type);
                }
                return Promise.resolve();
            }));
        }
        // Update notification status if it's reminder or start
        if (type === 'reminder') {
            await prismadb_1.prismadb.liveClass.update({
                where: { id: liveClassId },
                data: { notified30m: true }
            });
        }
        else if (type === 'started') {
            await prismadb_1.prismadb.liveClass.update({
                where: { id: liveClassId },
                data: { notifiedStart: true }
            });
        }
    }
    catch (error) {
        console.error(`[LIVE_NOTIFY_ERROR] Error notifying cohort for class ${liveClassId}:`, error);
    }
};
exports.notifyCohortMembers = notifyCohortMembers;
//# sourceMappingURL=liveClassNotifications.js.map