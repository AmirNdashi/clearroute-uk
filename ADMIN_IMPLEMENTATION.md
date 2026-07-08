# Admin Panel Implementation Summary

## Overview
This document summarizes the implemented features for the ClearRoute UK admin panel and provides setup instructions for the required Supabase configuration.

## ⚠️ Important Setup Required

The new features require database schema updates. If you see "Database setup required" or error messages in the admin panel, you need to run the updated schema.

### Quick Fix Steps:
1. Open your Supabase dashboard
2. Go to SQL Editor
3. Open the `supabase-schema.sql` file
4. Run the entire SQL script (can be run multiple times safely)
5. Refresh your admin panel

**Note**: The schema is now idempotent - it can be run multiple times without errors. It handles existing triggers, policies, and tables gracefully.

## Implemented Features

### 1. Document Upload to Supabase Storage ✅
**File**: `assets/js/application-form.js`

- Implemented actual file upload to Supabase Storage bucket 'documents'
- Documents are organized by application ID: `{application_id}/{document_type}_{timestamp}_{filename}`
- Supports three document types:
  - Passport/ID Document
  - Proof of Address  
  - Additional Document
- File paths are stored in the `application_documents` table for admin access

### 2. Document Download in Admin Panel ✅
**File**: `admin/js/admin.js`

- Added download buttons for each document type in application details
- Uses Supabase Storage signed URLs (60-second expiry) for secure access
- Only shows download buttons when documents are actually uploaded
- Error handling for failed downloads

### 3. Database-Backed Enquiries System ✅
**Files**: 
- `supabase-schema.sql` (new table)
- `assets/js/contact.js` (submission)
- `admin/js/admin.js` (management)
- `admin/index.html` (UI)

**Features**:
- New `enquiries` table in database with full RLS policies
- Contact form submissions are saved to Supabase in addition to EmailJS
- Admin panel includes:
  - Enquiries list with status indicators
  - Detailed enquiry view
  - Status management (New, Contacted, Resolved, Closed)
  - Admin notes for each enquiry
  - Quick actions (Reply via Email, Call)

### 4. User Management Section ✅
**Files**:
- `admin/js/admin.js` (functionality)
- `admin/index.html` (UI)

**Features**:
- New "Users" section in admin sidebar
- Lists all registered users from profiles table
- User detail view showing:
  - Profile information
  - User's application history
  - Quick actions (Send Email, Call)
- Links directly to application details from user view

## Database Schema Changes

### New Table: `enquiries`
```sql
CREATE TABLE IF NOT EXISTS enquiries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  nationality TEXT NOT NULL,
  service TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'new' NOT NULL,
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);
```

### Updated Table: `application_documents`
Added columns for file paths:
- `passport_file_path TEXT`
- `address_proof_file_path TEXT`
- `additional_doc_file_path TEXT`

### RLS Policies
- Added RLS for `enquiries` table
- Enquiries are admin-only (no public access)
- Uses service role for admin operations

## Required Supabase Setup

### 1. Run Updated Schema
Execute the updated `supabase-schema.sql` in your Supabase SQL Editor to:
- Create the new `enquiries` table
- Add file path columns to `application_documents`
- Update RLS policies
- Handle existing triggers and policies safely

**Important**: The schema is now idempotent and can be run multiple times without errors. It uses `DROP IF EXISTS` and `CREATE OR REPLACE` to handle existing database objects gracefully.

### 2. Create Storage Bucket
If not already created, set up the 'documents' storage bucket:

1. Go to Storage in Supabase dashboard
2. Create a new bucket named `documents`
3. Make it public (or configure appropriate policies)

### 3. Configure Storage Policies
Run these SQL commands in Supabase Storage SQL editor:

```sql
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to read their own files
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow service role (admin) to read all files
CREATE POLICY "Service role can read all documents"
ON storage.objects FOR SELECT
TO service_role
USING (bucket_id = 'documents');
```

## Admin Panel Navigation

The admin panel now includes:

1. **Dashboard** - Overview stats and recent activity
2. **Live Chat Inbox** - Real-time chat session management
3. **Applications** - User application management with document access
4. **Enquiries** - Contact form enquiry management
5. **Users** - Registered user management

## File Structure Reference

### User-Facing Files
- `assets/js/application-form.js` - Document upload implementation
- `assets/js/contact.js` - Enquiry submission to database

### Admin Files
- `admin/index.html` - Admin panel UI with new sections
- `admin/js/admin.js` - Admin functionality (enquiries, users, documents)
- `admin/css/admin.css` - Admin panel styling

### Database
- `supabase-schema.sql` - Updated database schema

## Testing Checklist

- [ ] Upload schema changes to Supabase
- [ ] Create 'documents' storage bucket
- [ ] Configure storage policies
- [ ] Test document upload from application form
- [ ] Test document download in admin panel
- [ ] Submit contact form and verify it appears in admin
- [ ] Test enquiry status updates
- [ ] Verify user management section loads profiles
- [ ] Test user detail view and application links

## Troubleshooting

### "Database setup required" in Enquiries section
**Cause**: The `enquiries` table doesn't exist in your database yet.

**Solution**:
1. Open Supabase SQL Editor
2. Run the schema from `supabase-schema.sql`
3. Refresh the admin panel

**Note**: The schema can be run multiple times safely without errors.

### "Error loading enquiries" with permission denied
**Cause**: RLS policies are blocking access.

**Solution**:
1. Check RLS policies in Supabase dashboard
2. Ensure your admin user has proper permissions
3. You may need to use service role key for admin operations

### Document upload fails
**Cause**: Storage bucket doesn't exist or policies aren't configured.

**Solution**:
1. Create 'documents' bucket in Supabase Storage
2. Configure storage policies as shown above
3. Check browser console for specific error messages

### Contact form submissions not appearing in admin
**Cause**: Database table missing or RLS blocking inserts.

**Solution**:
1. Verify `enquiries` table exists
2. Check browser console for error messages
3. EmailJS will still work even if Supabase fails (graceful degradation)

## Security Notes

1. **Document Access**: Documents are protected by RLS policies - users can only access their own documents, admins can access all
2. **Enquiries**: Contact form data is admin-only and not accessible to regular users
3. **Signed URLs**: Document downloads use temporary signed URLs (60-second expiry) for security
4. **Service Role**: Admin operations should use service role key for full access

## Future Enhancements

Potential improvements for future iterations:

1. **Document Preview**: Add inline document preview for PDFs/images
2. **Bulk Operations**: Bulk status updates for enquiries/applications
3. **Email Integration**: Send emails directly from admin panel
4. **Analytics**: Dashboard analytics for enquiries and applications
5. **User Search**: Search and filter functionality for users list
6. **Document Validation**: Server-side document validation and virus scanning

## Support

For issues or questions:
1. Check Supabase logs for database/storage errors
2. Verify RLS policies are correctly configured
3. Ensure storage bucket exists and has proper policies
4. Check browser console for JavaScript errors