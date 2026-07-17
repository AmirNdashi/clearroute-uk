# ClearRoute UK — Project Reference

## Domain
- **Live site:** `https://clearrouteuk.co.uk`
- **Hosting:** Cloudflare Pages (auto-deploys from GitHub `main` branch)
- **Repo:** `https://github.com/AmirNdashi/clearroute-uk`

---

## Supabase

| Item | Value |
|------|-------|
| **Project URL** | `https://lxbsdgvzdqptdatluxlg.supabase.co` |
| **Project Ref** | `lxbsdgvzdqptdatluxlg` |
| **Anon Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4YnNkZ3Z6ZHFwdGRhdGx1eGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMjg0MDgsImV4cCI6MjA5ODYwNDQwOH0.7o3ZraBo-zcjgBro2K5bICoYm8YyoNvB3A0lajpeF1A` |
| **Service Role Key** | Set via `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<value>` (stored locally) |
| **Dashboard** | `https://supabase.com/dashboard/project/lxbsdgvzdqptdatluxlg` |
| **CLI login** | `supabase login` then `supabase link --project-ref lxbsdgvzdqptdatluxlg` |

### Edge Functions
| Function | File | Deployed |
|----------|------|----------|
| `send-application-emails` | `supabase/functions/send-application-emails/index.ts` | `supabase functions deploy send-application-emails` |

### Edge Function Secrets
Set via `supabase secrets set KEY=value`:
```
SUPABASE_URL=https://lxbsdgvzdqptdatluxlg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SMTP_HOST=mail.privateemail.com
SMTP_PORT=465
SMTP_USERNAME=info@clearrouteuk.co.uk
SMTP_PASSWORD=<password>
SMTP_FROM=ClearRoute UK <info@clearrouteuk.co.uk>
```

### Storage Buckets
| Bucket | Purpose |
|--------|---------|
| `application-documents` | Uploaded passport, licence, BRP, address proof files |

### SQL Schema
- `supabase-schema.sql` — full schema including all tables, RLS policies, triggers, and functions
- Apply via: `supabase db query --linked --file supabase-schema.sql` (or Supabase SQL Editor)

---

## EmailJS

| Item | Value |
|------|-------|
| **Public Key** | `QR-TTFj2f6_BZOxKX` |
| **Service ID** | `service_1ni6j9l` |
| **Admin Compose Template ID** | `template_f8ef8le` |
| **Application Receipt Template ID** | `template_j8x9fvq` |
| **Contact Form Template ID** (legacy/fallback) | `template_e5652u2` (may need recreating) |
| **Dashboard** | `https://dashboard.emailjs.com` |

### Template Variables

**Admin Compose** (`template_f8ef8le`): `to_email`, `to_name`, `from_name`, `subject`, `message`, `reply_to`

**Application Receipt** (`template_j8x9fvq`): `to_email`, `to_name`, `from_name`, `subject`, `service_name`, `application_id`, `submission_date`, `message`, `reply_to`

---

## Business Contact Info

| Detail | Value |
|--------|-------|
| **Business Email** | `info@clearrouteuk.co.uk` |
| **WhatsApp** | `+447983312575` (`https://wa.me/447983312575`) |
| **Admin Account** | `info@clearrouteuk.co.uk` (only email with admin panel access) |
| **Namecheap Private Email** | Not yet activated — mailbox must be created at `https://ap.www.namecheap.com/privateemail` before SMTP works |

---

## SMTP (Edge Function)

| Item | Value |
|------|-------|
| **Host** | `mail.privateemail.com` |
| **Port** | `465` (TLS) |
| **Username** | `info@clearrouteuk.co.uk` |
| **Password** | Set via `supabase secrets set SMTP_PASSWORD=<value>` |
| **Status** | Falls back to logging if SMTP unavailable |

---

## Services (Application Types)

| Key | Display Name |
|-----|-------------|
| `driving-licence` | Driving Licence Conversion |
| `ni-number` | NI Number Application |
| `brp-evisa` | BRP / eVisa Guidance |
| `theory-test` | Theory Test Booking |
| `practical-test` | Practical Test Booking |
| `address-proof` | Address Proof Setup |
| `bank-account` | UK Bank Account Setup |
| `pco-licence` | PCO Licence Application |

---

## Key Files

| File | Purpose |
|------|---------|
| `assets/js/supabase-config.js` | Supabase URL, anon key, admin email |
| `assets/js/email-service.js` | EmailJS config + send helpers (Admin Compose, Application Receipt) |
| `assets/js/contact.js` | Contact form EmailJS setup (duplicated config) |
| `assets/js/auth.js` | Auth logic, profile creation after signup |
| `assets/js/application-form.js` | Multi-step application form, submission + receipt email |
| `admin/js/admin.js` | Admin panel — CRUD, email compose modal, audit logging |
| `assets/js/chatbot.js` | AI chatbot with Groq API, human handoff, admin reply |
| `supabase-schema.sql` | Full database schema + RLS policies |
| `supabase/functions/send-application-emails/index.ts` | SMTP Edge Function |
| `assets/css/styles.min.css` | Combined/minified CSS (source for all styles) |

---

## Git Workflow

```bash
git add -A && git commit -m "message"
git push                          # auto-deploys to Cloudflare Pages
supabase functions deploy send-application-emails   # deploy edge function
supabase db query --linked --file supabase-schema.sql  # apply DB changes
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (linked to auth.users via trigger) |
| `applications` | Service applications with pricing, status, tracking |
| `application_documents` | Uploaded file metadata per application |
| `application_notes` | Admin notes per application |
| `enquiries` | Contact form submissions |
| `chat_sessions` | Chatbot visitor sessions |
| `chat_messages` | Individual chat messages |
| `admin_replies` | Admin replies in chat handoff |
| `admin_queue` | Chat handoff queue |
| `audit_log` | Admin action audit trail |

---

## RLS Policies

All tables have: SELECT (own), INSERT (own), and now DELETE (admin-only) policies. Storage bucket `application-documents` has admin DELETE. See `supabase-schema.sql` for full policy list.
