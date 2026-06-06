import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { s3 } from "../../utils/s3-config";

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
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  },
});

export const documentUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // We allow documents, reject images/videos
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype.startsWith("video/")
    ) {
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

    // Use X-Forwarded-Host or Host header to construct the URL dynamically
    const host = req.headers["x-forwarded-host"] || req.get("host");
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const baseUrl = `${protocol}://${host}`;

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

export const createS3UploadUrl = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const folder = req.body.folder || process.env.AWS_BUCKET_FOLDER;

    if (!file) {
      return res.status(400).json({ message: "File is required" });
    }

    if (!folder) {
      return res
        .status(400)
        .json({ message: "File upload destination is unspecified" });
    }

    const ext = file.originalname.split(".").pop();
    const key = `${folder}/${crypto.randomUUID()}.${ext}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET!,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );

    const fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    return res.status(200).json({
      status: "success",
      data: {
        fileUrl,
        key,
      },
    });
  } catch (error) {
    console.error("Backend S3 upload error:", error);
    return res.status(500).json({ message: "Failed to upload file" });
  }
};
