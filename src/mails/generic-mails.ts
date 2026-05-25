type GenericEmailTemplateOptions = {
  title: string;
  greeting?: string;
  message: string;
  highlightText?: string;
  buttonText?: string;
  buttonUrl?: string;
  footerNote?: string;
};

export const genericEmailTemplate = ({
  title,
  greeting = "Hello,",
  message,
  highlightText,
  buttonText,
  buttonUrl,
  footerNote = "You are receiving this email from 10Alytics Business.",
}: GenericEmailTemplateOptions) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
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
          .content {
            padding: 40px 30px;
          }
          h1 {
            margin: 0;
            font-size: 24px;
            color: white;
          }
          h2 {
            color: #222;
            margin: 0 0 18px;
            font-size: 22px;
          }
          p {
            color: #555;
            line-height: 1.6;
            margin: 15px 0;
            font-size: 15px;
          }
          .highlight {
            margin: 24px 0;
            padding: 16px 18px;
            background-color: #f4f1ff;
            border-left: 4px solid #6742FA;
            border-radius: 8px;
            color: #3d2a8c;
            font-weight: 600;
            line-height: 1.6;
          }
          .button-wrap {
            text-align: center;
            margin: 28px 0 10px;
          }
          .button {
            display: inline-block;
            padding: 13px 26px;
            background-color: #6742FA;
            color: white !important;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 15px;
          }
          .footer {
            background-color: #f4f4f4;
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #777;
          }
          .footer p {
            font-size: 12px;
            color: #777;
            margin: 5px 0;
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
                  <h1>10Alytics Business</h1>
                </td>
              </tr>
            </table>
          </div>

          <div class="content">
            <h2>${title}</h2>

            <p>${greeting}</p>

            <p>${message}</p>

            ${
              highlightText
                ? `<div class="highlight">${highlightText}</div>`
                : ""
            }

            ${
              buttonText && buttonUrl
                ? `
                  <div class="button-wrap">
                    <a href="${buttonUrl}" class="button">${buttonText}</a>
                  </div>
                `
                : ""
            }

            <p>${footerNote}</p>
          </div>

          <div class="footer">
            <p>© 2026 10Alytics Business. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};
