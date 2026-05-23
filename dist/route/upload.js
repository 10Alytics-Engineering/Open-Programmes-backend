"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const upload_1 = require("../controllers/upload");
const middleware_1 = require("../middleware");
exports.default = (router) => {
    router.post("/upload/document", middleware_1.isLoggedIn, (req, res, next) => {
        upload_1.documentUpload.single("file")(req, res, (err) => {
            if (err) {
                if (err.message === "File too large") {
                    return res.status(400).json({ message: "File size must be less than 5MB" });
                }
                return res.status(400).json({ message: err.message });
            }
            next();
        });
    }, upload_1.uploadDocument);
};
//# sourceMappingURL=upload.js.map