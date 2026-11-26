# ANR Empire · Shop Desk

A shared mechanic-shop workspace. Customers own multiple vehicles; each vehicle has searchable estimates, invoices, parts, labor, mileage, notes, and payment history.

Live app: https://skynova-upgrade-shop.aweichman.chatgpt.site

## Use it

1. Open the private app and sign in with an authorized ChatGPT account.
2. Set the shop name, contact details, tax rate, and invoice terms in **Settings**.
3. Add a customer and their first vehicle together in the **New customer** form. Both records save together. Uncheck **Add their first vehicle** to save only a customer; additional vehicles can be added from **Vehicles** or the customer profile.
4. Open **Sales → New Invoice** or **Estimates → New Estimate**. The full-page editor follows the supplied Skynova references: From / To blocks, compact item rows, line taxes, notes, and totals.
5. On an invoice or estimate, use **Find Customer by Phone** under **To** to select a customer by a full or partial phone number; their vehicle and contact details fill in automatically. Search globally by name, formatted or unformatted phone number, car, plate, VIN, part description, part number, or job notes. Open a customer and use **Search within this customer** to find, for example, their brake repairs. Filter further by car.
6. Use the dropdown next to a document for Edit, View, Duplicate, Convert to Credit Note, Record Payment, Download/Print PDF, Change Status, Archive, and Delete. Send remains disabled as requested. PDF opens the browser print dialog, where you can choose Save as PDF.

All authorized computers share one D1 database. Lists refresh every 20 seconds and after a save. Job edits use revision checks; invoice edits retain payments and cannot reduce the total below recorded payments or issued credits, or reassign those records to a different owner. Issued credit notes are immutable. Payments cannot exceed the current invoice balance. Money uses integer cents; quantities support up to three decimals. The default tax rate is 0 until configured. Individual lines support rates with up to three decimal places, including 6.625%; existing documents retain their recorded rate and totals.

**Explore Sample Shop** displays fictional, read-only data in the browser without writing it to the shop database. Real records start empty. **Export Backup** downloads a JSON snapshot; automated backups and an in-app restore workflow are not included.

## Invoice actions

- Duplicate opens an unsaved copy with no payment, credit or archive history; saving assigns a new number.
- Credit notes are separate documents linked to an invoice. Adjust the copied lines for partial credit; issued credit cannot exceed the original invoice amount. Issuing a credit reduces the invoice balance and preserves the original payments. Credit against a paid invoice displays any customer credit owed; this app does not execute refunds.
- View credit notes using **Sales → Credit Notes**, or open them from the original invoice. Void a credit note through Change Status to reverse its balance effect; issued credit notes must be voided before deletion. Archiving an issued credit note keeps its credit applied.
- Archive and Deleted are separate filtered views. Unarchive or Restore returns records to their prior state. Delete is recoverable and retains payment history; there is no permanent-delete action. Restoring a previously archived record keeps it archived.
- Draft, Sent and work statuses are manually recorded. Paid, Partial, Credited, Settled and Late follow payments, credits and due dates. Marking Sent does not send email.

## Scope

This is an independent first version inspired by the invoicing workflow, not a Skynova integration. Existing Skynova customers and invoices have not been imported. There is no card processing, SMS/email sending, electronic signature, approval portal, inventory tracking, appointment calendar, or accounting reconciliation. Status is recorded by staff, not customer authorization. The shop must supply its own invoice terms and applicable tax treatment.

## Privacy and hosting

Keep this Site private. The hosting access policy restricts visitors, and API routes require the platform-provided authenticated visitor header in production. Records are shared across authorized visitors to this one shop; do not add an unrelated shop to this workspace. Do not expose the Worker directly without an equivalent authentication boundary. GitHub holds application code only; customer records and credentials are never committed. GitHub Pages alone cannot run the shared database backend.

Hosted sign-in uses ChatGPT. Additional staff need authorized access to the Site. The site remains owner-only for testing. ANR Empire is the initial shop name until changed in settings.

## Development

Node.js 22.13+ is required. Install with `npm run install:ci`, then run `npm run build`. Apply the generated migrations in order to your local D1 database using Wrangler and `dist/server/wrangler.json` (see the starter tooling documentation). `npm run dev` starts development. Local and hosted databases are separate.

Validation:

```sh
node --test tests/core.test.mjs tests/api.test.mjs
npx tsc --noEmit
npm run build
```

Schema: `db/schema.ts`; append migrations with `npm run db:generate`. UI: `app/page.tsx`, `app/shop-documents.tsx`, and `app/globals.css`. API: `app/api/shop/route.ts`. Money and validation: `lib/core.mjs`.

The checked-in `.openai/hosting.json` identifies the hosted Site. Build output and local database state are ignored. Publish through the Sites version/deployment workflow, preserving that identity and private access policy. Source is also mirrored into this GitHub repository.
