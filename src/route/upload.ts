import express from "express";
import {
  createS3UploadUrl,
  documentUpload,
  uploadDocument,
} from "../controllers/upload";
import { isLoggedIn } from "../middleware";
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export default (router: express.Router) => {
  router.post(
    "/upload/document",
    isLoggedIn,
    (req, res, next) => {
      documentUpload.single("file")(req, res, (err) => {
        if (err) {
          if (err.message === "File too large") {
            return res
              .status(400)
              .json({ message: "File size must be less than 5MB" });
          }
          return res.status(400).json({ message: err.message });
        }
        next();
      });
    },
    uploadDocument,
  );

  router.post(
    "/uploads/s3-url",
    isLoggedIn,
    upload.single("file"),
    createS3UploadUrl,
  );
};
