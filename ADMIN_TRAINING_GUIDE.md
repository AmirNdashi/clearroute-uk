# ClearRoute UK — Complete Admin Training Guide

> **Version:** 1.0
> **Last Updated:** July 2026
> **Website:** https://www.clearrouteuk.co.uk
> **Purpose:** This document is your single source of truth for managing the ClearRoute UK website and admin panel. Read it cover-to-cover, then keep it as a reference.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [How the Website Works — Architecture](#2-how-the-website-works--architecture)
3. [Your Admin Account & Access](#3-your-admin-account--access)
4. [Admin Panel — Complete Walkthrough](#4-admin-panel--complete-walkthrough)
5. [Managing Applications](#5-managing-applications)
6. [Managing Enquiries (Contact Form)](#6-managing-enquiries-contact-form)
7. [Managing Emails (Email Inbox)](#7-managing-emails-email-inbox)
8. [Managing Users](#8-managing-users)
9. [Live Chat Management](#9-live-chat-management)
10. [Settings & Configuration](#10-settings--configuration)
11. [How Data Flows Through the System](#11-how-data-flows-through-the-system)
12. [Guided Simulations — Real Working Scenarios](#12-guided-simulations--real-working-scenarios)
13. [Things to Do (Best Practices)](#13-things-to-do-best-practices)
14. [Things NOT to Do (Critical Warnings)](#14-things-not-to-do-critical-warnings)
15. [Troubleshooting Common Issues](#15-troubleshooting-common-issues)
16. [Quick Reference Cheat Sheet](#16-quick-reference-cheat-sheet)

---

## 1. Project Overview

### What Is ClearRoute UK?

ClearRoute UK is a professional documentation consultancy website. It helps international clients navigate UK government paperwork. The business offers 8 core services:

| Service | What It Is | Typical Timeline |
|---------|-----------|-----------------|
| Driving Licence Conversion | Convert foreign licence to UK | ~6 weeks |
| NI Number Application | National Insurance number | ~3 weeks |
| BRP / eVisa Guidance | Biometric Residence Permit help | ~2 weeks |
| Theory Test Booking | UK theory test support | ~1.5 weeks |
| Practical Test Booking | UK practical test support | ~4 weeks |
| Address Proof Setup | Proof of address for immigrants | ~1.5 weeks |
| UK Bank Account Setup | Bank account opening guidance | ~1.5 weeks |
| PCO Licence Application | Private Hire Vehicle licence | ~8 weeks |

### Revenue Model

- Free initial consultations
- Paid services with tiered pricing (e.g., Driving Licence: £800–£1,500 depending on package)
- Payment is currently handled **offline** (bank transfer, Wise, PayPal, WhatsApp)
- The admin panel generates payment invoice text that you copy and send to clients

### Tech Stack (What Runs Under the Hood)

| Component | Technology | What It Does |
|-----------|-----------|--------------|
| Website | Pure HTML/CSS/JavaScript | Static pages — no coding framework |
| Backend | Supabase (PostgreSQL) | Database, authentication, file storage |
| Live Chat | Supabase Realtime | Instant message delivery |
| AI Chatbot | Groq Llama 3.3 70B | Automated customer support |
| Emails | EmailJS + SMTP | Send emails to clients |
| Hosting | Cloudflare Pages | Website is live on the internet |
| Domain | clearrouteuk.co.uk | The website address |

### Key Files You Should Know About

| File | What It Does |
|------|-------------|
| `admin/index.html` | The admin panel (this is your main workspace) |
| `admin/js/admin.js` | All admin logic (~2,370 lines) |
| `admin/css/admin.css` | Admin panel styling |
| `assets/js/supabase-config.js` | Supabase connection settings |
| `assets/js/email-service.js` | Email sending configuration |
| `assets/js/chatbot.js` | The AI chatbot on the website |
| `supabase-schema.sql` | Database structure (all tables and rules) |

> **You do not need to edit any code files.** This guide tells you everything you need to do through the admin panel and Supabase dashboard.

---

## 2. How the Website Works — Architecture

### The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                     VISITOR / CLIENT                             │
│                                                                 │
│  Opens website ──> Browses services ──> Submits enquiry ──>     │
│  Registers account ──> Logs in ──> Submits application ──>      │
│  Uploads documents ──> Uses live chat                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CLOUDFLARE PAGES (Hosting)                     │
│   Serves all HTML/CSS/JS files to visitors                       │
│   URL: https://www.clearrouteuk.co.uk                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SUPABASE (Backend)                           │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   Auth    │  │ Database │  │ Storage  │  │ Realtime │       │
│  │ (Login)  │  │(Postgres)│  │ (Files)  │  │ (Live)   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐            │
│  │ Edge Function:       │  │ Edge Function:        │            │
│  │ chatbot (Groq AI)   │  │ send-application-     │            │
│  │                     │  │ emails (SMTP)         │            │
│  └──────────────────────┘  └──────────────────────┘            │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ADMIN PANEL                                   │
│   URL: https://www.clearrouteuk.co.uk/admin/                    │
│   Login: info@clearrouteuk.co.uk                                │
│                                                                 │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│   │Dashboard │  │Live Chat │  │ Enquiries│  │  Apps    │      │
│   └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐                     │
│   │  Emails  │  │  Users   │  │ Settings │                     │
│   └──────────┘  └──────────┘  └──────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

### How Data Moves — The Complete Flow

**Scenario 1: A visitor submits a contact form enquiry**
1. Visitor fills in name, email, phone, nationality, service, message on `/contact.html`
2. JavaScript saves it to the Supabase `enquiries` table
3. You see it in **Admin Panel > Enquiries** with status "NEW"
4. You change the status to "CONTACTED" after responding
5. You can add internal notes visible only to admins

**Scenario 2: A client registers and submits a service application**
1. Client creates account at `/register.html` (email + password)
2. Profile is automatically created in the database
3. Client logs in, goes to `/application-form.html`
4. Fills in multi-step form (personal info → service details → documents → payment choice)
5. Uploads documents (passport, address proof, etc.) to Supabase Storage
6. Application is saved to the `applications` table with status "submitted"
7. An application receipt email is automatically sent to the client
8. You see it in **Admin Panel > Applications** with status "SUBMITTED"
9. You review documents, add notes, update status to "IN REVIEW" → "PROCESSING" → "APPROVED"/"REJECTED"
10. Client sees status updates in real-time on their dashboard and application progress page

**Scenario 3: A visitor uses the AI chatbot and requests a human**
1. Visitor clicks the chatbot icon on any page
2. AI (Llama 3.3) answers basic questions automatically
3. Visitor says "I want to speak to a human" or clicks "Talk to Agent"
4. Session is added to the `admin_queue` table
5. **You hear a notification sound** and see a toast notification in the admin panel
6. You go to **Live Chat Inbox**, see the waiting session
7. You click "Take Over" to start replying as a human
8. Messages flow in real-time via Supabase Realtime
9. You can go back to AI mode or close the session when done

**Scenario 4: A client sends an email from their dashboard**
1. Client logs in, goes to dashboard, uses "Send Email to Admin" section
2. Message is saved to `applicant_emails` table
3. You see it in **Admin Panel > Email Inbox** with status "UNREAD"
4. You read it, optionally reply via EmailJS, mark as "REPLIED"

---

## 3. Your Admin Account & Access

### Login Credentials

| Field | Value |
|-------|-------|
| **Admin URL** | https://www.clearrouteuk.co.uk/admin/ |
| **Email** | `info@clearrouteuk.co.uk` |
| **Password** | *(Set during account creation — only you know this)* |

### How Admin Access Works

- **Only one email** can access the admin panel: `info@clearrouteuk.co.uk`
- The system checks the email address at THREE levels:
  1. **JavaScript check:** The admin page verifies the email matches before even attempting login
  2. **Database check:** Your profile has `is_admin = TRUE` which grants extra permissions
  3. **Row Level Security:** Database rules enforce that only admins can view/edit all records

- If someone tries to log in with a different email at `/admin/`, they get "Access denied"
- If someone tries to log in with `info@clearrouteuk.co.uk` at `/login.html` (the normal user login), they get "This account uses the admin panel. Please sign in at /admin/"

### What to Do If You're Locked Out

1. Go to https://www.clearrouteuk.co.uk/admin/
2. If you forgot your password, you'll need to reset it via the Supabase dashboard:
   - Go to https://supabase.com/dashboard/project/lxbsdgvzdqptdatluxlg
   - Navigate to Authentication > Users
   - Find `info@clearrouteuk.co.uk`
   - Click "Send magic link" or reset the password directly
3. Contact the developer if you cannot access the Supabase dashboard

### Session Management

- Your login session persists across browser tabs
- If you close the browser and return, you'll usually still be logged in
- The session expires after a period of inactivity (Supabase default)
- If you see the login screen again, just log in with your credentials

---

## 4. Admin Panel — Complete Walkthrough

### Accessing the Admin Panel

1. Open your browser
2. Go to: **https://www.clearrouteuk.co.uk/admin/**
3. Enter your email: `info@clearrouteuk.co.uk`
4. Enter your password
5. Click **"Sign In to Dashboard"**

### The Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  ☰ (menu)    ClearRoute UK Admin             info@clearrouteuk.co.uk  [Logout] │
├──────────┬───────────────────────────────────────────────────────┤
│          │                                                       │
│ Dashboard│           MAIN CONTENT AREA                           │
│  💬 Chat │           (changes based on sidebar selection)         │
│  📧 Email│                                                       │
│  📋 Apps │                                                       │
│  ❓ Enqs │                                                       │
│  👥 Users│                                                       │
│  ⚙️ Set  │                                                       │
│          │                                                       │
├──────────┴───────────────────────────────────────────────────────┤
```

### Sidebar Navigation — What Each Section Does

| Menu Item | Icon | What It Shows |
|-----------|------|---------------|
| **Dashboard** | Chart | Stats overview + recent chat activity |
| **Live Chat Inbox** | 💬 | All human chat sessions (split pane: list + messages) |
| **Email Inbox** | ✉️ | Emails sent by clients from their dashboard |
| **Applications** | 📋 | All service applications submitted by clients |
| **Enquiries** | ❓ | Contact form submissions from the website |
| **Users** | 👥 | All registered user accounts (non-admin) |
| **Settings** | ⚙️ | Your profile, invoice template, system info |

### Mobile Navigation

On mobile devices:
- The sidebar collapses into a hamburger menu (☰) at the top-left
- Tap ☰ to open the sidebar as an overlay
- Tap outside the sidebar or tap ✕ to close it

---

## 5. Managing Applications

Applications are the core of the business. Clients submit applications for services, and you process them.

### Application Status Lifecycle

```
SUBMITTED ──> IN REVIEW ──> PROCESSING ──> APPROVED
                                   │
                                   └────> REJECTED (with reason)
                                           
Any status can also be set to "ADDITIONAL INFO" if you need more details from the client.
```

| Status | Meaning | When to Use |
|--------|---------|-------------|
| **SUBMITTED** | Just received | Automatic when client submits |
| **IN REVIEW** | You're looking at it | You've acknowledged and are checking documents |
| **ADDITIONAL INFO** | Need more from client | Documents missing or info incomplete |
| **PROCESSING** | Actively working on it | All docs received, work has started |
| **APPROVED** | Done/Completed | Service delivered successfully |
| **REJECTED** | Declined | Cannot help (must provide rejection reason) |

### How to View Applications

1. Click **"Applications"** in the sidebar
2. You see a list of all applications, newest first
3. Each entry shows: name, email, service type, status badge, date
4. **Search:** Type in the search box to find by name or email
5. **Filter by status:** Use the dropdown to show only SUBMITTED, IN REVIEW, etc.
6. **Filter by service:** Use the service dropdown to show only Driving Licence, PCO, etc.
7. Click **"Load More"** at the bottom if there are more than 20 results

### How to Process an Application (Step by Step)

**Simulated Scenario: You receive a new Driving Licence Conversion application**

1. **Spot it:** Go to Applications. You see "John Smith — Driving Licence Conversion — SUBMITTED" at the top of the list.

2. **Open it:** Click on the application card. The detail view opens showing:
   - **Personal Info:** Name, email, phone, DOB, nationality, address
   - **Service Data:** Which package they chose (Theory Only / Practical Only / Full), driving history, etc.
   - **Pricing Info:** Package name, total cost, upfront payment, remaining balance
   - **Documents:** Uploaded files with download links

3. **Download & review documents:**
   - Click the download button next to each document
   - A new browser tab opens showing the document (signed URL, valid for 60 seconds)
   - Review passport, address proof, and any additional documents
   - Verify the name on the documents matches the application

4. **Add admin notes (internal):**
   - Scroll down to "Admin Notes" section
   - Type a note (e.g., "Passport verified. Address proof is a utility bill — looks good.")
   - Click **"Add Note"**
   - This note is visible only to admins, not to the client

5. **Update the status:**
   - Use the status dropdown at the top-right of the detail view
   - Change from SUBMITTED → IN REVIEW (after initial check)
   - Then → PROCESSING (when you start working on it)
   - If rejecting: change to REJECTED and fill in the rejection reason

6. **Send a payment invoice (for paid services):**
   - Click **"Copy Payment Mail"** button
   - A formatted invoice is copied to your clipboard
   - Paste it into your email client (Gmail, Outlook, etc.) and send to the client
   - The invoice includes: invoice number, pricing breakdown, bank details, Wise/PayPal options

7. **Email the applicant directly (optional):**
   - Click **"Email Applicant"** button
   - An email compose modal opens with the client's email pre-filled
   - Write your subject and message
   - Click **"Send Email"**
   - The email is sent from `info@clearrouteuk.co.uk` via EmailJS

### Application Detail View — Full Map

```
┌──────────────────────────────────────────────────────────────┐
│  ← Back to Applications          [Status: SUBMITTED ▼]       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─── PERSONAL INFORMATION ───────────────────────────────┐ │
│  │ Name: John Smith    Email: john@email.com               │ │
│  │ Phone: +447123456789  DOB: 15/03/1990                  │ │
│  │ Nationality: Nigerian   Address: 123 London Road, E1   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─── SERVICE DETAILS ────────────────────────────────────┐ │
│  │ Service: Driving Licence Conversion                    │ │
│  │ Package: Full (Theory + Practical)                     │ │
│  │ Total: £1,500  Upfront: £800  Remaining: £700          │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─── DOCUMENTS ──────────────────────────────────────────┐ │
│  │ ✓ Passport    [Download]                               │ │
│  │ ✓ Address Proof  [Download]                            │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─── ADMIN NOTES ────────────────────────────────────────┐ │
│  │ Admin · 15/07/2026: Documents verified, looks good.    │ │
│  │                                                         │ │
│  │ [Enter note here...]  [Add Note]                       │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─── ACTIONS ────────────────────────────────────────────┐ │
│  │ [Email Applicant]  [Copy Payment Mail]  [Delete App]   │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─── STATUS UPDATE ──────────────────────────────────────┐ │
│  │ Status: [SUBMITTED ▼]                                  │ │
│  │ Rejection Reason: [_____________] (only if rejecting)  │ │
│  │ [Update Status]                                         │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Exporting Applications to CSV

1. Go to **Applications** list
2. Click the **"Export CSV"** button
3. A CSV file downloads with: Name, Email, Phone, Service, Status, Date, Nationality, Address
4. Open in Excel/Google Sheets for reporting

### Deleting an Application

1. Open the application detail view
2. Click **"Delete Application"**
3. Confirm the deletion (double confirmation)
4. **WARNING:** This permanently deletes the application, all its documents, and all admin notes. This cannot be undone.

---

## 6. Managing Enquiries (Contact Form)

Enquiries come from the public contact form at `https://www.clearrouteuk.co.uk/contact.html`.

### Enquiry Status Lifecycle

```
NEW ──> CONTACTED ──> RESOLVED ──> CLOSED
```

| Status | Meaning |
|--------|---------|
| **NEW** | Just received, not yet responded to |
| **CONTACTED** | You've reached out to the client |
| **RESOLVED** | Issue addressed, client satisfied |
| **CLOSED** | No further action needed |

### How to Handle an Enquiry

**Simulated Scenario: A new enquiry arrives**

1. **You see the badge:** A number may appear next to "Enquiries" in the sidebar if new enquiries exist.

2. **Open the Enquiries page:** Click "Enquiries" in the sidebar.

3. **Review the list:** Each entry shows name, email, service they're interested in, status badge, and date.

4. **Open an enquiry:** Click on any enquiry card. The detail view shows:
   - Full contact details (name, email, phone, nationality)
   - Service they're interested in
   - Their message
   - Current status
   - Admin notes

5. **Respond to the client:**
   - Use their email to respond externally (via your email client)
   - Or click **"Email"** button to compose from the admin panel

6. **Add internal notes:**
   - Type notes in the admin notes section (visible only to admins)
   - Example: "Client wants to know about Driving Licence timeline. Called back 15/07."

7. **Update status:**
   - Change from NEW → CONTACTED (after first response)
   - Then → RESOLVED (when issue addressed)
   - Then → CLOSED (when done)

8. **Delete enquiry (if spam/noise):**
   - Click "Delete Enquiry"
   - Confirm the deletion

### Filtering Enquiries

- **Search:** Type in the search box to filter by name or email
- **Filter by status:** Use the dropdown to show only NEW, CONTACTED, RESOLVED, or CLOSED
- **Pagination:** Click "Load More" for additional results beyond the first 20

---

## 7. Managing Emails (Email Inbox)

The Email Inbox is **separate from Enquiries**. These are messages sent by **registered clients** from their dashboard using the "Send Email to Admin" feature.

### Email Status Lifecycle

```
UNREAD ──> READ ──> REPLIED
```

### How to Handle Emails

1. **Click "Email Inbox"** in the sidebar
2. **Look for UNREAD emails** — they have a highlighted background (light orange) with an orange left border
3. **Click an email** to open it — it's automatically marked as "READ"
4. **Read the message** — the full message body is displayed
5. **Reply via EmailJS:**
   - Click **"Reply via Email"**
   - The compose modal opens with the recipient's email and name pre-filled
   - The subject is pre-filled with "Re: [original subject]"
   - Write your response
   - Click **"Send Email"**
6. **Update status manually:**
   - Use the status dropdown to mark as UNREAD, READ, or REPLIED
   - Click **"Update Status"**
7. **Delete email:** Click **"Delete Email"** and confirm

### Key Difference: Email Inbox vs Enquiries

| | Email Inbox | Enquiries |
|---|------------|-----------|
| **Source** | Registered users (from dashboard) | Anyone (from contact form) |
| **Table** | `applicant_emails` | `enquiries` |
| **Requires login?** | Yes (client must have account) | No (public form) |
| **Has phone?** | No | Yes |
| **Has nationality?** | No | Yes |
| **Has service type?** | No | Yes (which service they're asking about) |

---

## 8. Managing Users

### Viewing Users

1. Click **"Users"** in the sidebar
2. You see a list of all registered users (excluding admin accounts)
3. Each entry shows: name, email, join date

### Viewing a User's Profile

1. Click on a user to open their detail view
2. You see:
   - Full name, email, phone
   - User ID (UUID)
   - Join date
   - List of their applications (with clickable links to application details)

### Deleting a User

> **⚠️ CAUTION: This is irreversible and cascading.**

When you delete a user, the following are **permanently destroyed** in order:
1. All their application notes
2. All their uploaded documents
3. All their applications
4. All their chat messages
5. All admin replies related to their chat sessions
6. All admin queue entries
7. All their chat sessions
8. Their profile

**Triple confirmation** is required before deletion proceeds.

### When to Delete a User

- Only delete users who are clearly spam accounts or who explicitly request account deletion
- Never delete a user who has active applications
- Before deleting, check their applications to ensure nothing is in progress

---

## 9. Live Chat Management

The live chat system has three modes:

| Mode | Who's Talking | What You See |
|------|--------------|--------------|
| **AI Mode** | Chatbot (Llama 3.3) | Not visible to you — automated |
| **Waiting** | Visitor waiting for human | "Requested" badge, in queue |
| **Active** | You (admin) and visitor | "Live" badge, real-time messages |

### The Live Chat Inbox Layout

```
┌──────────────────────┬──────────────────────────────────────┐
│   SESSIONS LIST      │          CHAT VIEW                    │
│                      │                                      │
│ 🔵 John Smith        │  John Smith                    [Live]│
│    "Hi, I need help" │  ───────────────────────────────────│
│    Status: Live      │  Visitor: Hi, I need help with my    │
│                      │          driving licence              │
│ 🟠 Anonymous         │  ───────────────────────────────────│
│    "Hello"           │  Bot: I can help with that! Let me   │
│    Status: Requested │       connect you to an agent...      │
│                      │  ───────────────────────────────────│
│                      │  [You]: Hello John! How can I help?  │
│                      │  ───────────────────────────────────│
│                      │                                      │
│                      │  [Type a message...]      [Send]     │
│                      │  [Take Over] or [Back to AI]         │
└──────────────────────┴──────────────────────────────────────┘
```

### How to Handle a Live Chat Request

**Simulated Scenario: A visitor requests to speak to a human**

1. **You hear a notification sound** (two-tone beep) — a new handoff request arrived
2. **A toast notification** slides in from the right: "New chat from Ahmed!"
3. **The sidebar badge** lights up next to "Live Chat Inbox"
4. **Go to Live Chat Inbox** — click "Live Chat Inbox" in the sidebar
5. **Find the session** — it shows with an "Requested" badge
6. **Click the session** to open it — you see the full conversation history
7. **Click "Take Over"** — you are now the active responder
8. **Type your message** in the text box and press Enter or click Send
9. **The visitor sees your message in real-time** — no refresh needed
10. **Continue the conversation** until the visitor's issue is resolved
11. **When done:** You can either:
    - Let the session remain (visitor can close the chat window)
    - Click **"Back to AI"** to return the visitor to the chatbot
    - Click **"Delete Session"** to remove it entirely

### Chat Session Indicators

| Badge | Meaning |
|-------|---------|
| **Live** (purple) | Admin has taken over, actively chatting |
| **Requested** (orange) | Visitor wants a human, nobody has responded yet |

### Typing Indicators

- When the visitor is typing, you see **"Visitor is typing..."** below the message list
- When you type, the visitor sees **"Agent is typing..."**

### Unread Messages

- A badge with a number appears on sessions with unread messages
- The unread count resets when you open the session

### Deleting a Chat Session

1. Open the session
2. Click **"Delete Session"**
3. Confirm — this permanently deletes the session, all messages, admin replies, and queue entries

---

## 10. Settings & Configuration

### Your Profile

- **First Name / Last Name:** Editable in Settings
- **Email:** Display only (cannot be changed from the panel)

To update your name:
1. Go to **Settings**
2. Edit first name and/or last name
3. Click **"Save Profile"**
4. This updates both your database profile and authentication metadata

### Invoice Template

The invoice template is used for generating payment requests. It's stored in your browser's localStorage (NOT shared across devices/browsers).

- **Edit:** Modify the template text in the textarea
- **Save:** Click **"Save Invoice Template"**
- **Reset:** Click **"Reset to Default"** to restore the original template

**Variable placeholders you can use:**
- `{{invoice_number}}` — Auto-generated invoice number
- `{{client_name}}` — Client's full name
- `{{service_name}}` — Service type
- `{{amount}}` — Total cost
- `{{status}}` — Payment status

### System Information

The Settings page shows:
- Admin email address
- Total number of registered users
- Total number of applications
- Database connection status

---

## 11. How Data Flows Through the System

### Database Tables Reference

| Table | What It Stores | Who Creates Records | Who Reads |
|-------|---------------|-------------------|-----------|
| `profiles` | User profiles (name, email, phone) | Auto-trigger on signup | User sees own; Admin sees all |
| `applications` | Service applications | Logged-in users | User sees own; Admin sees all |
| `application_documents` | File metadata + paths | On application submit | User sees own; Admin sees all |
| `application_notes` | Admin-only notes | Admin only | User sees own app notes; Admin sees all |
| `enquiries` | Contact form submissions | Anyone (public form) | Admin only |
| `applicant_emails` | Client emails to admin | Logged-in users | Admin only |
| `chat_sessions` | Chatbot visitor sessions | Chatbot (auto) | Public read; Admin can delete |
| `chat_messages` | Individual chat messages | Chatbot + Admin | Public read; Admin can delete |
| `admin_queue` | Human handoff queue | Chatbot (on handoff) | Admin reads |
| `admin_replies` | Admin replies in chat | Admin only | Chatbot reads (realtime) |
| `audit_log` | Admin action trail | Admin only (auto) | Admin only |

### How Files Are Stored

- Client uploads go to the **Supabase Storage** bucket called `documents`
- File path format: `{application_id}/passport_{timestamp}_{filename}`
- Maximum file size: **10 MB** per file
- Supported types: Images (jpg, png, webp, gif), PDFs, documents
- Admins download files via **signed URLs** (valid for 60 seconds)

### How Emails Are Sent

**Two email systems exist:**

1. **EmailJS (client-side):** Used for contact form submissions and admin compose
   - Sends from the browser (no server needed)
   - Template-based — variables like `to_email`, `subject`, `message` are filled in
   - The "From" name shows as "ClearRoute UK"

2. **SMTP via Edge Function (server-side):** Used for application receipts and payment invoices
   - Sends from the server via Namecheap Private Email SMTP
   - HTML-formatted emails
   - Only triggered when a new application is submitted

### How Real-Time Works

Supabase Realtime uses PostgreSQL's built-in replication to push changes to connected clients instantly:

- **Admin panel** listens for new chat handoff requests → plays sound + shows notification
- **Admin panel** listens for new chat messages in active sessions → messages appear instantly
- **Client dashboard** listens for application status changes → list refreshes automatically
- **Client chatbot** listens for admin replies → messages appear in the chat window

### How Authentication Works

```
User Registers → Supabase Auth creates auth.users row
              → Database trigger creates profiles row
              → If email = info@clearrouteuk.co.uk → is_admin = TRUE

User Logs In  → Supabase Auth verifies credentials
              → Returns JWT session token
              → Client-side checks isAdminEmail()
              → Redirects to dashboard.html or admin/index.html

User访问保护页面 → getSession() checks for valid token
                  → If no session → redirect to login.html
                  → If valid → show page content
```

---

## 12. Guided Simulations — Real Working Scenarios

### Simulation 1: First-Time Login & Orientation

**Goal:** Familiarize yourself with the admin panel

**Steps:**
1. Open your browser and go to `https://www.clearrouteuk.co.uk/admin/`
2. You see the login screen with email and password fields
3. Type `info@clearrouteuk.co.uk` in the email field
4. Type your password in the password field
5. Click **"Sign In to Dashboard"**
6. You're now on the Dashboard page. You see:
   - Four stat cards at the top: Active Sessions, Pending Handoffs, Resolved Today, Total Messages
   - An activity feed below showing recent chat conversations (may be empty initially)
7. Click each sidebar item once to see what's in each section
8. Go to Settings and verify your name and email are correct
9. Go back to Dashboard

**Checklist:**
- [ ] I can log in successfully
- [ ] I can see all 7 sidebar sections
- [ ] I can navigate between sections
- [ ] My profile information is correct in Settings
- [ ] I understand what each section does

---

### Simulation 2: Processing a New Enquiry

**Goal:** Handle a contact form enquiry from start to finish

**Setup:** Ask someone (or use a different browser/incognito window) to go to `https://www.clearrouteuk.co.uk/contact.html` and submit a test enquiry with:
- Name: Test Client
- Email: test@example.com
- Phone: +447000000000
- Nationality: Indian
- Service: Driving Licence Conversion
- Message: "I have an Indian driving licence and want to convert it to a UK one. How does this work?"

**Steps:**
1. In the admin panel, click **"Enquiries"** in the sidebar
2. You should see the new enquiry at the top with status "NEW" (orange badge)
3. Click on the enquiry card to open the detail view
4. Read the message — the client wants Driving Licence Conversion info
5. In the **Admin Notes** section, type: "Test enquiry — checking workflow. Client wants Driving Licence info."
6. Click **"Add Note"**
7. Change the status from "NEW" to **"CONTACTED"** using the dropdown
8. Click **"Update Status"**
9. Click the **"Email"** button to compose a reply
10. In the compose modal:
    - To: `test@example.com` (pre-filled)
    - Subject: `RE: Driving Licence Conversion — ClearRoute UK`
    - Message: Write a brief response explaining the process
11. Click **"Send Email"**
12. After sending, change status to **"RESOLVED"**
13. Go back to the Enquiries list — verify the status shows "RESOLVED" (green badge)

**Checklist:**
- [ ] The enquiry appeared in my admin panel
- [ ] I can open and read the enquiry details
- [ ] I can add admin notes
- [ ] I can change the status
- [ ] I can send a reply email
- [ ] The status change is reflected in the list

---

### Simulation 3: Processing a Complete Application

**Goal:** Handle a client application from submission to approval

**Setup:** Create a test user account and submit an application:
1. Go to `https://www.clearrouteuk.co.uk/register.html` (use incognito/different browser)
2. Register with: Name: "Test Applicant", Email: `testapplicant@example.com`, Phone: `+447000000001`, Password: `TestPassword123!`
3. Log in and go to `https://www.clearrouteuk.co.uk/application-form.html`
4. Fill in the form:
   - Service: Driving Licence Conversion
   - Package: Theory Only (£800)
   - Personal details: Use any valid-looking data
   - Upload a test document (any image/PDF, under 10MB)
5. Submit the application

**Steps (as Admin):**
1. In the admin panel, click **"Applications"**
2. You see the new application: "Test Applicant — Driving Licence Conversion — SUBMITTED"
3. Click on it to open the detail view
4. **Review the information:**
   - Verify name, email, phone, DOB, nationality, address
   - Check the service data (package choice)
   - Check the pricing info (£800 upfront for Theory Only)
5. **Download and check the document:**
   - Click the download button next to the uploaded file
   - Verify it opens in a new tab
   - Close the tab
6. **Add a note:** "Documents reviewed. All looks good for Theory Only package."
7. **Update status:** Change from SUBMITTED → **IN REVIEW**
8. Click **"Update Status"**
9. **Generate payment invoice:**
   - Click **"Copy Payment Mail"**
   - A formatted invoice is copied to your clipboard
   - Open a text editor and paste it — verify it contains the correct details
10. **Email the applicant:**
    - Click **"Email Applicant"**
    - Subject: `Your Application Has Been Received — ClearRoute UK`
    - Message: Write a welcome message confirming their application is being processed
    - Click **"Send Email"**
11. **Final status update:** Change from IN REVIEW → **PROCESSING**
12. Click **"Update Status"**
13. **Simulate completion:** Change from PROCESSING → **APPROVED**
14. Click **"Update Status"**

**Verify from the client side:**
15. Switch to the test user's browser
16. Go to `https://www.clearrouteuk.co.uk/dashboard.html`
17. Verify the application status shows "approved"
18. Go to `https://www.clearrouteuk.co.uk/application-progress.html`
19. Verify the status timeline shows the progression

**Checklist:**
- [ ] New application appears in admin panel
- [ ] I can view all application details
- [ ] I can download uploaded documents
- [ ] I can add admin notes
- [ ] I can update the status through the lifecycle
- [ ] The payment invoice copies correctly to clipboard
- [ ] I can email the applicant
- [ ] The client sees the status updates on their end

---

### Simulation 4: Handling a Live Chat Handoff

**Goal:** Respond to a visitor who wants to speak to a human

**Setup:** Open `https://www.clearrouteuk.co.uk` in an incognito/private window (as a visitor)

**Steps:**
1. **As the visitor:** Click the chatbot icon (bottom-right corner)
2. **As the visitor:** Type "Hello, I need help with my application"
3. **As the visitor:** Wait for the AI response
4. **As the visitor:** Click the "Talk to Agent" button in the chatbot (or type "I want to talk to a real person")
5. **As the visitor:** Enter your name when prompted: "Test Visitor"

**Now switch to the admin panel:**
6. You should hear a **notification sound** (beep-beep)
7. A **toast notification** appears: "New chat from Test Visitor!"
8. The **Live Chat Inbox** sidebar item shows a badge
9. Click **"Live Chat Inbox"** in the sidebar
10. You see "Test Visitor" with a **"Requested"** badge (orange)
11. Click on the session
12. You see the conversation history — the visitor's messages and AI responses
13. Click **"Take Over"** — you are now the active responder
14. The badge changes to **"Live"** (purple)
15. Type a message: "Hello! I'm a real person. How can I help you with your application?"
16. Press Enter or click Send

**Verify as the visitor:**
17. Switch to the visitor's browser
18. The visitor should see your message appear in the chatbot instantly
19. The visitor sees "Agent is typing..." while you type
20. Type a reply as the visitor: "Thank you! I submitted an application but haven't heard back."
21. Wait — as admin, the message appears in real-time

**Back as admin:**
22. Read the visitor's message
23. Reply: "Let me check on that for you. Can you give me your email address?"
24. Continue the conversation for a few more messages

**End the session:**
25. Click **"Back to AI"** to return the visitor to the chatbot
26. Or click **"Delete Session"** to remove it entirely (confirm the deletion)

**Checklist:**
- [ ] I heard the notification sound
- [ ] I saw the toast notification
- [ ] The new session appeared in the chat list
- [ ] I can see the full conversation history
- [ ] I can take over the session
- [ ] My messages appear on the visitor's screen in real-time
- [ ] Visitor messages appear in my admin panel in real-time
- [ ] I can end the session or return to AI mode

---

### Simulation 5: Handling a Rejected Application

**Goal:** Properly reject an application with a reason

**Setup:** Use the test application from Simulation 3, or create a new one

**Steps:**
1. Go to **Applications** and find the application you want to reject
2. Open the application detail view
3. Review the documents — pretend you found an issue (e.g., expired passport)
4. Add an admin note: "Passport appears to be expired. Cannot proceed with application."
5. Change status to **REJECTED**
6. Fill in the **Rejection Reason** field: "Passport document provided is expired. Please submit a valid, non-expired passport and resubmit your application."
7. Click **"Update Status"**
8. Click **"Email Applicant"** to send a personalized rejection email explaining what happened and what they need to do
9. Send the email

**Verify:**
10. Go back to the Applications list
11. The application now shows "REJECTED" (red badge)
12. Open it again — verify the rejection reason is saved

**Checklist:**
- [ ] I can add a rejection reason
- [ ] The rejection reason is saved with the application
- [ ] The status badge shows red REJECTED
- [ ] I can send a personalized email explaining the rejection

---

### Simulation 6: End-of-Day Review Routine

**Goal:** Practice the daily admin routine

**Steps:**
1. **Login** to the admin panel
2. **Check Dashboard** — look at stats (Active Sessions, Pending Handoffs, Total Messages)
3. **Check Live Chat Inbox:**
   - Any pending handoffs? Respond to them.
   - Any active sessions? Check if they need attention.
4. **Check Applications:**
   - Filter by "SUBMITTED" — process any new ones
   - Filter by "IN REVIEW" — update any that are ready for processing
   - Filter by "PROCESSING" — check progress on ongoing cases
5. **Check Enquiries:**
   - Filter by "NEW" — respond to any new enquiries
   - Update statuses as needed
6. **Check Email Inbox:**
   - Filter by "UNREAD" — read and respond to any new emails
7. **Export data if needed** — CSV export for any section
8. **Review Settings** — verify system info looks correct

**Checklist:**
- [ ] I can complete a full review in under 15 minutes
- [ ] No enquiries are left in "NEW" status without response
- [ ] No applications are stuck in "SUBMITTED" without acknowledgment
- [ ] All unread emails have been addressed

---

## 13. Things to Do (Best Practices)

### Daily Operations

- **Check the admin panel at least twice daily** — morning and end of business day
- **Respond to enquiries within 24 hours** — fast response = higher conversion
- **Use admin notes liberally** — document every interaction for context
- **Update application statuses promptly** — clients see changes in real-time
- **Send personalized emails** — don't just change statuses silently; tell clients what's happening

### Application Management

- **Always review documents before approving** — verify names match, documents are valid
- **Use the rejection reason field** — clients need to know why and what to fix
- **Add admin notes before status changes** — create an audit trail of decisions
- **Use "Additional Info" status** — when you need something from the client, don't just leave it in review
- **Send payment invoices promptly** — use "Copy Payment Mail" and send via your email client

### Chat Management

- **Respond to handoff requests quickly** — the notification sound is there for a reason
- **Use the visitor's name** — personalization builds trust
- **Be professional and helpful** — you represent the company
- **Return to AI when done** — don't leave sessions open unnecessarily
- **Delete spam sessions** — keep the inbox clean

### Email Management

- **Mark emails as "replied"** after responding — keeps the inbox organized
- **Use the EmailJS compose feature** for consistency — emails come from the company address

### Data Management

- **Export CSV regularly** — backup your data periodically
- **Keep the enquiries list clean** — resolve and close old enquiries
- **Delete spam promptly** — fake enquiries and chat spam should be removed

---

## 14. Things NOT to Do (Critical Warnings)

### Account Security

- **NEVER share your admin password** with anyone
- **NEVER log in from a public/untrusted computer** without logging out after
- **NEVER leave the admin panel open on an unattended screen**
- **NEVER change the admin email** (`info@clearrouteuk.co.uk`) — it's hardcoded throughout the system

### Data Integrity

- **NEVER delete an application that has active/pending status** without resolving it first
- **NEVER delete a user who has pending applications** — process or reject their applications first
- **NEVER modify database records directly** through the Supabase dashboard unless absolutely necessary and you know what you're doing
- **NEVER approve an application without reviewing the documents**
- **NEVER skip the rejection reason** when rejecting an application

### System Configuration

- **NEVER modify the JavaScript files** (`admin.js`, `auth.js`, etc.) unless you have developer support
- **NEVER change the Supabase URL or API keys** in `supabase-config.js`
- **NEVER delete the `admin_queue` or `admin_replies` tables** — they're essential for the chat system
- **NEVER disable Row Level Security (RLS)** in Supabase — it protects your data

### Communication

- **NEVER send payment details via the live chat** — always use email for financial communications
- **NEVER promise specific timelines** you can't guarantee
- **NEVER share client information with third parties**
- **NEVER use the AI chatbot to handle payment-related queries** — always take those to human

### Things to Watch For

- **Spam registrations** — users registering with random emails; delete them
- **Spam chat messages** — the chatbot has anti-spam, but watch for repeated messages
- **Spam enquiries** — fake contact form submissions; mark as closed and delete
- **Invalid documents** — blurry photos, wrong documents, expired IDs; always request correct ones

---

## 15. Troubleshooting Common Issues

### "Access denied" when logging into admin panel

**Cause:** The email entered doesn't match `info@clearrouteuk.co.uk`
**Fix:** Double-check the email address. It must be exactly `info@clearrouteuk.co.uk`.

### "Invalid email or password" error

**Cause:** Wrong password
**Fix:** Reset password via Supabase dashboard at `https://supabase.com/dashboard/project/lxbsdgvzdqptdatluxlg` → Authentication → Users → find the account → reset password.

### Enquiries page shows "Database setup required"

**Cause:** The `enquiries` table doesn't exist in the database
**Fix:** Run the schema from `supabase-schema.sql` in the Supabase SQL Editor.

### Email sending fails with "Failed to send" error

**Cause:** EmailJS template not configured or service ID changed
**Fix:** Check EmailJS dashboard at `https://dashboard.emailjs.com`:
- Service ID should be `service_1i6j9l`
- Admin Compose template ID should be `template_f8ef8le`
- Verify the template variables match: `to_email`, `to_name`, `from_name`, `subject`, `message`, `reply_to`

### Documents won't download

**Cause:** Signed URL expired (valid for 60 seconds only)
**Fix:** Click the download button again. The URL is regenerated each time.

### Chat notification sound doesn't play

**Cause:** Browser has blocked auto-play audio
**Fix:** Click anywhere on the admin panel page first (browsers require user interaction before playing audio). The sound will work for subsequent notifications.

### Real-time messages aren't appearing

**Cause:** Supabase Realtime subscription may have disconnected
**Fix:** Refresh the admin panel page. The subscriptions re-establish on page load.

### Application status changes don't show on client dashboard

**Cause:** The client's browser may have a stale connection
**Fix:** The client needs to refresh their dashboard page. Real-time subscriptions may need reconnection.

### "Update failed — admin RLS permission missing" error

**Cause:** The `is_admin` flag is not set on your profile
**Fix:** Go to Supabase dashboard → Table Editor → profiles → find your record → set `is_admin` to `TRUE`. Or re-run the schema which includes a trigger to auto-set this.

### Invoice template doesn't save

**Cause:** The template is saved in browser localStorage — it doesn't sync across devices
**Fix:** Save the template on each browser/device you use, or keep a copy somewhere safe.

### Payment invoice has placeholder bank details

**Cause:** The bank account number and sort code in the invoice template need to be updated
**Fix:** The current invoice text contains `[UPDATE WITH YOUR ACCOUNT NUMBER]` and `[UPDATE WITH YOUR SORT CODE]` placeholders. These should be replaced with actual bank details. Contact the developer to update the `copyPaymentMail` function in `admin/js/admin.js`.

---

## 16. Quick Reference Cheat Sheet

### URLs

| What | URL |
|------|-----|
| **Admin Panel** | https://www.clearrouteuk.co.uk/admin/ |
| **Website** | https://www.clearrouteuk.co.uk |
| **Supabase Dashboard** | https://supabase.com/dashboard/project/lxbsdgvzdqptdatluxlg |
| **EmailJS Dashboard** | https://dashboard.emailjs.com |
| **GitHub Repository** | https://github.com/AmirNdashi/clearroute-uk |

### Login Credentials

| What | Value |
|------|-------|
| **Admin Email** | `info@clearrouteuk.co.uk` |
| **Admin Panel** | Login at `/admin/` (NOT `/login.html`) |
| **Supabase** | Via Supabase dashboard login |

### Application Statuses

| Status | Color | Meaning |
|--------|-------|---------|
| SUBMITTED | Blue | Just received |
| IN REVIEW | Yellow | Being checked |
| ADDITIONAL INFO | Purple | Need more from client |
| PROCESSING | Blue | Actively working |
| APPROVED | Green | Done |
| REJECTED | Red | Declined |

### Enquiry/Email Statuses

| Enquiry Status | Color | Email Status | Color |
|---------------|-------|-------------|-------|
| NEW | Yellow | UNREAD | Yellow |
| CONTACTED | Blue | READ | Blue |
| RESOLVED | Green | REPLIED | Green |
| CLOSED | Red | — | — |

### Chat Session Statuses

| Status | Badge | Meaning |
|--------|-------|---------|
| ai | None | AI chatbot handling |
| waiting | Orange (Requested) | Human requested, waiting |
| active | Purple (Live) | Admin has taken over |

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Send chat message / Submit login |
| `Escape` | Close email compose modal |

### Contact Info

| What | Value |
|------|-------|
| **Business Email** | info@clearrouteuk.co.uk |
| **WhatsApp** | +447983312575 |
| **Domain** | clearrouteuk.co.uk |

---

## Appendix A: Service Pricing Reference

### Driving Licence Conversion

| Package | Total | Upfront | Remaining |
|---------|-------|---------|-----------|
| Theory Only | £800 | £400 | £400 |
| Practical Only | £900 | £500 | £400 |
| Full Package | £1,500 | £800 | £700 |

### PCO Licence Application

| Package | Total | Upfront | Remaining |
|---------|-------|---------|-----------|
| Theory Only | £800 | £400 | £400 |
| Practical Only | £900 | £500 | £400 |
| Full Package | £1,500 | £800 | £700 |
| Complete Package | £2,500 | £1,000 | £1,500 |

### Other Services

All other services (NI Number, BRP/eVisa, Theory Test Booking, Practical Test Booking, Address Proof, Bank Account) do not have fixed pricing in the system. Pricing is discussed directly with the client.

---

## Appendix B: Audit Log Reference

Every admin action is automatically logged to the `audit_log` table. Logged actions include:

| Action | What Triggered It |
|--------|-------------------|
| `email_status_change` | Changed email status (unread/read/replied) |
| `email_deleted` | Deleted an email from inbox |
| `enquiry_deleted` | Deleted an enquiry |
| `enquiry_status_change` | Changed enquiry status |
| `application_status_change` | Changed application status |
| `application_deleted` | Deleted an application |
| `payment_mail_copied` | Copied payment invoice to clipboard |
| `email_sent` | Sent an email via the compose modal |
| `chat_session_deleted` | Deleted a chat session |
| `user_deleted` | Deleted a user account |

Each log entry includes: action type, JSON details, admin email, and timestamp.

> **Note:** There is currently no interface to view audit logs in the admin panel. To view them, access the `audit_log` table through the Supabase dashboard at: Table Editor → audit_log.

---

## Appendix C: Emergency Procedures

### If the website is down

1. Check https://status.cloudflare.com for Cloudflare issues
2. Check the Supabase dashboard for backend status
3. If it's a code issue, the developer needs to push a fix via GitHub (auto-deploys to Cloudflare Pages)

### If you're locked out of the admin panel

1. Try resetting password via Supabase dashboard → Authentication → Users
2. If that fails, contact the developer

### If a client reports a data breach

1. Note the client's name and what they reported
2. Check the audit log for suspicious activity
3. Contact the developer immediately
4. Do not attempt to investigate on your own

### If spam is overwhelming the system

1. Delete spam enquiries from the Enquiries section
2. Delete spam chat sessions from the Live Chat Inbox
3. Delete spam user accounts from the Users section
4. Contact the developer if the spam persists — anti-spam measures may need updating

---

*This document was created as a comprehensive training resource. If you find any section unclear or need additional detail on a specific topic, please contact the development team.*
