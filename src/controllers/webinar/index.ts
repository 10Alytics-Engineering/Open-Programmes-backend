import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";

export const registerAiAutomation = async (req: Request, res: Response) => {
  try {
    const { full_name, email, phone, skill_interested_in, terms_accepted } = req.body;

    const registration = await prismadb.webinarAiAutomation.create({
      data: {
        full_name,
        email,
        phone,
        skill_interested_in,
        terms_accepted,
      },
    });

    return res.status(200).json(registration);
  } catch (error) {
    console.log(error);
    return res.status(400).json({ error: "An error occurred during registration" });
  }
};

export const registerGenerativeAiData = async (req: Request, res: Response) => {
  try {
    const { full_name, email, phone, skill_interested_in, terms_accepted } = req.body;

    const registration = await prismadb.webinarGenerativeAiData.create({
      data: {
        full_name,
        email,
        phone,
        skill_interested_in,
        terms_accepted,
      },
    });

    return res.status(200).json(registration);
  } catch (error) {
    console.log(error);
    return res.status(400).json({ error: "An error occurred during registration" });
  }
};
