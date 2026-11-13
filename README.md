# School Reports

A multi-school report-card platform for Cameroon secondary schools, with English and French report templates, phone-friendly teacher entry, spreadsheet import, offline drafts and administrator approval.

## Start here

The downloadable `school-reports-source.zip` is a **standard Next.js project**. Requires Node.js 22.13+ (Node.js 24 recommended).

1. Extract the ZIP and open a terminal in the project directory.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` (Windows PowerShell: `Copy-Item .env.example .env.local`).
4. Create a Supabase project. In its SQL Editor, run **all of** `supabase/migrations/001_school_reports.sql` once on a fresh project. For an existing production project, review and apply via migrations instead.
5. In Supabase Connect (or Project Settings → API Keys), copy the project URL and publishable key into `.env.local`. Obtain a server-only secret key for teacher account creation. Never put the secret key in a public variable. Legacy anon/service-role keys remain supported by this build as fallbacks.
6. In Supabase Authentication → URL Configuration, set Site URL to `http://localhost:3000` and allow `http://localhost:3000` as a redirect URL. Add your production origin when deploying. For production email, configure SMTP and test confirmation/reset delivery.
7. Run `npm run dev`, then open `http://localhost:3000`.
8. Create an administrator account, confirm the email if required, and create the school workspace.
9. Academic setup → school profile/logo → add classes. Teachers → add teacher accounts. Academic setup → add subjects, coefficients and assignments. Students → add or import students.
10. Teachers sign in with school-created credentials and use Account → Change password. Select a sequence, enter/import marks, save, then submit.
11. Administrator reviews Results, adds attendance and remarks, approves, then opens Report cards to download/print individual or class PDFs.

**Environment values**

| Variable | Source | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL | Browser-safe |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable API key | Browser-safe; protected by RLS |
| `SUPABASE_SECRET_KEY` | Supabase secret API key | Server only; needed to create teachers |

Restart the development server after editing `.env.local`. For production, set these values in hosting configuration **before building** and rebuild after changing public values. `.env.example` contains placeholders only. No live Supabase account or credentials are bundled.

Without the URL/key, the application opens a labelled local demo with sample records. You can switch administrator/teacher views. Demo storage stays on the browser device and is separate from real accounts. Demo sample marks are mostly submitted; reopen a subject as administrator before editing as teacher. To inspect a complete report immediately, review Form 1B and approve Term 1.

## Commands (downloadable Next.js package)

```sh
npm run dev
npm run typecheck
npm test
npm run build
npm start
```

The canonical hosted-preview repository additionally uses the supplied Sites/Vinext integration: `pnpm dev`, `pnpm build`. It retains Next.js-compatible App Router source. The download removes hosting-specific build helpers and defaults to standard Next.js. Both packages use the same app, SQL and calculation code.

## Included behaviour

- Isolated school workspaces, administrator self-registration and multiple school memberships.
- Configurable levels/classes/sections, subjects, positive coefficients and teacher assignments.
- Student creation, editing, deletion and spreadsheet import with preview/validation.
- Administrator-created teacher accounts using a protected server route. Existing duplicate email accounts must be linked by the operator in Supabase; the app does not reset another school's account.
- Teacher-only assigned subjects; drafts, absence/exemption statuses, Excel template/import and submitted locks.
- Three terms, six sequences. Sequence 1+2 → Term 1, 3+4 → Term 2, 5+6 → Term 3.
- Weighted subject/sequence/term averages, subject positions, class positions and equally weighted annual average/annual position.
- Editable attendance, conduct, teacher/principal remarks and third-term promotion decision.
- Transactional administrator approval freezes result rows, remarks and school identity/logo. Subsequent changes require reopening. Correcting a previous term invalidates its dependent annual report.
- A4 English/French HTML print previews and real individual/class PDF downloads. PDFs use a matching compact layout, with pagination for long subject lists and remarks.
- Academic year archives. Change the school profile's active year to start configuring a new year's classes; earlier approved reports remain retrievable.
- Installable PWA shell and account/school-scoped offline storage. App icon support varies by device; home-screen installation depends on browser capabilities.

## Calculation and attendance policies

Subject term average = (sequence A + sequence B) / 2.
Weighted points = subject term average × coefficient.
Overall average = total weighted points / total assessed coefficients.
Annual average = (approved Term 1 average + approved Term 2 average + Term 3 average) / 3.

Calculations retain precision; display rounds to two decimals. Equal exact averages share competition positions: 1, 2, 2, 4. Pass threshold is 10/20. Failed subject averages appear red.

A missing mark is not zero and blocks submission/approval. **Absence counts as zero** in this build. An exemption excludes the subject and its coefficient and must cover both sequences. These are explicit implementation policies; confirm the absence/exemption policy with each school before real use. Automatic remark ranges default to 16+, 14+, 12+, 10+, below 10. Each school administrator can edit the thresholds and English/French labels in Academic setup → Edit automatic remark ranges. Approved reports preserve their original settings.

## Offline use

First sign in online and open/download the school and relevant assignment. The service worker caches the shell/assets as they are visited; Dexie/IndexedDB stores the school snapshot and draft. Offline entry and saving are supported; final submission and approval need a connection. Unsaved edits auto-save to local draft storage while typing. Use Save draft to queue changes for sync.

When connectivity returns **while the app is open**, pending operations are synchronised. Each operation has an idempotency UUID; replay after a lost response does not duplicate it. Per-mark revision checks prevent overwriting another device's changes. The offline queue and drafts are isolated by signed-in user and school.

A conflict keeps the pending operation and local values. Open the assignment → Review local vs server, compare them, then explicitly choose a new local draft or the server values. Submitted/approved results cannot be overwritten by an old offline draft. Browser storage can be evicted or cleared, so it is not a backup. Offline first-time login and guaranteed closed-app background sync are not supported.

## Security and deployment

All tables have Row Level Security. Browser roles have read-only table grants; writes go through scoped RPC transactions. `apply_operation` validates school membership, assignments, roster membership, sequence range, mark range, revisions and approval locks, and records an audit entry. Approval calculates on PostgreSQL rather than trusting browser totals. Teacher provisioning verifies the caller's live Supabase identity and administrator membership before using the server key.

Production deployment: use a Node.js host supporting Next.js server routes, configure environment variables, run migration, `npm run build`, then `npm start` (or your host's managed Next.js deployment). HTTPS is required for PWA/service-worker operation outside localhost. Configure Supabase Auth URLs, password policy, SMTP, database backups and your host's environment secrets. The private preview has an additional hosting access gate and is **not** the public teacher login URL for your future production school deployment.

No separate Chromium/PDF worker, email automation or printer driver is required by this build. PDFs are produced in the browser using pdf-lib. Printing opens the browser/OS dialog; silent printer commands are not implemented. Large school-wide PDF generation across several classes and scheduled background PDF jobs are future extensions; class batches are included.

## Verification and limits

Tests cover calculations, missing/absent/exempt marks, competition ranking, spreadsheet validation, account/school-scoped offline queues, valid bilingual A4 PDF batches, and the SQL migration executed against an embedded PostgreSQL engine (PGlite) with mocked Supabase Auth/Storage schemas. SQL tests exercise RLS, cross-school access denial, teacher assignment denial, stale revisions, idempotent retries, submission locking, approval, yearly calculations and annual invalidation.

The application builds without credentials. Actual Supabase Auth email delivery, live project provisioning, Storage integration and cross-device browser/offline behaviour still need testing against your configured project. No live Supabase credentials were available during development. Browser visual QA was unavailable in the build environment.

This is a runnable first version, not a claim of production validation with real school data. Current additional limits: no central super-administrator billing/school suspension dashboard; no automatic student promotion/rollover; no deadline editor; no subject groups; no deletion of school workspaces; partially translated platform controls (report templates are English/French); no revocation of PDFs already downloaded. Some advanced administration settings described during planning are therefore follow-up work.

## Files

- `app/`, `components/`: pages, UI and print layout.
- `lib/model.ts`: types and browser preview calculation rules.
- `lib/offline.ts`: IndexedDB storage and queue.
- `lib/excel.ts`: Excel templates and validation.
- `lib/pdf.ts`: PDF export.
- `app/api/provision-teacher/route.ts`: server-only teacher creation.
- `supabase/migrations/001_school_reports.sql`: schema, RLS and transactional business logic.
- `tests/`: automated checks.
- `.env.example`: connection template.
