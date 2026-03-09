"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMail = exports.transporter = void 0;
const nodemailer = __importStar(require("nodemailer"));
const mailgun_1 = require("./mailgun");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
// Creating a transporter object using SMTP transport
exports.transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});
/**
 * Unified sendMail function that prefers Mailgun API if configured,
 * otherwise falls back to nodemailer SMTP.
 * Use this function instead of transporter.sendMail directly.
 */
const sendMail = async (options) => {
    // Use Mailgun if API key and domain are provided
    if (process.env.MAILGUN_API_KEY &&
        process.env.MAILGUN_DOMAIN &&
        process.env.MAILGUN_API_KEY !== 'your_mailgun_api_key' &&
        process.env.MAILGUN_API_KEY !== '') {
        try {
            return await (0, mailgun_1.sendEmail)(options.to, options.subject, options.html);
        }
        catch (error) {
            console.error('Mailgun API failed, falling back to SMTP...', error);
            // Fallback to SMTP below
        }
    }
    // Fallback to SMTP
    const mailOptions = {
        from: options.from || process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: options.to,
        subject: options.subject,
        html: options.html,
    };
    return await exports.transporter.sendMail(mailOptions);
};
exports.sendMail = sendMail;
//# sourceMappingURL=nodemailer.js.map