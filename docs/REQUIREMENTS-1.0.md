# Managementik — Requirements Document

*[النسخة العربية](REQUIREMENTS-1.0.ar.md)*

**Version:** 1.0
**Status:** Approved specification for a ground-up **reimplementation** of Managementik. The current codebase (this repository, as of 2026-08-10) is a prototype that will be **replaced, not incrementally patched**. No prior product spec existed, so this document was produced by reverse-engineering the prototype's proven scope and behavior, then restating it as requirements for the new build — while explicitly calling out prototype design mistakes (§8) that the reimplementation must not repeat.

## 1. Purpose & Background

Managementik is a trilingual (French / Arabic / English, with RTL layout for Arabic) web portal that connects **Algerian accounting firms ("cabinets comptables")** with their **business clients**. It serves two purposes at once:

1. A **client-accountant collaboration portal**: document exchange, e-signature of declarations, messaging, and deadline tracking.
2. An **Algerian tax & accounting back-office suite** for the accountant: monthly VAT/tax declarations (G50), corporate tax (IBS), personal income tax (IRG), professional activity tax (TAP/TFP), social contributions (CNAS/CASNOS/CACOBATPH), payroll, fixed-asset amortization, general ledger, and financial statements.

The existing prototype already implements most of this scope end-to-end against a real backend, and proves the product concept — but it will be **rebuilt from scratch**, not extended. Several prototype subsystems were client-side/browser-storage-only rather than properly persisted (see §8), and the reimplementation must design those correctly from the outset rather than retrofitting them. This document specifies requirements for the new implementation; the old codebase should be treated as reference material for validated scope and behavior, not as a codebase to branch from.

## 2. Goals

- Give small/mid-size Algerian businesses a single place to send accounting documents to their accountant and track their tax obligations.
- Give accounting firms a system of record for client data, declarations, and communication that replaces ad hoc email/WhatsApp/paper workflows.
- Automate as much of the statutory Algerian tax calculation and calendar logic as possible (G50, IBS, IRG, TAP, TFP, CNAS/CASNOS deadlines) to reduce manual errors.
- Provide an auditable, signed record of client approval for filed declarations (e-signature).

## 3. User Roles

The system has exactly two roles, set permanently at account creation:

| Role | How created | Description |
|---|---|---|
| **Accountant** | Self-signup, no invite required | Manages one or more linked clients; owns the back-office suite. |
| **Client** | Signup via an accountant-issued invite link only — no self-signup path | A single business linked to exactly one accountant; uses the client portal to upload documents, review/approve declarations, and message their accountant. |

**Requirements:**
- REQ-3.1: A client account must always be created via a valid, unexpired, single-use invite token issued by an accountant.
- REQ-3.2: A client is linked to exactly one accountant. Multi-accountant-per-client and accountant "team seats" are out of scope for the current phase.
- REQ-3.3: There is no admin/superuser role in this phase. Any support/back-office administration is performed directly against the database.
- REQ-3.4: Role must be authoritative and enforced server-side for every data access, independent of any client-side role check used for UI routing.

## 4. Functional Requirements

### 4.1 Public Site & Onboarding
- REQ-4.1.1: Provide a public marketing landing page describing the product, with real (not placeholder) feature/pricing content before launch. *(See §8 item 9.)*
- REQ-4.1.2: Provide email/password login shared by both roles.
- REQ-4.1.3: Provide accountant self-signup collecting name, company, and credentials.
- REQ-4.1.4: Provide password reset / account recovery. *(See §8 item 6.)*
- REQ-4.1.5: Provide email verification before granting full access, explicitly enforced by the application rather than left to the authentication provider's default behavior.

### 4.2 Client Invitations
- REQ-4.2.1: An accountant can generate a tokenized invite link for a prospective client, optionally bound to a specific email address and pre-filled with known business details (name, commune, direction, BP).
- REQ-4.2.2: Invite links expire after 30 days and are single-use; the accountant can view status (active/used/expired) and delete unused invites.
- REQ-4.2.3: Following an invite link pre-validates token expiry/usage before allowing the client to complete signup.

### 4.3 Client Management (Accountant)
- REQ-4.3.1: The accountant can view, add, edit, search, and delete linked clients, capturing: company name, legal form, activity, tax regime (Réel / Simplifié / IFU), NIF, NIS, RC, CNAS number, CASNOS number, CACOBATPH flag, address, commune, direction, BP, phone, and email.
- REQ-4.3.2: Editing a client's profile requires re-authentication (password re-entry) before the edit form is accessible. This must be enforced server-side, not only via a client-side dialog gate.
- REQ-4.3.3: The accountant can view a per-client summary of outstanding obligations, uploaded documents, invoices, and a shortcut to message that client.

### 4.4 Document Exchange
- REQ-4.4.1: A client can upload documents (PDF or image, ≤5MB) to a personal, access-controlled store; the accountant sees all documents uploaded by their linked clients in a unified, real-time "incoming documents" feed.
- REQ-4.4.2: The accountant can share generated/received documents back to a client (declarations, legal documents, filed forms) with signed, time-limited download URLs.
- REQ-4.4.3: There must be exactly one canonical mechanism for "documents shared with a client," covering both general shared documents and G50 declaration PDFs. *(See §8 item 3.)*
- REQ-4.4.4: All documents must be stored server-side and accessible from any device the user logs into — no reliance on the browser's local storage for document availability.
- REQ-4.4.5: Provide a "Vault" archive view, grouped by month, of all documents exchanged with a client, persisted server-side.

### 4.5 Tax & Social Declarations
- REQ-4.5.1: Generate the monthly **G50** tax return from an editable form, export to PDF and XLSX, and track its workflow status (draft → review → sent → signed → filed).
- REQ-4.5.2: PDF generation must not have a single point of failure on a paid third-party conversion service with no fallback. *(See §8 item 7.)*
- REQ-4.5.3: Support social declarations: CNAS, CASNOS, CACOBATPH.
- REQ-4.5.4: Provide a "Tax Intelligence" panel with calculators for IBS acompte, IRG (professions libérales), TAP/TFP, TRWI fixed fee, TVA settlement, and État 104.
- REQ-4.5.5: Provide a "Liasse Fiscale" — a consolidated annual fiscal package (bilan, TCR, trial balance, payroll DAS) per client.
- REQ-4.5.6: Send a declaration to the client for e-signature; the client can sign by drawn signature (canvas) or a one-click acknowledgment, and the signature is persisted with a timestamp against the declaration record.
- REQ-4.5.7: All statutory calculation logic (tax brackets, rates, thresholds) must be covered by automated unit tests, since these encode Algerian legal formulas that change periodically and are high-risk for silent regression.

### 4.6 Invoices & Billing
- REQ-4.6.1: The accountant can record client invoices (add/list/delete) with a status (pending/processed/review).
- REQ-4.6.2: The accountant can record firm-side sales/purchase bills feeding the general ledger. This must be a distinct, clearly-named feature from "client invoices" — the prototype's naming ("Invoices" vs. "Billing" for overlapping concepts) was a source of confusion and the reimplementation's information architecture must avoid repeating it.

### 4.7 Payroll
- REQ-4.7.1: Maintain an employee roster per client.
- REQ-4.7.2: Compute payslips including IRG bracket withholding.
- REQ-4.7.3: Generate payroll mass reports, CNAS avis, movement reports, and the annual DAS declaration, exportable as CSV/print.
- REQ-4.7.4: Payroll data must be persisted server-side per client, not client-side only.

### 4.8 Fixed Assets
- REQ-4.8.1: Maintain a fixed-asset register per client with category-based depreciation rates.
- REQ-4.8.2: Compute amortization schedules and yearly dotation automatically.
- REQ-4.8.3: Fixed-asset data must be persisted server-side per client.

### 4.9 General Ledger & Financial Statements
- REQ-4.9.1: Maintain a double-entry journal per client, combining manual entries and auto-posted entries from sales/purchases/payroll.
- REQ-4.9.2: Produce a trial balance, balance sheet (Bilan), and income statement (TCR) from the journal.
- REQ-4.9.3: Lock a fiscal period once its related declaration has been filed, preventing further edits to posted entries in that period.
- REQ-4.9.4: The journal, trial balance, and period locks must be persisted server-side, not client-side only.

### 4.10 Fiscal Calendar
- REQ-4.10.1: Generate a deadline calendar per client, aware of their tax regime, employee count, and CACOBATPH status.
- REQ-4.10.2: Visually flag deadlines by urgency (on-track / due soon / overdue).
- REQ-4.10.3: The client sees the same calendar scoped to their own obligations.

### 4.11 Client Dashboard
- REQ-4.11.1: Upload Center for submitting documents to the accountant.
- REQ-4.11.2: Monthly document checklist (sales/purchases/bank/payroll/expenses) with status tracking, persisted server-side.
- REQ-4.11.3: View upcoming fiscal deadlines.
- REQ-4.11.4: Review and e-sign declarations sent by the accountant.
- REQ-4.11.5: View own obligations, totals due, and invoices — computed from server data scoped to the signed-in client, not from any locally cached copy of the accountant's data. *(Critical — see §8 item 2.)*

### 4.12 Messaging & Notifications
- REQ-4.12.1: Real-time 1:1 chat between an accountant and each linked client.
- REQ-4.12.2: Unread message indicators.
- REQ-4.12.3: In-app notifications (new document, new message, declaration ready to sign, upcoming deadline) must be persisted server-side and delivered consistently regardless of which device/browser the user is on. *(See §8 item 1.)*
- REQ-4.12.4: Reminders to clients who have not uploaded required documents by a monthly cutoff must run on a durable server-side schedule, not only while an accountant's browser tab happens to be open. *(See §8 item 10.)*

### 4.13 Localization
- REQ-4.13.1: Full UI support for French, Arabic (with RTL layout), and English, with the user's language preference persisted.
- REQ-4.13.2: All new features must ship with translations in all three supported languages, not English-only.

## 5. Data Model Requirements

REQ-5.1: The system must persist, server-side, with row-level access control scoped to the owning accountant and/or linked client:

- **Identity**: user profiles (role, business/legal fields), role assignments, accountant↔client links.
- **Invitations**: token, issuing accountant, target email (optional), expiry, usage state, pre-fill fields.
- **Documents**: generic uploaded files (owner, path, mime type, size, metadata) and accountant-shared documents (single canonical table, including signature/workflow state), each in an access-controlled storage bucket.
- **Messages**: sender, receiver, content, read state, timestamps.
- **Declarations**: G50 and social declarations, their form data, sent/signed/filed status and timestamps, linked to the client and accountant.
- **Invoices & billing**: client invoices; firm sales/purchase bills.
- **Payroll**: employees, payslips, payroll runs, DAS records.
- **Fixed assets**: asset register, depreciation schedules.
- **General ledger**: journal entries, period locks, financial statement snapshots.
- **Notifications**: per-user notification records with read state.

REQ-5.2: Every entity listed above must live in the database with row-level access control from the first implementation pass — not in the browser's local storage, as several were in the prototype (see §8 item 1) — so that data survives device changes and browser storage clearing, and so the client and accountant always see a consistent, authoritative view of the same data.

## 6. Non-Functional Requirements

- REQ-6.1 **Security**: Every table must enforce row-level access control scoped to the authenticated user's role and accountant↔client relationship; role-checking logic must be designed to avoid recursive-policy bugs from the outset — the prototype's history shows this was discovered and patched reactively multiple times, and the reimplementation should get it right the first time.
- REQ-6.2 **Data residency & currency**: Amounts in DZD; tax logic specific to Algerian regimes must be kept current with statutory changes.
- REQ-6.3 **Availability**: Core compliance features (declaration generation, PDF export) must not have an unmitigated single point of failure on a paid third-party service.
- REQ-6.4 **Auditability**: Signed declarations must retain an immutable record of who signed, when, and what was signed.
- REQ-6.5 **Testability**: Statutory calculation logic (tax/payroll engines) must have automated unit test coverage before being relied upon in production.
- REQ-6.6 **Cross-device consistency**: A user's data and notifications must be identical regardless of which device or browser they log in from.
- REQ-6.7 **Accessibility of urgent state**: Deadline and obligation status must be visually distinguishable by urgency at a glance.

## 7. Out of Scope (current phase)

- Multiple accountants per client, or client sharing across firms.
- Team seats / multiple accountant users per firm.
- In-app role changes or promotion between accountant/client.
- Payment processing / subscription billing for Managementik itself.
- OAuth/social login (email/password only).
- Admin/back-office role and tooling.

## 8. Lessons from the Prototype — Mandatory Design Constraints for the Reimplementation

The codebase is being rebuilt from scratch, so nothing here is a "bug to patch" — these are architectural mistakes observed in the prototype that the new implementation must avoid repeating from its first version, not retrofit later:

1. **Do not use browser-local storage as the system of record for anything.** The prototype kept payroll/employees, billing/journal, general ledger, period locks, fixed assets, notifications, client checklist, vault, and the reminder log entirely client-side. Every one of these must be a proper database table from day one (§4.6–4.9, §4.11.5, §4.12.3, §5).
2. **Never derive one user's data from another user's local browser state.** The prototype's client dashboard computed "my obligations"/"my invoices" by reading the accountant's raw browser-local data, which only worked when both users happened to share a browser. The reimplementation must serve all cross-role data through properly access-scoped database queries (REQ-4.11.5).
3. **Design a single "documents shared with a client" mechanism up front**, not two overlapping ones as in the prototype, where general shared documents and G50 PDFs were tracked separately with duplicated logic (REQ-4.4.3).
4. **Design one client-file-listing UI component**, not duplicates built during separate iterations, as happened in the prototype where two separate components did overlapping work.
5. **Decide the role-trust model deliberately, before writing route-guarding logic.** The prototype trusted a role value carried in the client's auth token with no corroborating server round-trip; if the reimplementation repeats this pattern, the guarantees around who can alter that value must be explicitly verified and documented as part of the design, not assumed.
6. **Ship password reset, enforced email verification, and an account settings page as part of the initial auth build** — none existed in the prototype and retrofitting auth flows is costlier than building them in from the start.
7. **Do not make core compliance features (e.g. G50 PDF export) depend on a single paid third-party service with no fallback.** The prototype depended solely on one external conversion service; the reimplementation should pick a self-hosted or multi-provider approach from the outset (REQ-4.5.2, REQ-6.3).
8. **Write unit tests for statutory calculation logic as it is built**, not after. The prototype's tax/payroll engine (IRG brackets, IBS rates, TAP/TFP/CACOBATPH thresholds) had effectively no test coverage despite encoding legal formulas that change periodically (REQ-6.5).
9. **Build the landing page with real content from the start** — the prototype shipped hardcoded placeholder stats ("10k+ businesses," "99.9% uptime") and no real pricing tiers (REQ-4.1.1).
10. **Implement reminders/scheduled sweeps as durable server-side jobs, not client-side timers** that only run while a specific browser tab is open (REQ-4.12.4).
11. **Pick one package manager and commit only its lockfile.** The prototype had lockfiles for multiple different package managers committed simultaneously — the reimplementation should settle this in its initial tooling setup.

## 9. Glossary (Algerian Tax & Accounting Terms)

| Term | Meaning |
|---|---|
| G50 | Monthly tax return (VAT + withholdings) filed with the Algerian tax authority |
| IBS | Impôt sur les Bénéfices des Sociétés — corporate income tax |
| IRG | Impôt sur le Revenu Global — personal/professional income tax |
| TAP | Taxe sur l'Activité Professionnelle — professional activity tax |
| TFP | Taxe de Formation Professionnelle — professional training tax |
| CNAS | Caisse Nationale des Assurances Sociales — employee social security fund |
| CASNOS | Caisse Nationale de Sécurité Sociale des Non-Salariés — self-employed social security fund |
| CACOBATPH | Caisse spécifique au secteur du BTPH (construction sector social fund) |
| DAS | Déclaration Annuelle des Salaires — annual payroll declaration |
| Liasse Fiscale | Annual fiscal package (financial statements + declarations) filed with tax authorities |
| NIF / NIS / RC | Business tax ID / statistical ID / trade register number |
| Régime Réel / Simplifié / IFU | Tax regime categories for Algerian businesses (actual, simplified, flat-rate) |
