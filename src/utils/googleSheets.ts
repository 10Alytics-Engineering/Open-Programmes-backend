import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import * as dotenv from 'dotenv';
import { prismadb } from '../lib/prismadb';

dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Service to sync scholarship applications directly with Google Sheets.
 */
export class GoogleSheetsSyncService {
    private static auth: JWT | null = null;

    /**
     * Initialize Google Auth using Service Account credentials.
     * Supports both raw JSON string and Base64 encoded JSON.
     */
    private static getAuth(): JWT {
        if (this.auth) return this.auth;

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
            } else {
                // Otherwise assume it's Base64 (like in your other project)
                const decodedJson = Buffer.from(configJson, 'base64').toString('utf8');
                credentials = JSON.parse(decodedJson);
            }

            this.auth = new JWT({
                email: credentials.client_email,
                key: credentials.private_key,
                scopes: SCOPES,
            });

            console.log('[GOOGLE_SHEETS_SYNC]: Auth initialized for client_email:', credentials.client_email);
            return this.auth;
        } catch (error: any) {
            console.error('[GOOGLE_SHEETS_SYNC]: Authentication setup failed:', error.message);
            throw new Error('Invalid Google Sheets credentials');
        }
    }

    /**
     * Re-syncs all applications from the database to the Google Sheet.
     * This checks real-time payment status from both ScholarshipApplication and the main PaymentStatus tables.
     */
    public static async syncAllApplications() {
        console.log('[GOOGLE_SHEETS_SYNC]: Starting comprehensive sync...');
        try {
            const spreadsheetId = process.env.GOOGLE_SHEETS_IWD_2026_SPREADSHEET_ID;
            const range = process.env.GOOGLE_SHEETS_IWD_2026_RANGE || 'Sheet1!A1';

            if (!spreadsheetId) {
                console.warn('[GOOGLE_SHEETS_SYNC]: SPREADSHEET_ID not configured for full sync.');
                return { success: false, error: 'Spreadsheet ID missing' };
            }

            // Fetch all applications with their associated users and main payment records
            const applications = await prismadb.scholarshipApplication.findMany({
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
            const sheets = google.sheets({ version: 'v4', auth });

            // 1. Clear the sheet first for a clean export
            try {
                await sheets.spreadsheets.values.clear({
                    spreadsheetId,
                    range,
                    requestBody: {}
                });
            } catch (clearErr: any) {
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
                'Account Overall Status',
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
                    const iwdPaidStatus = app.user.paymentStatus.find(ps =>
                        ps.status === 'COMPLETE' &&
                        (ps.cohort?.name?.includes('April 2026') || ps.cohort?.name?.includes('May 2026'))
                    );

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
                    app.user?.accountPaymentStatus || 'UNPAID',
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
        } catch (error: any) {
            console.error('[GOOGLE_SHEETS_SYNC]: Full sync failed:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Appends a scholarship application to the Google Sheet.
     */
    public static async syncApplication(application: any) {
        try {
            const spreadsheetId = process.env.GOOGLE_SHEETS_IWD_2026_SPREADSHEET_ID;
            const range = process.env.GOOGLE_SHEETS_IWD_2026_RANGE || 'Sheet1!A1';

            if (!spreadsheetId) {
                console.warn('[GOOGLE_SHEETS_SYNC]: SPREADSHEET_ID not configured.');
                return;
            }

            const auth = this.getAuth();
            const sheets = google.sheets({ version: 'v4', auth });

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
        } catch (error: any) {
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
    public static async testConnection() {
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
