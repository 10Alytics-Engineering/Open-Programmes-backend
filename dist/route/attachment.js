"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const middleware_1 = require("../middleware");
const attachment_1 = require("../controllers/attachment");
exports.default = (router) => {
    router.post("/courses/:courseId/weeks/:weekId/attachments", middleware_1.isCourseAdmin, attachment_1.createAttachment);
    router.delete("/courses/:courseId/weeks/:weekId/attachments/:attachmentId", middleware_1.isCourseAdmin, attachment_1.deleteAttachment);
};
//# sourceMappingURL=attachment.js.map