import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";


export const createFacilitator = async (req: Request, res: Response) => {
  try {
    const { name, email, phoneNumber, imageUrl, bio, title, courseIds } = req.body;

    // Validate input
    if (!name || !email || !phoneNumber) {
      return res.status(400).json({ error: "Name, email and phone number are required" });
    }

    // Check if facilitator exists
    const existingFacilitator = await prismadb.facilitator.findUnique({ 
      where: { email } 
    });
    if (existingFacilitator) {
      return res.status(409).json({ error: "Facilitator with this email already exists" });
    }

    // Create facilitator
    const facilitator = await prismadb.facilitator.create({
      data: {
        name,
        email,
        phoneNumber,
        imageUrl,
        bio,
        title,
        courses: {
          connect: courseIds?.map((id: string) => ({ id })) || []
        }
      },
      include: {
        courses: true
      }
    });

    res.status(201).json(facilitator);
  } catch (error) {
    console.error("[FACILITATOR_CREATION_ERROR]", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getFacilitators = async (req: Request, res: Response) => {
  try {
    const facilitators = await prismadb.facilitator.findMany({
      include: {
        courses: {
          select: {
            id: true,
            title: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json(facilitators);
  } catch (error) {
    console.error("[GET_FACILITATORS_ERROR]", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateFacilitator = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, phoneNumber, imageUrl, bio, title, courseIds } = req.body;

    // Check if facilitator exists
    const existingFacilitator = await prismadb.facilitator.findUnique({ 
      where: { id } 
    });
    if (!existingFacilitator) {
      return res.status(404).json({ error: "Facilitator not found" });
    }

    // Update facilitator
    const facilitator = await prismadb.facilitator.update({
      where: { id },
      data: {
        name,
        email,
        phoneNumber,
        imageUrl,
        bio,
        title,
        courses: {
          set: courseIds?.map((id: string) => ({ id })) || []
        }
      },
      include: {
        courses: true
      }
    });

    res.status(200).json(facilitator);
  } catch (error) {
    console.error("[FACILITATOR_UPDATE_ERROR]", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteFacilitator = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if facilitator exists
    const existingFacilitator = await prismadb.facilitator.findUnique({ 
      where: { id } 
    });
    if (!existingFacilitator) {
      return res.status(404).json({ error: "Facilitator not found" });
    }

    // Delete facilitator
    await prismadb.facilitator.delete({
      where: { id }
    });

    res.status(200).json({ message: "Facilitator deleted successfully" });
  } catch (error) {
    console.error("[FACILITATOR_DELETE_ERROR]", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const assignFacilitatorToCourse = async (req: Request, res: Response) => {
  try {
    const { facilitatorId, courseId } = req.params;

    // Check if facilitator exists
    const facilitator = await prismadb.facilitator.findUnique({ 
      where: { id: facilitatorId } 
    });
    if (!facilitator) {
      return res.status(404).json({ error: "Facilitator not found" });
    }

    // Check if course exists
    const course = await prismadb.course.findUnique({ 
      where: { id: courseId } 
    });
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Assign facilitator to course
    const updatedCourse = await prismadb.course.update({
      where: { id: courseId },
      data: {
        facilitators: {
          connect: { id: facilitatorId }
        }
      },
      include: {
        facilitators: true
      }
    });

    res.status(200).json(updatedCourse);
  } catch (error) {
    console.error("[ASSIGN_FACILITATOR_ERROR]", error);
    res.status(500).json({ error: "Internal server error" });
  }
};