# Contract renewal reminder setup (Support and SEO)

This version works with **two separate Google Sheets files**. In each file, the client name is in row 1 and Jalali renewal dates are in the rows below that same column. You can add a new column or new dates at the end of the sheet, and the next run will pick them up automatically.

> The project logic has been checked locally. It is not live until you set your Google access and Telegram token and run it in Google Apps Script.

## 1. Create the Apps Script project

1. Open https://script.google.com and click **New project**.
2. Name the project something like `Renewal Reminder`.
3. Add the `.gs` files from this folder one by one. Keep the file names. If the default `Code.gs` is empty, you can delete it.
4. In **Project Settings**, enable **Show "appsscript.json" manifest file in editor**. Replace the project manifest with `appsscript.json` from this folder.
5. **Save** the project.

## 2. IDs for the two spreadsheets

In each Google Sheet URL, the ID is the string between `/d/` and `/edit`, for example:
`https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`.

In **Project Settings > Script Properties**, set:

| Property | Value |
|---|---|
| `SUPPORT_SPREADSHEET_ID` | ID of the Support dead time file |
| `SEO_SPREADSHEET_ID` | ID of the SEO dead time file |

If a file has more than one visible worksheet, you **must** also set the data sheet names:

- `SUPPORT_SHEET_NAME`: Support data worksheet name
- `SEO_SHEET_NAME`: SEO data worksheet name

If each file has only one visible worksheet, those two values are not required.

## 3. Create a Telegram bot and get the Chat ID

1. Message the official bot at https://t.me/BotFather.
2. Send `/newbot` and choose a name and username.
3. Store the bot token **only** in Script Properties as `TELEGRAM_BOT_TOKEN`. Never put it in chat or in source files.
4. Open the bot you created and tap **Start** or send `/start`.
5. In Apps Script, choose `discoverTelegramChatId` from the function menu and click **Run**. Your personal chat ID appears in the **Execution log**. You may need to approve Google permissions the first time.
6. Store that ID in Script Properties as `TELEGRAM_CHAT_ID`.
7. Run `sendTestTelegram`. You should receive a test message in Telegram.

If chat ID discovery returns nothing, send `/start` in a private chat with the bot and run it again. This method is for private chats, not groups.

## 4. Test the data and activate the system

1. Run `runAllTests` first. All **15 tests** should pass.
2. Then run `previewReminders`. The preview appears in the **Execution log** and does not send Telegram messages or change your sheets.
3. After the data looks correct and the Telegram test message arrived, run `install` **once**. This runs the tests, preview, creates a separate history spreadsheet, and sets up the scheduled trigger.
4. In the **Triggers** menu, confirm there is a trigger for `runDailyReminders`. It runs around 9 AM `Asia/Tehran` time and is not guaranteed to be exactly 9:00.
5. After a real run, use **Executions** to inspect errors and details.

**Note:** On a day with no matching due dates, `runDailyReminders` may send nothing. That is expected. Telegram connectivity is tested separately with `sendTestTelegram`.

## 5. How to add a client and new dates

- **Row 1:** domain or client name, such as `new-client.com`.
- **Row 2 onward:** Jalali due dates, such as `1405-7-20` or `۱۴۰۵/۰۷/۲۰`.
- Set date cells to **Plain text** so Google Sheets does not convert Jalali dates into Gregorian dates.
- Empty rows between dates are allowed; every row with a valid date is read.
- Empty columns between clients are allowed; later columns are still read.
- **Add a new client in a new column on the right.** The delivery history ID includes the column number. Inserting or moving a column in the middle can change previous clients’ column numbers and make some reminders eligible to send again.
- Cell background color is not used to detect due dates.
- Each valid Jalali date is checked as its own due date. A new date is not calculated automatically from a previous one.

## 6. Send rules

- Default reminders: **7, 3, and 1 day before, plus the due date**.
- To change this, set optional `REMINDER_DAYS` in Script Properties, for example `14,7,3,1,0`.
- If anything is due that day, Telegram messages are sent grouped by Support and SEO.
- By default, no new message or retry is sent for **past** due dates.
- If a Telegram send fails, it can retry on the next run before or on the due date.
- To prevent duplicates, `SENT` status is stored in a **separate** history file.

## 7. History file

On the first successful `install` run, a file named `Renewal Reminder Log (internal)` is created. Its ID is stored in Script Properties as `LOG_SPREADSHEET_ID`.

**Do not delete that ID or file.** If the previous history file is unreachable, the script reports an error instead of creating a new file and forgetting already-sent messages. That avoids duplicate sends.

Preview is shown only in the Execution log and does not create any file or worksheet.

## 8. Limits and security

- The system runs independently on Google servers. Cursor and your computer do not need to stay open.
- The Google account needs access to both spreadsheet files and the required Script permissions.
- Local tests **do not replace** a real Google and Telegram connection test.
- If a failed send was logged in the past and the due date has now expired, it is not resent by default.
- On ambiguous network errors, Telegram’s API cannot mathematically guarantee exactly-once delivery; a duplicate is possible in rare cases.
- For identical names in two columns, the column number is part of the event ID, so do not rearrange older client columns.
- **Never publish the Telegram bot token or private spreadsheet IDs in a public GitHub repository.**
