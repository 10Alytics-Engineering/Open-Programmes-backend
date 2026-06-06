"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createS3UploadUrl = exports.uploadDocument = exports.documentUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const client_s3_1 = require("@aws-sdk/client-s3");
const crypto_1 = __importDefault(require("crypto"));
const s3_config_1 = require("../../utils/s3-config");
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
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix + ext);
    },
});
exports.documentUpload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // We allow documents, reject images/videos
        if (file.mimetype.startsWith("image/") ||
            file.mimetype.startsWith("video/")) {
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
        // Use X-Forwarded-Host or Host header to construct the URL dynamically
        const host = req.headers["x-forwarded-host"] || req.get("host");
        const protocol = req.headers["x-forwarded-proto"] || req.protocol;
        const baseUrl = `${protocol}://${host}`;
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
const createS3UploadUrl = async (req, res) => {
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
        const key = `${folder}/${crypto_1.default.randomUUID()}.${ext}`;
        await s3_config_1.s3.send(new client_s3_1.PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
            CacheControl: "public, max-age=31536000, immutable",
        }));
        const fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
        return res.status(200).json({
            status: "success",
            data: {
                fileUrl,
                key,
            },
        });
    }
    catch (error) {
        console.error("Backend S3 upload error:", error);
        return res.status(500).json({ message: "Failed to upload file" });
    }
};
exports.createS3UploadUrl = createS3UploadUrl;
//# sourceMappingURL=index.js.map