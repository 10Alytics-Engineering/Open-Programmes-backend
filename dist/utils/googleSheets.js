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
     * Syncs all payment data to Google Sheets.
     * Exports: User info, Course, Cohort, Payment Status, Amount Paid, etc.
     */
    static async syncPaymentData() {
        console.log('[GOOGLE_SHEETS_PAYMENTS]: Starting payment data sync...');
        try {
            const spreadsheetId = process.env.GOOGLE_SHEETS_PAYMENTS_SPREADSHEET_ID;
            let range = process.env.GOOGLE_SHEETS_PAYMENTS_RANGE || 'Sheet1!A1';
            if (!spreadsheetId) {
                console.warn('[GOOGLE_SHEETS_PAYMENTS]: SPREADSHEET_ID not configured.');
                return { success: false, error: 'Spreadsheet ID missing' };
            }
            // Fetch all payment data with relations
            const paymentStatuses = await prismadb_1.prismadb.paymentStatus.findMany({
                include: {
                    user: true,
                    course: true,
                    cohort: true,
                    transactions: {
                        where: { status: 'success' },
                        orderBy: { paymentDate: 'desc' }
                    },
                    paymentInstallments: {
                        orderBy: { installmentNumber: 'asc' }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
            if (paymentStatuses.length === 0) {
                console.log('[GOOGLE_SHEETS_PAYMENTS]: No payment data found.');
                return { success: true, count: 0 };
            }
            const auth = this.getAuth();
            const sheets = googleapis_1.google.sheets({ version: 'v4', auth });
            // Automatically find the first sheet's name if range is not specifically configured
            if (!process.env.GOOGLE_SHEETS_PAYMENTS_RANGE) {
                try {
                    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
                    const firstSheet = spreadsheet.data.sheets?.[0]?.properties?.title;
                    if (firstSheet) {
                        range = `${firstSheet}!A1`;
                        console.log(`[GOOGLE_SHEETS_PAYMENTS]: Discovered sheet name: "${firstSheet}". Using range: "${range}"`);
                    }
                }
                catch (err) {
                    console.warn('[GOOGLE_SHEETS_PAYMENTS]: Spreadsheet fetch failed, using default range.', err.message);
                }
            }
            // Clear the sheet first
            try {
                await sheets.spreadsheets.values.clear({
                    spreadsheetId,
                    range,
                    requestBody: {}
                });
            }
            catch (clearErr) {
                console.warn('[GOOGLE_SHEETS_PAYMENTS]: Clear failed:', clearErr.message);
            }
            // Prepare headers
            const header = [
                'ID',
                'Full Name',
                'Email',
                'Phone',
                'Course',
                'Cohort',
                'Payment Plan',
                'Payment Status',
                'Total Amount',
                'Amount Paid',
                'Remaining Amount',
                'Total Installments',
                'Paid Installments',
                'Payment Date',
                'Paystack Reference',
                'Created At',
                'Updated At'
            ];
            // Prepare data rows
            const rows = paymentStatuses.map((ps, index) => {
                const lastTransaction = ps.transactions[0];
                const paidInstallments = ps.paymentInstallments.filter(pi => pi.paid).length;
                const totalInstallments = ps.paymentInstallments.length;
                // Calculate total amount paid from successful transactions
                const totalPaid = ps.transactions.reduce((sum, tx) => {
                    const amount = typeof tx.amount === 'string'
                        ? parseFloat(tx.amount)
                        : tx.amount;
                    return sum + amount;
                }, 0);
                // Calculate remaining amount
                const coursePrice = (ps.course?.price || 0);
                const remaining = coursePrice - totalPaid;
                return [
                    index + 1, // ID
                    ps.user?.name || 'N/A',
                    ps.user?.email || 'N/A',
                    ps.user?.phone_number || 'N/A',
                    ps.course?.title || 'N/A',
                    ps.cohort?.name || 'N/A',
                    ps.paymentPlan || 'N/A',
                    ps.status || 'PENDING',
                    coursePrice || 0,
                    totalPaid || 0,
                    Math.max(0, remaining) || 0,
                    totalInstallments || 1,
                    paidInstallments || 0,
                    lastTransaction?.paymentDate ? new Date(lastTransaction.paymentDate).toLocaleString('en-GB') : 'N/A',
                    lastTransaction?.transactionRef || 'N/A',
                    new Date(ps.createdAt).toLocaleString('en-GB'),
                    new Date(ps.updatedAt).toLocaleString('en-GB')
                ];
            });
            const values = [header, ...rows];
            // Write all data to sheet
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range,
                valueInputOption: 'RAW',
                requestBody: { values },
            });
            console.log(`[GOOGLE_SHEETS_PAYMENTS]: Sync completed. ${paymentStatuses.length} payment records exported.`);
            return { success: true, count: paymentStatuses.length };
        }
        catch (error) {
            console.error('[GOOGLE_SHEETS_PAYMENTS]: Sync failed:', error.message);
            return { success: false, error: error.message };
        }
    }
}
exports.GoogleSheetsSyncService = GoogleSheetsSyncService;
GoogleSheetsSyncService.auth = null;
//# sourceMappingURL=googleSheets.js.map