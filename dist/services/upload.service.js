"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachSignedUrlsToNested = exports.attachSignedUrls = exports.generateSignedDownloadUrl = exports.generateSignedFileUrl = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const s3_config_1 = require("../utils/s3-config");
const expiresIn = 60 * 60 * 24;
const generateSignedFileUrl = async (key) => {
    const command = new client_s3_1.GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
    });
    return (0, s3_request_presigner_1.getSignedUrl)(s3_config_1.s3, command, {
        expiresIn,
    });
};
exports.generateSignedFileUrl = generateSignedFileUrl;
const generateSignedDownloadUrl = async (key, fileName = "file") => {
    const command = new client_s3_1.GetObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${fileName}"`,
    });
    return (0, s3_request_presigner_1.getSignedUrl)(s3_config_1.s3, command, {
        expiresIn,
    });
};
exports.generateSignedDownloadUrl = generateSignedDownloadUrl;
const attachSignedUrls = async ({ items, keyField, urlField = "fileUrl", }) => {
    return Promise.all(items.map(async (item) => {
        const key = item[keyField];
        return {
            ...item,
            [urlField]: key
                ? await (0, exports.generateSignedFileUrl)(String(key))
                : item[urlField] || null,
        };
    }));
};
exports.attachSignedUrls = attachSignedUrls;
const attachSignedUrlsToNested = async (items, relationKey, keyField = "key", urlField = "url") => {
    return Promise.all(items.map(async (item) => {
        const relationItems = item[relationKey];
        if (!Array.isArray(relationItems)) {
            return item;
        }
        const updatedRelationItems = await Promise.all(relationItems.map(async (relationItem) => ({
            ...relationItem,
            [urlField]: relationItem[urlField] ||
                (relationItem[keyField]
                    ? await (0, exports.generateSignedFileUrl)(relationItem[keyField])
                    : null),
        })));
        return {
            ...item,
            [relationKey]: updatedRelationItems,
        };
    }));
};
exports.attachSignedUrlsToNested = attachSignedUrlsToNested;
//# sourceMappingURL=upload.service.js.map