# Loonie

A household spending tracker that runs entirely in your browser. Drop in your card and bank statements each month. Loonie combines them, sorts every line into a category, asks about the ones it does not recognise, and remembers your answers.

Stages 1 and 2 are built: upload, sorting, the review queue, a sorted list to check the result, the privacy tools, and the Home screen with the monthly summary and a short "worth a look" list. Budgets, runway goals and trends come in later stages.

## Privacy model

- **No server, no database, no accounts.** The app is a static site. All reading and sorting happens in the browser.
- **Statement files are read in memory and dropped.** The raw file is never written to disk, browser storage, or any server.
- **No network calls with your data.** No analytics, no error reporting, no third-party scripts. Fonts and libraries are bundled into the app. The built site carries a Content Security Policy with `connect-src 'self'`, so the browser itself refuses every connection except to the app's own address. That one allowance exists only so the photo reader can load its engine and language file, which ship with the app. Nothing is ever sent, only fetched.
- **No AI or API calls.** Categories come from your saved rules, keyword matching, and your own corrections.
- **What is stored, in this browser only:** merchant rules, categories, account nicknames, first names, monthly totals by category, and (if the toggle is on) cleaned transaction rows: date, merchant name, amount, category.
- **Never stored or shown:** card numbers, account numbers, or any run of 6 or more digits. These are stripped from merchant text and masked in file names.
- **Backup without the cloud.** Settings has "Export everything" and "Restore from a backup". One small file holds every line, category, rule, account and setting, so a cleared browser can be brought back exactly. The file is not encrypted and contains your transactions, so keep it somewhere only you can reach. "Export rules only" makes a file with no transactions in it.
- **Wipe everything.** One button in Settings, with a confirm step, deletes all stored data.

If this is hosted on GitHub Pages, the site address is publicly reachable. That is acceptable only because the site holds no data: everything lives in the visitor's own browser.

**This repository must never contain real financial data.** The `.gitignore` blocks statement files and backups. Tests use invented data in `tests/fixtures`.

## Running it

Node.js is needed. On this Mac it is installed in `~/.local/node`, which is not on the PATH by default, so either add it:

```bash
export PATH="$HOME/.local/node/bin:$PATH"
```

Then:

```bash
npm install     # first time only
npm run dev     # open http://localhost:5173
npm test        # unit tests
npm run build   # production build in dist/
npm run deploy  # test, build, and publish to GitHub Pages
```

Publishing pushes the built site to the `gh-pages` branch. If any test fails, nothing is published and the live site stays as it was.

## Supported files

| Bank | Format | Status |
| --- | --- | --- |
| American Express (Canada) | CSV | Built from the known layout. Check against a real file. |
| Scotiabank cards and chequing | CSV | Built from the known layouts. Not yet confirmed with a real file. |
| Anything else | CSV | A column picker appears when the layout is not recognised. |
| Any bank | PDF | Works for PDFs that contain text. Not yet confirmed with a real statement. |
| Any bank | Photo or screenshot (JPG, PNG) | Works, read on the device. Always the least reliable option. |
| Any bank | Scanned PDF (no text inside) | Not read directly. Take a screenshot of each page and drop that in. |

### How PDFs are read

The PDF library is bundled with the app and runs in the browser. It does not rely on one bank's layout: a transaction is any line that starts with a date and ends with an amount. On bank statements, the column an amount sits in (or the running balance) decides whether it is money out or money in.

The result is then checked against the balances printed on the statement. If the lines add up, they go straight in. If they do not, or no balances are found, the app shows every line it read and asks you to look them over before anything is added.

### How photos are read

Photos go through an on-device text reader (Tesseract, about 7 MB, loaded from the app itself the first time a photo is dropped). The picture is straightened, the words are regrouped into rows, and the same line finder and balance check used for PDFs take over.

A photo's lines only go straight in when they add up to the printed balances and every amount was read with confidence. Otherwise you see the list first, with hard-to-read lines marked "Check this one" and every amount editable. A photo of a single page rarely shows both balances, so expect the list most of the time.

Synthetic sample PDFs live in `tests/fixtures`. They are made by `tests/make-pdf-fixtures.py`.

## How it is organised

```
src/
  lib/            The logic. No React in here, and all of it is unit tested.
    money.ts        Amounts as whole cents, date reading, CAD formatting
    normalize.ts    Merchant name cleanup and digit masking
    categories.ts   Starting categories and keyword hints
    parsers/        One small adapter per bank, plus the manual column picker
    pdf/            PDF text reading, the statement line finder and the totals check
    photo/          On-device photo reading (OCR)
    actions.ts      Every change to the data: import, review queue, rules
    summary.ts      One month summed up by category, with the person filter
    checks.ts       The "worth a look" list: doubles, changed bills, jumps, new charges
    storage.ts      Browser storage, the rules-only file, wipe
    backup.ts       The full backup: pack, compress, check and restore
  screens/        Welcome, Home, Upload, Review, Sorted, Settings
  components/     Header, icons, accounts editor
  styles.css      Design tokens and classes, taken from the approved design
tests/            Unit tests and synthetic fixtures
```

To add a bank: write an adapter in `src/lib/parsers/` with a `detect` and a `parse` function, add it to the list in `parsers/index.ts`, and add a synthetic fixture and test.

## The backup file

Browser storage can be cleared by the browser or by you, so the backup is the real safety net.

- **Complete.** Transactions, monthly totals, rules, categories, accounts, names, dismissed checks and settings.
- **Small.** Each merchant name is stored once and every transaction is six small numbers, then the browser's built-in gzip compresses the lot. Three months of sample data came to 1.4 KB. Two years of heavy use stays well under 100 KB.
- **Checked.** The file carries a line count and a sum of all amounts. On restore these must match, or the file is refused and nothing on the device changes.
- **Safe to restore.** A restore over existing data asks first. The older rules-only files still load.

The app also asks the browser to keep its storage (`navigator.storage.persist`), which makes automatic clearing less likely but does not replace a backup.

## The monthly summary and checks

Home shows what was spent in the month, split into fixed and everyday, against the money that came into the bank account. Each category is compared with its usual amount: the average of its last three months that had any spending in it. Empty months are left out, because an empty month nearly always means that account's statement was not uploaded. The Household / person filter counts only the accounts that person owns; shared accounts appear under Household only.

The "worth a look" list holds four kinds of check, all plain arithmetic on rows in this browser:

| Check | Rule |
| --- | --- |
| Charged twice | Same merchant, amount and account within 3 days, $10 or more. |
| Bill changed | One charge a month, steady for the last two months, and a different amount now. |
| Category higher | At least $50 and 25% above the usual. Left out when a changed bill already explains it. |
| New standing charge | A merchant never seen before, in a category where charges repeat (subscriptions, phone, insurance, loan, rent, daycare). |

"Got it" hides a check for good. The first month has nothing to compare with, so only "charged twice" can appear.

## How sorting works

1. The merchant name is cleaned: prefixes such as `SQ *` and `TST*`, store numbers, cities and provinces are removed, so one merchant has one name.
2. Card payments, and bank payments to a card, are marked "Not spending" so nothing is counted twice. Bank deposits are marked "Money in".
3. A saved rule for the merchant is applied if there is one.
4. Otherwise, a well-known name (for example a big grocery chain) is filed as a guess and labelled as one.
5. Everything else waits in the Review queue. One answer covers every line from that merchant.
6. E-transfers, cash withdrawals and cheques are asked about one at a time and never get a permanent rule, because they mean something different each time.
