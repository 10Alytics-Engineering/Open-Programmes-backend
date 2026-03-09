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
exports.GoogleSheetsSyncService = void 0;
const googleapis_1 = require("googleapis");
const google_auth_library_1 = require("google-auth-library");
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
/**
 * Service to sync scholarship applications directly with Google Sheets.
 * This mirrors the functionality in the 10alytics-api project.
 */
class GoogleSheetsSyncService {
    /**
     * Initialize Google Auth using Service Account credentials from environment variables.
     */
    static getAuth() {
        if (this.auth)
            return this.auth;
        const serviceAccountJsonBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
        if (!serviceAccountJsonBase64) {
            console.warn('[GOOGLE_SHEETS_SYNC]: GOOGLE_SERVICE_ACCOUNT_JSON not found in environment.');
            throw new Error('Google Sheets service account credentials missing');
        }
        try {
            const decodedJson = Buffer.from(serviceAccountJsonBase64, 'base64').toString('utf8');
            const credentials = JSON.parse(decodedJson);
            this.auth = new google_auth_library_1.JWT({
                email: credentials.client_email,
                key: credentials.private_key,
                scopes: SCOPES,
            });
            return this.auth;
        }
        catch (error) {
            console.error('[GOOGLE_SHEETS_SYNC]: Failed to parse service account JSON:', error);
            throw new Error('Invalid Google Sheets credentials');
        }
    }
    /**
     * Appends a scholarship application to the configured Google Sheet.
     */
    static async syncApplication(application) {
        try {
            const spreadsheetId = process.env.GOOGLE_SHEETS_IWD_2026_SPREADSHEET_ID;
            const range = process.env.GOOGLE_SHEETS_IWD_2026_RANGE || 'Sheet1!A1';
            if (!spreadsheetId) {
                console.warn('[GOOGLE_SHEETS_SYNC]: SPREADSHEET_ID not configured. Skipping sync.');
                return;
            }
            const auth = this.getAuth();
            const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
            // Prepare row data: [Full Name, Email, Phone, Country, Gender, Program, Cohort, Discount Code, Submitted At]
            const values = [
                [
                    application.fullName,
                    application.email,
                    application.phone_number,
                    application.country,
                    application.gender,
                    application.program,
                    application.cohort,
                    application.discountCode || 'N/A',
                    new Date(application.createdAt).toLocaleString('en-GB')
                ],
            ];
            const resource = {
                values,
            };
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                requestBody: resource,
            });
            console.log(`[GOOGLE_SHEETS_SYNC]: Successfully synced application for ${application.email}`);
        }
        catch (error) {
            console.error('[GOOGLE_SHEETS_SYNC]: Sync failed:', error.message);
            // We log errors but don't re-throw to prevent breaking the application flow
        }
    }
}
exports.GoogleSheetsSyncService = GoogleSheetsSyncService;
GoogleSheetsSyncService.auth = null;
//# sourceMappingURL=googleSheets.js.map