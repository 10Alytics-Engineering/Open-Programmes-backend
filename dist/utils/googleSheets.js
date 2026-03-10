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
 */
class GoogleSheetsSyncService {
    /**
     * Initialize Google Auth using Service Account credentials.
     * Supports both raw JSON string and Base64 encoded JSON.
     */
    static getAuth() {
        if (this.auth)
            return this.auth;
        const configJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
        if (!configJson) {
            console.error('[GOOGLE_SHEETS_SYNC]: GOOGLE_SERVICE_ACCOUNT_JSON is missing in .env');
            throw new Error('Google Sheets credentials missing');
        }
        try {
            let credentials;
            // Try to parse as raw JSON first
            if (configJson.trim().startsWith('{')) {
                credentials = JSON.parse(configJson);
            }
            else {
                // Otherwise assume it's Base64 (like in your other project)
                const decodedJson = Buffer.from(configJson, 'base64').toString('utf8');
                credentials = JSON.parse(decodedJson);
            }
            this.auth = new google_auth_library_1.JWT({
                email: credentials.client_email,
                key: credentials.private_key,
                scopes: SCOPES,
            });
            console.log('[GOOGLE_SHEETS_SYNC]: Auth initialized for client_email:', credentials.client_email);
            return this.auth;
        }
        catch (error) {
            console.error('[GOOGLE_SHEETS_SYNC]: Authentication setup failed:', error.message);
            throw new Error('Invalid Google Sheets credentials');
        }
    }
    /**
     * Re-syncs all applications from the database to the Google Sheet.
     * This is useful for cron jobs to ensure the sheet is perfectly in sync.
     */
    static async syncAllApplications() {
        try {
            const spreadsheetId = process.env.GOOGLE_SHEETS_IWD_2026_SPREADSHEET_ID;
            const range = process.env.GOOGLE_SHEETS_IWD_2026_RANGE || 'Sheet1!A1';
            if (!spreadsheetId) {
                console.warn('[GOOGLE_SHEETS_SYNC]: SPREADSHEET_ID not configured for full sync.');
                return;
            }
            // Import prismadb dynamically to avoid circular dependencies
            const { prismadb } = await Promise.resolve().then(() => __importStar(require('../lib/prismadb')));
            const applications = await prismadb.scholarshipApplication.findMany({
                orderBy: { createdAt: 'desc' }
            });
            if (applications.length === 0) {
                console.log('[GOOGLE_SHEETS_SYNC]: No applications found in DB to sync.');
                return;
            }
            const auth = this.getAuth();
            const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
            // 1. Clear the sheet first for a clean export
            await sheets.spreadsheets.values.clear({
                spreadsheetId,
                range,
                requestBody: {}
            });
            // 2. Prepare Header and Data
            const header = ['Full Name', 'Email', 'Phone', 'Country', 'Gender', 'Program', 'Cohort', 'Discount Code', 'Payment Status', 'Submitted At'];
            const rows = applications.map(app => [
                app.fullName,
                app.email,
                app.phone_number,
                app.country,
                app.gender,
                app.program,
                app.cohort,
                app.discountCode || 'IWD 2026',
                app.paymentStatus || 'PENDING',
                new Date(app.createdAt).toLocaleString('en-GB')
            ]);
            const values = [header, ...rows];
            // 3. Write all data
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                requestBody: { values },
            });
            console.log(`[GOOGLE_SHEETS_SYNC]: Full sync completed. ${applications.length} applications exported.`);
        }
        catch (error) {
            console.error('[GOOGLE_SHEETS_SYNC]: Full sync failed:', error.message);
        }
    }
    /**
     * Appends a scholarship application to the Google Sheet.
     */
    static async syncApplication(application) {
        try {
            const spreadsheetId = process.env.GOOGLE_SHEETS_IWD_2026_SPREADSHEET_ID;
            const range = process.env.GOOGLE_SHEETS_IWD_2026_RANGE || 'Sheet1!A1';
            if (!spreadsheetId) {
                console.warn('[GOOGLE_SHEETS_SYNC]: SPREADSHEET_ID not configured.');
                return;
            }
            const auth = this.getAuth();
            const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
            // Prepare row data
            const values = [
                [
                    application.fullName,
                    application.email,
                    application.phone_number,
                    application.country,
                    application.gender,
                    application.program,
                    application.cohort,
                    application.discountCode || 'IWD 2026',
                    application.paymentStatus || 'PENDING',
                    new Date(application.createdAt || Date.now()).toLocaleString('en-GB')
                ],
            ];
            await sheets.spreadsheets.values.append({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                requestBody: { values },
            });
            console.log(`[GOOGLE_SHEETS_SYNC]: Data successfully sent to sheet for ${application.email}`);
        }
        catch (error) {
            console.error('[GOOGLE_SHEETS_SYNC]: Sync failed with entry:', application.email);
            console.error('[GOOGLE_SHEETS_SYNC]: Error detail:', error.message);
            if (error.message.includes('403')) {
                console.error('[GOOGLE_SHEETS_SYNC]: TIP: Ensure you shared the sheet with Editor permissions to the Service Account email.');
            }
            if (error.message.includes('404')) {
                console.error('[GOOGLE_SHEETS_SYNC]: TIP: Verify the Spreadsheet ID in your .env is correct.');
            }
        }
    }
    /**
     * Run a test sync to verify connection.
     */
    static async testConnection() {
        console.log('[GOOGLE_SHEETS_SYNC]: Running connection test...');
        await this.syncApplication({
            fullName: 'Test Connection',
            email: 'test@example.com',
            phone_number: '0000000000',
            country: 'Test',
            gender: 'N/A',
            program: 'Test Connection',
            cohort: 'Test',
            discountCode: 'TEST',
            createdAt: new Date()
        });
    }
}
exports.GoogleSheetsSyncService = GoogleSheetsSyncService;
GoogleSheetsSyncService.auth = null;
//# sourceMappingURL=googleSheets.js.map