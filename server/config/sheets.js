import { google } from "googleapis";

const auth = new google.auth.JWT(
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/spreadsheets"]
);

const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_ID;

export async function appendDonation(donation) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Donaciones!A:I",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          donation.id,
          donation.donor_name,
          donation.amount_usd,
          donation.amount_original,
          donation.currency,
          donation.method,
          donation.country,
          donation.status,
          donation.created_at,
        ],
      ],
    },
  });
}

export async function appendExpense(expense) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "Gastos!A:F",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [
        [
          expense.id,
          expense.description,
          expense.amount_usd,
          expense.category,
          expense.receipt_url,
          expense.created_at,
        ],
      ],
    },
  });
}
