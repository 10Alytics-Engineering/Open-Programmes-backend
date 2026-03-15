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
const prismadb_1 = require("../lib/prismadb");
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
     * This checks real-time payment status from both ScholarshipApplication and the main PaymentStatus tables.
     */
    static async syncAllApplications() {
        console.log('[GOOGLE_SHEETS_SYNC]: Starting comprehensive sync...');
        try {
            const spreadsheetId = process.env.GOOGLE_SHEETS_IWD_2026_SPREADSHEET_ID;
            const range = process.env.GOOGLE_SHEETS_IWD_2026_RANGE || 'Sheet1!A1';
            if (!spreadsheetId) {
                console.warn('[GOOGLE_SHEETS_SYNC]: SPREADSHEET_ID not configured for full sync.');
                return { success: false, error: 'Spreadsheet ID missing' };
            }
            // Fetch all applications with their associated users and main payment records
            const applications = await prismadb_1.prismadb.scholarshipApplication.findMany({
                include: {
                    user: {
                        include: {
                            paymentStatus: {
                                include: {
                                    cohort: true
                                }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
            if (applications.length === 0) {
                console.log('[GOOGLE_SHEETS_SYNC]: No applications found in DB to sync.');
                return { success: true, count: 0 };
            }
            const auth = this.getAuth();
            const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
            // 1. Clear the sheet first for a clean export
            try {
                await sheets.spreadsheets.values.clear({
                    spreadsheetId,
                    range,
                    requestBody: {}
                });
            }
            catch (clearErr) {
                console.warn('[GOOGLE_SHEETS_SYNC]: Clear failed:', clearErr.message);
            }
            // 2. Prepare Header and Data
            const header = [
                'Full Name',
                'Email',
                'Phone',
                'Country',
                'Gender',
                'Program',
                'Selected Cohort',
                'Discount Code',
                'Payment Status (IWD)',
                'Paid Cohort',
                'Submitted At'
            ];
            const rows = applications.map(app => {
                let realStatus = app.paymentStatus || 'PENDING';
                let paidCohort = 'N/A';
                // Verification Logic:
                // 1. If app is marked PAID, we trust it.
                // 2. If PENDING, check User's Account Status or PaymentStatus table
                if (realStatus !== 'PAID' && app.user) {
                    // Check if they have a COMPLETE payment status for the IWD cohorts
                    const iwdPaidStatus = app.user.paymentStatus.find(ps => ps.status === 'COMPLETE' &&
                        (ps.cohort?.name?.includes('April 2026') || ps.cohort?.name?.includes('May 2026')));
                    if (iwdPaidStatus || app.user.accountPaymentStatus === 'PAID') {
                        realStatus = 'PAID';
                        paidCohort = iwdPaidStatus?.cohort?.name || 'IWD Cohort';
                    }
                }
                return [
                    app.fullName,
                    app.email,
                    app.phone_number,
                    app.country,
                    app.gender,
                    app.program,
                    app.cohort,
                    app.discountCode || 'IWD 2026',
                    realStatus,
                    paidCohort,
                    new Date(app.createdAt).toLocaleString('en-GB')
                ];
            });
            const values = [header, ...rows];
            // 3. Write all data
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                requestBody: { values },
            });
            console.log(`[GOOGLE_SHEETS_SYNC]: Full sync completed. ${applications.length} applications exported.`);
            return { success: true, count: applications.length };
        }
        catch (error) {
            console.error('[GOOGLE_SHEETS_SYNC]: Full sync failed:', error.message);
            return { success: false, error: error.message };
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
    /**
     * Syncs all payment data to Google Sheets, split into separate sheets by status:
     * - Completed Payment: COMPLETE
     * - Partially Paid: BALANCE_HALF_PAYMENT
     * - Failed / Other: PENDING_SEAT_CONFIRMATION, EXPIRED, etc.
     */
    static async syncPaymentData() {
        console.log('[GOOGLE_SHEETS_PAYMENTS]: Starting payment data sync...');
        try {
            const spreadsheetId = process.env.GOOGLE_SHEETS_PAYMENTS_SPREADSHEET_ID;
            if (!spreadsheetId) {
                console.warn('[GOOGLE_SHEETS_PAYMENTS]: SPREADSHEET_ID not configured.');
                return { success: false, error: 'Spreadsheet ID missing' };
            }
            const paymentStatuses = await prismadb_1.prismadb.paymentStatus.findMany({
                include: {
                    user: true,
                    course: true,
                    cohort: true
                },
                orderBy: { createdAt: 'desc' }
            });
            if (paymentStatuses.length === 0) {
                console.log('[GOOGLE_SHEETS_PAYMENTS]: No payment data found in DB to sync.');
                return { success: true, count: 0 };
            }
            const auth = this.getAuth();
            const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
            // Split by status
            const completed = paymentStatuses.filter(ps => ps.status === 'COMPLETE');
            const partiallyPaid = paymentStatuses.filter(ps => ps.status === 'BALANCE_HALF_PAYMENT');
            const failed = paymentStatuses.filter(ps => ps.status !== 'COMPLETE' && ps.status !== 'BALANCE_HALF_PAYMENT');
            // Ensure all three sheets exist in the spreadsheet
            await this.ensurePaymentSheetsExist(sheets, spreadsheetId);
            const header = [
                'User Name',
                'User Email',
                'User Phone',
                'Course Name',
                'Cohort Name',
                'Course Price',
                'Status',
                'Payment Plan',
                'Second Payment Due Date',
                'Amount Paid',
                'Created At',
                'Updated At'
            ];
            const writeSheet = async (sheetName, list) => {
                const rows = list.map(ps => this.paymentStatusToRow(ps));
                const values = [header, ...rows];
                try {
                    await sheets.spreadsheets.values.clear({
                        spreadsheetId,
                        range: sheetName,
                        requestBody: {}
                    });
                }
                catch (clearErr) {
                    console.warn(`[GOOGLE_SHEETS_PAYMENTS]: Clear ${sheetName} failed:`, clearErr.message);
                }
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${sheetName}!A1`,
                    valueInputOption: 'RAW',
                    requestBody: { values },
                });
            };
            await writeSheet(this.PAYMENT_SHEET_NAMES.completed, completed);
            await writeSheet(this.PAYMENT_SHEET_NAMES.partiallyPaid, partiallyPaid);
            await writeSheet(this.PAYMENT_SHEET_NAMES.failed, failed);
            console.log(`[GOOGLE_SHEETS_PAYMENTS]: Sync successful. Completed: ${completed.length}, Partially Paid: ${partiallyPaid.length}, Failed/Other: ${failed.length}`);
            return {
                success: true,
                count: paymentStatuses.length,
                completed: completed.length,
                partiallyPaid: partiallyPaid.length,
                failed: failed.length,
            };
        }
        catch (error) {
            console.error('[GOOGLE_SHEETS_PAYMENTS]: Sync failed:', error.message);
            return { success: false, error: error.message };
        }
    }
    /**
     * Ensures "Completed Payment", "Partially Paid", and "Failed / Other" sheets exist;
     * creates any that are missing.
     */
    static async ensurePaymentSheetsExist(sheets, spreadsheetId) {
        const required = Object.values(this.PAYMENT_SHEET_NAMES);
        const res = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets.properties.title',
        });
        const existing = (res.data.sheets || []).map(s => s.properties?.title).filter(Boolean);
        const toAdd = required.filter(title => !existing.includes(title));
        if (toAdd.length === 0)
            return;
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: toAdd.map(title => ({
                    addSheet: {
                        properties: { title },
                    },
                })),
            },
        });
        console.log('[GOOGLE_SHEETS_PAYMENTS]: Created sheets:', toAdd.join(', '));
    }
    /**
     * Maps a single PaymentStatus record to a row array (same column order as header).
     */
    static paymentStatusToRow(ps) {
        const coursePriceNum = this.parseCoursePrice(ps.course?.price);
        let amountPaid = 0;
        if (ps.status === 'COMPLETE') {
            amountPaid = coursePriceNum;
        }
        else if (ps.status === 'BALANCE_HALF_PAYMENT') {
            amountPaid = Math.ceil(coursePriceNum / 2);
        }
        return [
            ps.user?.name || 'N/A',
            ps.user?.email || 'N/A',
            ps.user?.phone_number || 'N/A',
            ps.course?.title || 'N/A',
            ps.cohort?.name || 'N/A',
            ps.course?.price || 'N/A',
            ps.status,
            ps.paymentPlan || 'N/A',
            ps.secondPaymentDueDate ? new Date(ps.secondPaymentDueDate).toLocaleDateString('en-GB') : 'N/A',
            amountPaid,
            new Date(ps.createdAt).toLocaleString('en-GB'),
            new Date(ps.updatedAt).toLocaleString('en-GB'),
        ];
    }
    /**
     * Robust price parser to handle strings like "100k", "250,000", etc.
     */
    static parseCoursePrice(priceStr) {
        if (!priceStr)
            return 250000; // Default fallback
        let cleaned = String(priceStr).replace(/,/g, '').trim().toLowerCase();
        let multiplier = 1;
        if (cleaned.endsWith('k')) {
            multiplier = 1000;
            cleaned = cleaned.slice(0, -1);
        }
        const parsed = Number(cleaned);
        return isNaN(parsed) ? 250000 : Math.ceil(parsed * multiplier);
    }
}
exports.GoogleSheetsSyncService = GoogleSheetsSyncService;
GoogleSheetsSyncService.auth = null;
/** Sheet names in the main payments spreadsheet for each status bucket */
GoogleSheetsSyncService.PAYMENT_SHEET_NAMES = {
    completed: 'Completed Payment',
    partiallyPaid: 'Partially Paid',
    failed: 'Failed / Other',
};
//# sourceMappingURL=googleSheets.js.map