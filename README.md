# ClearRoute UK

Navigate UK Documentation With Confidence.

ClearRoute UK is a professional UK documentation consultancy that helps international clients navigate UK government paperwork. The platform provides end-to-end support for driving licence conversion, NI number applications, BRP/eVisa guidance, theory and practical test booking, address proof setup, and UK bank account setup — all through official UK government channels (DVLA, DVSA, HMRC, Home Office).

**Website:** [https://www.clearrouteuk.co.uk](https://www.clearrouteuk.co.uk)

---

## Features

- **Multi-step application forms** — service-specific dynamic forms with document upload and progress indicator
- **User dashboard** — overview, application tracking, profile management
- **Application progress tracking** — visual progress bar with status updates
- **AI chatbot (RouteBot)** — Groq-powered (Llama 3.3 70B) with session persistence, human handoff, and real-time messaging
- **Live chat admin panel** — real-time chat inbox with typing indicators, session management, unread badges, and audio notifications
- **Admin panel** — full dashboard with applications CRUD, enquiries management, user management, email inbox, audit log, and settings
- **Email notifications** — application receipts and payment invoices via SMTP
- **SEO** — schema.org structured data, Open Graph, Twitter Cards, sitemap.xml, robots.txt
- **Responsive design** — mobile-first layouts with scroll reveal animations
- **Security** — Row Level Security (RLS) on all database tables, admin-only audit log, XSS prevention, signed URL storage access

## Services

| Service | Description |
|---|---|
| Driving Licence Conversion | Convert foreign licence to UK licence (Theory, Practical, or Full packages) |
| NI Number Application | Apply for a National Insurance number |
| BRP / eVisa Guidance | Help with Biometric Residence Permit and eVisa |
| Theory Test Booking | Book and prepare for the UK theory test |
| Practical Test Booking | Book and prepare for the UK practical driving test |
| Address Proof Setup | Set up UK address proof documentation |
| UK Bank Account Setup | Open a UK bank account |
| PCO Licence Application | Full PCO licence application (Theory, Practical, Full, or Complete packages) |

## Tech Stack

**Frontend:** HTML5, CSS3, Vanilla JavaScript, Google Fonts (Inter + Lato), Font Awesome 6

**Backend:** Supabase (PostgreSQL, Auth, Storage, Realtime, Edge Functions)

**AI:** Groq API (Llama 3.3 70B) for chatbot

**Email:** EmailJS (client-side) + SMTP via Namecheap Private Email (server-side)

**Hosting:** Cloudflare Pages (auto-deploys from GitHub main)

## Project Structure

```
clearroute-uk/
├── index.html                  # Home page
├── services.html               # Services listing
├── how-it-works.html           # 4-step process
├── dashboard.html              # User dashboard
├── application-form.html       # Multi-step application form
├── application-progress.html   # Progress tracking
├── admin/                      # Admin panel (SPA)
│   ├── index.html
│   ├── css/admin.css
│   └── js/admin.js
├── assets/
│   ├── css/                    # Global and page-specific styles
│   ├── js/                     # Application logic
│   │   ├── main.js             # Core: navbar, scroll, animations
│   │   ├── supabase-config.js  # Supabase client config
│   │   ├── auth.js             # Authentication
│   │   ├── dashboard.js        # User dashboard
│   │   ├── application-form.js # Multi-step form logic
│   │   ├── contact.js          # Contact form
│   │   ├── email-service.js    # EmailJS integration
│   │   └── chatbot.js          # AI chatbot widget
│   └── images/
├── services/                   # 8 service detail pages
├── blog/                       # Blog section (5 articles)
├── supabase/
│   ├── config.toml             # Supabase CLI config
│   └── functions/
│       ├── chatbot/index.ts    # Groq AI proxy edge function
│       └── send-application-emails/index.ts  # SMTP email function
└── supabase-schema.sql         # Full database schema with RLS policies
```

## Setup

### Prerequisites

- A Supabase project
- Cloudflare Pages account (or any static hosting)
- Namecheap Private Email (or any SMTP provider)
- Groq API key

### Environment Variables (Supabase Edge Functions)

```
SUPABASE_URL=https://[project].supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
SMTP_HOST=mail.privateemail.com
SMTP_PORT=465
SMTP_USERNAME=info@clearrouteuk.co.uk
SMTP_PASSWORD=<password>
SMTP_FROM=ClearRoute UK <info@clearrouteuk.co.uk>
GROQ_API_KEY=<groq_api_key>
```

### Steps

1. Create a Supabase project and update credentials in `assets/js/supabase-config.js`
2. Run `supabase-schema.sql` in the Supabase SQL Editor
3. Create a storage bucket named `application-documents`
4. Deploy edge functions:
   ```
   supabase functions deploy chatbot
   supabase functions deploy send-application-emails
   ```
5. Set environment secrets:
   ```
   supabase secrets set SUPABASE_URL=<url>
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key>
   supabase secrets set SMTP_HOST=mail.privateemail.com
   supabase secrets set SMTP_PORT=465
   supabase secrets set SMTP_USERNAME=info@clearrouteuk.co.uk
   supabase secrets set SMTP_PASSWORD=<password>
   supabase secrets set SMTP_FROM="ClearRoute UK <info@clearrouteuk.co.uk>"
   supabase secrets set GROQ_API_KEY=<key>
   ```
6. Configure EmailJS templates (service `service_1ni6j9l`, templates `template_f8ef8le` and `template_j8x9fvq`)
7. Deploy the static site to Cloudflare Pages (or any static host)

Detailed guides for each step are available in `SETUP_GUIDE.md`, `CHATBOT_SETUP.md`, and `ADMIN_IMPLEMENTATION.md`.

## License

All rights reserved.
