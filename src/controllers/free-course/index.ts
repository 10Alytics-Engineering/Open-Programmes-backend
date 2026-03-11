import { Request, Response } from "express";
import { prismadb } from "../../lib/prismadb";
import PDFDocument from "pdfkit";

const handleServerError = (error: any, res: Response) => {
  console.error({ error_server: error });
  res.status(500).json({ message: "Internal Server Error" });
};

export const applyForCourse = async (req: Request, res: Response) => {
  const { name, email, phone } = req.body;

  if (!name || !email || !phone) {
    return res.status(400).json({ message: "Fill in details" });
  }

  try {
    await prismadb.freeCourseApplication.create({
      data: {
        name,
        email,
        phone,
      },
    });

    return res.status(200).json({
      status: "success",
      message: null,
      data: "Application sent successfully",
    });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const getFreeCourseApplicants = async (req: Request, res: Response) => {
  try {
    const freeCourseApplicants = await prismadb.freeCourseApplication.findMany();

    res
      .status(200)
      .json({ status: "success", message: null, data: freeCourseApplicants });
  } catch (error) {
    handleServerError(error, res);
  }
};

export const exportFreeCourseApplicantsPDF = async (req: Request, res: Response) => {
  try {
    const freeCourseApplicants = await prismadb.freeCourseApplication.findMany();
    
    // Create a new PDF document
    const doc = new PDFDocument();
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=course-applicants.pdf');
    
    // Pipe the PDF document to the response
    doc.pipe(res);
    
    // Add title
    doc
      .fontSize(20)
      .text('Free Course Applicants', { align: 'center' })
      .moveDown(2);
    
    // Add current date
    doc
      .fontSize(12)
      .text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'right' })
      .moveDown(2);
    
    // Add table headers
    const tableTop = 150;
    doc
      .fontSize(14)
      .text('Name', 50, tableTop)
      .text('Email', 200, tableTop)
      .text('Phone', 350, tableTop)
      .moveDown();
    
    // Add horizontal line
    doc
      .moveTo(50, tableTop + 20)
      .lineTo(550, tableTop + 20)
      .stroke();
    
    // Add applicant data
    let yPosition = tableTop + 40;
    freeCourseApplicants.forEach((applicant) => {
      doc
        .fontSize(12)
        .text(applicant.name, 50, yPosition)
        .text(applicant.email, 200, yPosition)
        .text(applicant.phone, 350, yPosition);
      
      yPosition += 30;
      
      // Add new page if we're near the bottom
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 50;
      }
    });
    
    // Add footer with total count
    doc
      .fontSize(12)
      .text(
        `Total Applicants: ${freeCourseApplicants.length}`,
        50,
        doc.page.height - 50,
        { align: 'center' }
      );
    
    // Finalize the PDF and end the stream
    doc.end();
    
  } catch (error) {
    handleServerError(error, res);
  }
};