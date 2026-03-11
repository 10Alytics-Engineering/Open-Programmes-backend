import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const registerMasterclass = async (req: Request, res: Response) => {
  const { name, email, phone, gender, location, heard_from, help_with } =
    req.body;

  if (!name || !email || !phone) {
    return res
      .status(400)
      .json({ message: "Name, Email and Phone Number required" });
  }

  try {
    await prismadb.masterClassRegistration.create({
      data: {
        name,
        email,
        phone,
        gender,
        location,
        heard_from,
        help_with,
      },
    });

    return res.status(201).json({
      status: "success",
      message: null,
      data: "Registration successfully",
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getMasterClassApplicants = async (req: Request, res: Response) => {
  try {
    const masterclassApplicants = await prismadb.masterClassRegistration.findMany();

    res
      .status(200)
      .json({ status: "success", message: null, data: masterclassApplicants });
  } catch (error) {
    handleServerError(error, res);
  }
};
