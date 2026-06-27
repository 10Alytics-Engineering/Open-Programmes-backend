import { sendEmail } from "../utils/mailgun";
import { genericEmailTemplate } from "./generic-mails";

export const sendJapaSessionRegistrationEmail = async ({
  email,
  fullName,
  targetCountry,
  wantsConsultation,
}: {
  email: string;
  fullName: string;
  targetCountry: string;
  wantsConsultation: boolean;
}) => {
  const html = genericEmailTemplate({
    title: "Your Spot Has Been Reserved",
    greeting: `Hi ${fullName},`,
    message: `Thank you for registering for the Global Career Relocation Session. Your spot has been reserved successfully.`,
    highlightText: `Target Country: ${targetCountry}${
      wantsConsultation ? "\nYou also requested a free consultation." : ""
    }`,
    buttonText: "Join the Community",
    buttonUrl: process.env.JAPA_SESSION_COMMUNITY_LINK || "",
    footerNote:
      "We’ll send you updates and session reminders using the email you registered with.",
  });

  await sendEmail(
    email,
    "Your Global Career Relocation Session Spot Is Reserved",
    html,
  );
};
