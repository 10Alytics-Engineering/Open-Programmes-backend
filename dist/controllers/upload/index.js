"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadDocument = exports.documentUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uploadDir = path_1.default.resolve(process.cwd(), "uploads/documents");
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path_1.default.extname(file.originalname);
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
exports.documentUpload = (0, multer_1.default)({
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
const uploadDocument = async (req, res) => {
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
    }
    catch (error) {
        console.error("Document upload error:", error);
        res.status(500).json({ message: "Failed to upload document" });
    }
};
exports.uploadDocument = uploadDocument;
//# sourceMappingURL=index.js.map