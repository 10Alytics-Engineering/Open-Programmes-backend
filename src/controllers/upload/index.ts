import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.resolve(process.cwd(), "uploads/documents");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

export const documentUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // We allow documents, reject images/videos
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      return cb(new Error("Images and videos should use Cloudinary"));
    }
    cb(null, true);
  },
});

export const uploadDocument = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Use BACKEND_URL or fallback to req.protocol + req.get("host")
    const baseUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get("host")}`;
    const fileUrl = `${baseUrl}/uploads/documents/${req.file.filename}`;

    res.status(200).json({
      message: "Document uploaded successfully",
      url: fileUrl,
    });
  } catch (error) {
    console.error("Document upload error:", error);
    res.status(500).json({ message: "Failed to upload document" });
  }
};
