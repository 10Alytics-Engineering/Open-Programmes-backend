import express from "express";
import { documentUpload, uploadDocument } from "../controllers/upload";
import { isLoggedIn } from "../middleware";

export default (router: express.Router) => {
  router.post(
    "/upload/document",
    isLoggedIn,
    (req, res, next) => {
      documentUpload.single("file")(req, res, (err) => {
        if (err) {
          if (err.message === "File too large") {
            return res.status(400).json({ message: "File size must be less than 5MB" });
          }
          return res.status(400).json({ message: err.message });
        }
        next();
      });
    },
    uploadDocument
  );
};
