# ClearRoute UK - User Authentication & Application System Setup Guide

This guide will help you set up the complete user authentication and application workflow system for ClearRoute UK.

## 📋 Overview

The system includes:
- User registration and login with Supabase authentication
- User dashboard with service selection
- Multi-step application forms with document upload
- Application progress tracking
- Admin panel for reviewing and managing applications
- Email notification system (placeholder)

## 🚀 Setup Instructions

### 1. Supabase Setup

#### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "New Project"
3. Enter project details:
   - Name: `clearroute-uk`
   - Database Password: (choose a strong password)
   - Region: Choose the region closest to your users
4. Wait for the project to be created (2-3 minutes)

#### Get Your Credentials

1. Go to Project Settings → API
2. Copy your:
   - Project URL
   - anon public key

#### Update Supabase Config

Open `assets/js/supabase-config.js` and replace the placeholder credentials:

```javascript
const SUPABASE_URL      = 'YOUR_PROJECT_URL';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

#### Run the Database Schema

1. Go to the Supabase SQL Editor
2. Open the file `supabase-schema.sql`
3. Copy the entire SQL content
4. Paste it into the SQL Editor
5. Click "Run" to execute the schema

This will create:
- `profiles` table (user profiles)
- `applications` table (user applications)
- `application_documents` table (uploaded documents)
- `application_notes` table (admin notes)
- Row Level Security (RLS) policies
- Triggers and functions

#### Set Up Storage Buckets

1. Go to Storage in Supabase
2. Create a new bucket called `documents`
3. Make it public (or keep private with proper policies)
4. Add storage policies:

```sql
-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Allow authenticated users to read their own files
CREATE POLICY "Authenticated users can read own files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow service role to read all files
CREATE POLICY "Service role can read all files"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'documents');
```

### 2. Configure Email Notifications (Optional)

The system includes placeholder functions for email notifications. To implement actual email sending:

#### Option 1: Supabase Email Templates

1. Go to Authentication → Email Templates in Supabase
2. Customize the confirmation and reset password templates

#### Option 2: Use a Third-Party Service

Update the `sendNotificationEmail` function in `assets/js/application-form.js` to integrate with:
- SendGrid
- Mailgun
- AWS SES
- Or use Supabase Edge Functions

### 3. Test the System

#### Test User Registration

1. Open `index.html` in your browser
2. Click "Create Account" in the hero card
3. Fill out the registration form
4. Verify the user is created in Supabase Authentication
5. Check the `profiles` table in Supabase

#### Test User Login

1. Go to `login.html`
2. Enter your credentials
3. Verify you're redirected to the dashboard

#### Test Application Submission

1. From the dashboard, click "New Application"
2. Select a service
3. Fill out the multi-step form
4. Upload documents (placeholder)
5. Submit the application
6. Check the `applications` table in Supabase

#### Test Admin Panel

1. Go to `admin/index.html`
2. Sign in with your Supabase admin credentials
3. Navigate to "Applications"
4. Review and update application status
5. Add admin notes

### 4. Customize for Your Needs

#### Update Service Types

Edit the service configuration in `assets/js/application-form.js` to add or modify services:

```javascript
const serviceConfig = {
  'your-service': {
    title: 'Your Service Name',
    subtitle: 'Service description',
    estimatedTime: '2-4 weeks',
    fields: `<!-- Your form fields -->`,
    documents: ['Required document 1', 'Required document 2']
  }
};
```

#### Update Email Templates

Customize the email content in the `sendNotificationEmail` function to match your branding.

#### Modify Processing Times

Update the `getEstimatedCompletion` function to set realistic processing times for each service.

## 🔒 Security Considerations

### Row Level Security (RLS)

The schema includes RLS policies to ensure:
- Users can only access their own data
- Admins can access all data (via service role)
- Public access is restricted

### Additional Security Steps

1. **Enable Email Confirmation**: In Supabase Authentication settings, enable email confirmation for new users
2. **Set Up Admin Role**: Create a separate admin role or use Supabase's service role for admin operations
3. **Rate Limiting**: Implement rate limiting on form submissions to prevent abuse
4. **File Validation**: Add server-side validation for uploaded files (size, type, content)
5. **HTTPS**: Ensure your site is served over HTTPS

## 📁 File Structure

```
clearroute-uk/
├── assets/
│   ├── css/
│   │   ├── style.css
│   │   ├── animations.css
│   │   ├── pages.css (auth pages)
│   │   ├── dashboard.css
│   │   ├── application-form.css
│   │   └── application-progress.css
│   ├── js/
│   │   ├── supabase-config.js
│   │   ├── auth.js
│   │   ├── dashboard.js
│   │   ├── application-form.js
│   │   └── application-progress.js
│   └── images/
├── admin/
│   ├── index.html
│   ├── css/
│   │   └── admin.css
│   └── js/
│       └── admin.js
├── index.html (updated with Create Account button)
├── register.html
├── login.html
├── dashboard.html
├── application-form.html
├── application-progress.html
├── supabase-schema.sql
└── SETUP_GUIDE.md (this file)
```

## 🧪 Testing Checklist

- [ ] User can register new account
- [ ] User can login with credentials
- [ ] User can view dashboard
- [ ] User can select a service
- [ ] User can fill out application form
- [ ] User can upload documents
- [ ] User can submit application
- [ ] User can view application progress
- [ ] Admin can view all applications
- [ ] Admin can update application status
- [ ] Admin can add notes to applications
- [ ] User receives status updates (if email implemented)

## 🐛 Troubleshooting

### "Database not initialized" Error

- Ensure Supabase credentials are correct in `supabase-config.js`
- Check that the Supabase CDN script is loading
- Verify your network connection

### "No applications yet" in Dashboard

- Check that the `applications` table has data
- Verify the RLS policies allow the user to read their own data
- Check the browser console for errors

### Admin Panel Not Loading Applications

- Verify the admin user has proper permissions
- Check that the `applications` table exists
- Review the RLS policies for the admin role

### File Upload Not Working

- Ensure the Storage bucket is created
- Check storage policies allow uploads
- Verify file size limits (currently set to 10MB)

## 📞 Support

If you encounter issues:

1. Check the browser console for JavaScript errors
2. Review the Supabase logs in the dashboard
3. Verify all database tables and policies are created
4. Ensure all file paths in your HTML are correct

## 🔄 Future Enhancements

Consider adding:

1. **Real-time Notifications**: Use Supabase Realtime for live status updates
2. **Document Preview**: Add preview functionality for uploaded documents
3. **Payment Integration**: Integrate Stripe for service payments
4. **SMS Notifications**: Add SMS alerts for status updates
5. **Multi-language Support**: Add i18n for international users
6. **Advanced Analytics**: Track application metrics and conversion rates

## 📝 License

This system is part of the ClearRoute UK project. All rights reserved.
