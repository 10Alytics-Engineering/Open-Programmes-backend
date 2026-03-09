import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import * as dotenv from 'dotenv';

dotenv.config();

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

/**
 * Service to sync scholarship applications directly with Google Sheets.
 * This mirrors the functionality in the 10alytics-api project.
 */
export class GoogleSheetsSyncService {
    private static auth: JWT | null = null;

    /**
     * Initialize Google Auth using Service Account credentials from environment variables.
     */
    private static getAuth(): JWT {
        if (this.auth) return this.auth;

        const serviceAccountJsonBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
        if (!serviceAccountJsonBase64) {
            console.warn('[GOOGLE_SHEETS_SYNC]: GOOGLE_SERVICE_ACCOUNT_JSON not found in environment.');
            throw new Error('Google Sheets service account credentials missing');
        }

        try {
            const decodedJson = Buffer.from(serviceAccountJsonBase64, 'base64').toString('utf8');
            const credentials = JSON.parse(decodedJson);

            this.auth = new JWT({
                email: credentials.client_email,
                key: credentials.private_key,
                scopes: SCOPES,
            });

            return this.auth;
        } catch (error) {
            console.error('[GOOGLE_SHEETS_SYNC]: Failed to parse service account JSON:', error);
            throw new Error('Invalid Google Sheets credentials');
        }
    }

    /**
     * Appends a scholarship application to the configured Google Sheet.
     */
    public static async syncApplication(application: any) {
        try {
            const spreadsheetId = process.env.GOOGLE_SHEETS_IWD_2026_SPREADSHEET_ID;
            const range = process.env.GOOGLE_SHEETS_IWD_2026_RANGE || 'Sheet1!A1';

            if (!spreadsheetId) {
                console.warn('[GOOGLE_SHEETS_SYNC]: SPREADSHEET_ID not configured. Skipping sync.');
                return;
            }

            const auth = this.getAuth();
            const sheets = google.sheets({ version: 'v4', auth });

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
        } catch (error: any) {
            console.error('[GOOGLE_SHEETS_SYNC]: Sync failed:', error.message);
            // We log errors but don't re-throw to prevent breaking the application flow
        }
    }
}
