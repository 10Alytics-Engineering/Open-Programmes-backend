import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";

interface SessionCreateRequest {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  sessionLink: string;
}

export const createSession = async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      startTime,
      endTime,
      sessionLink,
    }: SessionCreateRequest = req.body;

    if (!title || !startTime || !endTime || !sessionLink) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (new Date(startTime) >= new Date(endTime)) {
      return res
        .status(400)
        .json({ error: "End time must be after start time" });
    }

    const session = await prismadb.sessions.create({
      data: {
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        sessionLink,
      },
    });

    res.status(201).json(session);
  } catch (error) {
    console.error("[SESSION_CREATION_ERROR]", error);
    res.status(500).json({ error: "Failed to create session" });
  }
};

export const getActiveSessions = async (req: Request, res: Response) => {

};
