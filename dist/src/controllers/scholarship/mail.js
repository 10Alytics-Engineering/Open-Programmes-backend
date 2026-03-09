"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendIWDRegistrationEmail = void 0;
const mailgun_1 = require("../../utils/mailgun");
const sendIWDRegistrationEmail = async (email, name) => {
    const firstName = name.split(' ')[0];
    const subject = "You’re In! Your IWD 2026 Registration is Confirmed 🎉";
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    margin: 0;
                    padding: 0;
                    background-color: #f9f9f9;
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
                .content {
                    padding: 40px 30px;
                }
                .footer {
                    background-color: #f4f4f4;
                    padding: 20px;
                    text-align: center;
                    font-size: 12px;
                    color: #777;
                }
                .button {
                    display: inline-block;
                    padding: 14px 28px;
                    background-color: #6742FA;
                    color: white !important;
                    text-decoration: none;
                    border-radius: 8px;
                    font-weight: bold;
                    margin: 20px 0;
                }
                .highlight {
                    color: #6742FA;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin:0; font-size: 24px;">10Alytics</h1>
                </div>
                <div class="content">
                    <p>Hello ${firstName},</p>
                    <p>Your <strong>International Women’s Day 2026</strong> registration was successful! 🎉</p>
                    <p>Thank you for taking this important step toward building your future in tech. We’re excited to support you on this journey.</p>
                    
                    <p><strong>Next Step:</strong> To get personalized guidance on the best path for you, please book a session with one of our career coaches using the link below:</p>
                    
                    <p style="margin-bottom: 5px;"><strong>Let’s Talk:</strong></p>
                    <div style="text-align: center;">
                        <a href="https://calendly.com/adeizasuleman/how-can-we-help-you" class="button">Book a Career Session</a>
                    </div>
                    
                    <p>During this session, you’ll be able to:</p>
                    <ul>
                        <li>Ask questions about our programs</li>
                        <li>Get clarity on the best tech path for you</li>
                        <li>Plan your transition into tech</li>
                    </ul>
                    
                    <p>A member of our team will also reach out shortly to confirm and finalize your chosen program slot via payment to avoid losing your <span class="highlight">60% discount slot</span>.</p>
                    
                    <p>Once again, Happy International Women’s History Month! 💜</p>
                    <p>We’re excited about what the future holds for you in tech.</p>
                    
                    <p>You can join the community with this link: <br>
                    <a href="https://chat.whatsapp.com/Ic1xzmKCJfe0IuRnyoDcec?mode=hq2tcli" class="highlight">Join the Community</a></p>
                    
                    <p>Warm regards,<br>
                    <strong>The 10Alytics Team</strong></p>
                </div>
                <div class="footer">
                    <p>Need help? <a href="mailto:help@10alytics.io">help@10alytics.io</a></p>
                    <p>&copy; 2026 10Alytics Inc. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;
    try {
        await (0, mailgun_1.sendEmail)(email, subject, html);
    }
    catch (error) {
        console.error("Error sending scholarship confirmation email:", error);
        // We don't want to throw error here to avoid breaking the application flow
        // but it's good to log it.
    }
};
exports.sendIWDRegistrationEmail = sendIWDRegistrationEmail;
//# sourceMappingURL=mail.js.map