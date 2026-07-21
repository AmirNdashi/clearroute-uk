-- ============================================================
-- CLEARROUTE UK — WIPE ALL DATA (keep schema intact)
-- ============================================================
-- Run this in your Supabase SQL Editor to clear all data
-- for a fresh handover to the client.
-- This keeps all tables, indexes, triggers, and RLS policies.
-- ============================================================

-- Disable triggers temporarily to avoid FK issues
SET session_replication_role = 'replica';

-- 1. Wipe all application-related data
DELETE FROM application_notes;
DELETE FROM application_documents;
DELETE FROM applications;

-- 2. Wipe all chat-related data
DELETE FROM admin_replies;
DELETE FROM admin_queue;
DELETE FROM chat_messages;
DELETE FROM chat_sessions;

-- 3. Wipe all communication data
DELETE FROM applicant_emails;
DELETE FROM enquiries;

-- 4. Wipe audit log
DELETE FROM audit_log;

-- 5. Delete all non-admin profiles (admin will be recreated on next login)
DELETE FROM profiles WHERE is_admin IS DISTINCT FROM TRUE;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- 6. Ensure admin profile exists and is_admin = TRUE
--    (The trigger handles new users, but existing admin needs confirmation)
UPDATE profiles SET is_admin = TRUE WHERE LOWER(email) = 'info@clearrouteuk.co.uk';
INSERT INTO profiles (id, email, first_name, last_name, full_name, is_admin)
SELECT id, email, COALESCE(raw_user_meta_data->>'first_name', 'Admin'),
       COALESCE(raw_user_meta_data->>'last_name', ''),
       COALESCE(raw_user_meta_data->>'full_name', 'Admin'),
       TRUE
FROM auth.users
WHERE LOWER(email) = 'info@clearrouteuk.co.uk'
  AND NOT EXISTS (SELECT 1 FROM profiles WHERE LOWER(email) = 'info@clearrouteuk.co.uk')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Run these SELECTs to confirm everything is empty:
-- SELECT 'application_notes' AS tbl, count(*) FROM application_notes UNION ALL
-- SELECT 'application_documents', count(*) FROM application_documents UNION ALL
-- SELECT 'applications', count(*) FROM applications UNION ALL
-- SELECT 'chat_messages', count(*) FROM chat_messages UNION ALL
-- SELECT 'chat_sessions', count(*) FROM chat_sessions UNION ALL
-- SELECT 'admin_queue', count(*) FROM admin_queue UNION ALL
-- SELECT 'admin_replies', count(*) FROM admin_replies UNION ALL
-- SELECT 'applicant_emails', count(*) FROM applicant_emails UNION ALL
-- SELECT 'enquiries', count(*) FROM enquiries UNION ALL
-- SELECT 'audit_log', count(*) FROM audit_log;
