import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import { sendJapaSessionRegistrationEmail } from "../../mails/japa-session-mails";
import { JapaSessionSheetsService } from "../../utils/googleSheets";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const registerForJapaSession = async (req: Request, res: Response) => {
  try {
    const {
      fullName,
      email,
      phoneNumber,
      currentCountry,
      targetCountry,
      profession,
      hearAbout,
      wantsEarlyAccess = false,
      wantsConsultation = false,
    } = req.body;

    if (
      !fullName ||
      !email ||
      !phoneNumber ||
      !currentCountry ||
      !targetCountry ||
      !profession ||
      !hearAbout
    ) {
      return res.status(400).json({
        message: "Please fill in all required fields.",
      });
    }

    const cleanedEmail = email?.toLowerCase().trim();

    const existing = await prismadb.japaSessionRegistration.findUnique({
      where: {
        email: cleanedEmail,
      },
    });

    if (existing) {
      return res.status(200).json({
        status: "success",
        message: "You have already reserved your spot.",
        data: existing,
      });
    }

    const registration = await prismadb.japaSessionRegistration.create({
      data: {
        fullName: fullName.trim(),
        email: cleanedEmail,
        phoneNumber,
        currentCountry,
        targetCountry,
        profession,
        hearAbout,
        wantsEarlyAccess,
        wantsConsultation,
      },
    });

    const [sheetResult] = await Promise.allSettled([
      JapaSessionSheetsService.syncRegistration(registration),
      sendJapaSessionRegistrationEmail({
        email: cleanedEmail,
        fullName,
        targetCountry,
        wantsConsultation,
      }),
    ]);

    if (sheetResult.status === "fulfilled" && sheetResult.value?.success) {
      await prismadb.japaSessionRegistration.update({
        where: { id: registration.id },
        data: {
          syncedToGoogleSheet: true,
          googleSheetSyncedAt: new Date(),
          googleSheetError: null,
        },
      });
    }

    if (sheetResult.status === "fulfilled" && !sheetResult.value?.success) {
      await prismadb.japaSessionRegistration.update({
        where: { id: registration.id },
        data: {
          googleSheetError: sheetResult.value?.error || "Sheet sync failed",
        },
      });
    }

    return res.status(201).json({
      status: "success",
      message: "Your spot has been reserved successfully.",
      data: registration,
    });
  } catch (error) {
    handleServerError(error, res);
  }
};
