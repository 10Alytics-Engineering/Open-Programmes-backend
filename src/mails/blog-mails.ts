import { sendEmail } from "../utils/mailgun";
import { genericEmailTemplate } from "./generic-mails";

export const sendBlogNotificationEmail = async ({
  email,
  blogTitle,
  blogId,
  unsubscribeToken,
}: {
  email: string;
  blogTitle: string;
  blogId: string;
  unsubscribeToken: string;
}) => {
  const blogUrl = `${process.env.NEXT_PUBLIC_APP_URL}/blog/${blogId}`;

  const unsubscribeUrl = `${process.env.NEXT_PUBLIC_APP_URL}/unsubscribe/blog/${unsubscribeToken}`;

  const html = genericEmailTemplate({
    title: "New Blog Article Published",
    greeting: "Hello,",
    message: `We just published a new article on 10Alytics Business:`,
    highlightText: blogTitle,
    buttonText: "Read Article",
    buttonUrl: blogUrl,
    footerNote: `
      You are receiving this email because you subscribed to 10Alytics Business updates.
      <br />
      <a href="${unsubscribeUrl}" style="color:#6742FA;">Unsubscribe from blog emails</a>
    `,
  });

  await sendEmail(email, `New 10Alytics Business article: ${blogTitle}`, html);
};
