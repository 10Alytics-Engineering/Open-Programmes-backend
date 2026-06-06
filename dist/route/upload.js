"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const upload_1 = require("../controllers/upload");
const middleware_1 = require("../middleware");
const multer_1 = __importDefault(require("multer"));
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
});
exports.default = (router) => {
    router.post("/upload/document", middleware_1.isLoggedIn, (req, res, next) => {
        upload_1.documentUpload.single("file")(req, res, (err) => {
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
    }, upload_1.uploadDocument);
    router.post("/uploads/s3-url", middleware_1.isLoggedIn, upload.single("file"), upload_1.createS3UploadUrl);
};
//# sourceMappingURL=upload.js.map