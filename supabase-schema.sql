-- ============================================================
-- CLEARROUTE UK — SUPABASE DATABASE SCHEMA
-- ============================================================
-- Run this SQL in your Supabase SQL Editor to set up the database
-- This script can be run multiple times safely - it uses IF EXISTS and DROP IF EXISTS

-- Enable UUID extension (must be first)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- CHAT SESSIONS TABLE (for chatbot functionality)
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  visitor_name TEXT,
  last_message TEXT,
  last_sender TEXT,
  page TEXT,
  is_admin_mode BOOLEAN DEFAULT FALSE,
  requested_human BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'ai' NOT NULL, -- 'ai', 'waiting', 'active'
  unread INTEGER DEFAULT 0,
  visitor_typing TIMESTAMP WITH TIME ZONE,
  admin_typing TIMESTAMP WITH TIME ZONE,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Add new columns if table already exists (migration)
DO $$
BEGIN
  -- Add visitor_name if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'visitor_name'
  ) THEN
    ALTER TABLE chat_sessions ADD COLUMN visitor_name TEXT;
  END IF;

  -- Add status if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'status'
  ) THEN
    ALTER TABLE chat_sessions ADD COLUMN status TEXT DEFAULT 'ai' NOT NULL;
  END IF;

  -- Add unread if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'unread'
  ) THEN
    ALTER TABLE chat_sessions ADD COLUMN unread INTEGER DEFAULT 0;
  END IF;

  -- Add visitor_typing if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'visitor_typing'
  ) THEN
    ALTER TABLE chat_sessions ADD COLUMN visitor_typing TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add admin_typing if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'admin_typing'
  ) THEN
    ALTER TABLE chat_sessions ADD COLUMN admin_typing TIMESTAMP WITH TIME ZONE;
  END IF;

  -- Add start_time if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'start_time'
  ) THEN
    ALTER TABLE chat_sessions ADD COLUMN start_time TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL;
  END IF;

  -- Add last_active if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'last_active'
  ) THEN
    ALTER TABLE chat_sessions ADD COLUMN last_active TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL;
  END IF;

  -- Add requested_human if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'requested_human'
  ) THEN
    ALTER TABLE chat_sessions ADD COLUMN requested_human BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Create indexes (only if columns exist)
CREATE INDEX IF NOT EXISTS chat_sessions_updated_at_idx ON chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_sessions_admin_mode_idx ON chat_sessions(is_admin_mode);

-- Create status index only if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'status'
  ) THEN
    CREATE INDEX IF NOT EXISTS chat_sessions_status_idx ON chat_sessions(status);
  END IF;
END $$;

-- Create requested_human index only if column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'requested_human'
  ) THEN
    CREATE INDEX IF NOT EXISTS chat_sessions_requested_human_idx ON chat_sessions(requested_human);
  END IF;
END $$;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;

CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- CHAT MESSAGES TABLE (for chatbot messages)
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  sender TEXT NOT NULL, -- 'user', 'bot', or 'admin'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON chat_messages(created_at DESC);

-- ============================================================
-- ADMIN QUEUE TABLE (for human handoff requests)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_queue (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  page TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS admin_queue_session_id_idx ON admin_queue(session_id);
CREATE INDEX IF NOT EXISTS admin_queue_status_idx ON admin_queue(status);

-- ============================================================
-- ADMIN REPLIES TABLE (for admin responses to users)
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_replies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  timestamp_ms BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Add timestamp_ms if table already exists and column doesn't
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_replies' AND column_name = 'timestamp_ms'
  ) THEN
    ALTER TABLE admin_replies ADD COLUMN timestamp_ms BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS admin_replies_session_id_idx ON admin_replies(session_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on chat tables
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_replies ENABLE ROW LEVEL SECURITY;

-- Chat sessions policies - public read (for admin), anyone can create
DROP POLICY IF EXISTS "Anyone can create chat sessions" ON chat_sessions;
CREATE POLICY "Anyone can create chat sessions"
  ON chat_sessions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read chat sessions" ON chat_sessions;
CREATE POLICY "Public can read chat sessions"
  ON chat_sessions FOR SELECT
  USING (true);

-- Chat messages policies - public read, anyone can create
DROP POLICY IF EXISTS "Anyone can create chat messages" ON chat_messages;
CREATE POLICY "Anyone can create chat messages"
  ON chat_messages FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read chat messages" ON chat_messages;
CREATE POLICY "Public can read chat messages"
  ON chat_messages FOR SELECT
  USING (true);

-- Admin queue policies - public read, anyone can create
DROP POLICY IF EXISTS "Anyone can create admin queue" ON admin_queue;
CREATE POLICY "Anyone can create admin queue"
  ON admin_queue FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read admin queue" ON admin_queue;
CREATE POLICY "Public can read admin queue"
  ON admin_queue FOR SELECT
  USING (true);

-- Admin replies policies - public read, anyone can create
DROP POLICY IF EXISTS "Anyone can create admin replies" ON admin_replies;
CREATE POLICY "Anyone can create admin replies"
  ON admin_replies FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Public can read admin replies" ON admin_replies;
CREATE POLICY "Public can read admin replies"
  ON admin_replies FOR SELECT
  USING (true);

-- Note: Uses DROP POLICY IF EXISTS to handle existing policies safely

-- ============================================================
-- PROFILES TABLE (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS profiles_email_idx ON profiles(email);

-- Admin flag for RLS policies (set is_admin = TRUE for admin users in Supabase)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT FALSE NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS profiles_is_admin_idx ON profiles(is_admin);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc', NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This function uses CREATE OR REPLACE so it can be run multiple times safely

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Note: Uses DROP IF EXISTS to handle existing triggers safely

-- ============================================================
-- APPLICATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS applications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  service_type TEXT NOT NULL,
  status TEXT DEFAULT 'submitted' NOT NULL,
  -- Personal Information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  date_of_birth DATE NOT NULL,
  nationality TEXT NOT NULL,
  address TEXT NOT NULL,
  -- Service-specific data (stored as JSONB)
  service_data JSONB DEFAULT '{}'::jsonb,
  -- Additional information
  additional_info TEXT,
  -- Pricing information (for PCO licence and other paid services)
  pricing_info JSONB DEFAULT '{}'::jsonb,
  -- Payment status
  payment_status TEXT DEFAULT 'pending',
  payment_amount DECIMAL(10, 2),
  -- Status tracking
  rejection_reason TEXT,
  estimated_completion TIMESTAMP WITH TIME ZONE,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS applications_user_id_idx ON applications(user_id);
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status);
CREATE INDEX IF NOT EXISTS applications_service_type_idx ON applications(service_type);
CREATE INDEX IF NOT EXISTS applications_created_at_idx ON applications(created_at DESC);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_applications_updated_at ON applications;

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Note: Uses DROP IF EXISTS to handle existing triggers safely

-- ============================================================
-- APPLICATION DOCUMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS application_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE NOT NULL,
  passport_provided BOOLEAN DEFAULT FALSE,
  address_proof_provided BOOLEAN DEFAULT FALSE,
  additional_doc_provided BOOLEAN DEFAULT FALSE,
  -- Document file paths (for Supabase Storage)
  passport_file_path TEXT,
  address_proof_file_path TEXT,
  additional_doc_file_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Add new columns if they don't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'application_documents' 
    AND column_name = 'passport_file_path'
  ) THEN
    ALTER TABLE application_documents ADD COLUMN passport_file_path TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'application_documents' 
    AND column_name = 'address_proof_file_path'
  ) THEN
    ALTER TABLE application_documents ADD COLUMN address_proof_file_path TEXT;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'application_documents' 
    AND column_name = 'additional_doc_file_path'
  ) THEN
    ALTER TABLE application_documents ADD COLUMN additional_doc_file_path TEXT;
  END IF;
END $$;

-- Add pricing columns to applications table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'applications' 
    AND column_name = 'pricing_info'
  ) THEN
    ALTER TABLE applications ADD COLUMN pricing_info JSONB DEFAULT '{}'::jsonb;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'applications' 
    AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE applications ADD COLUMN payment_status TEXT DEFAULT 'pending';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'applications' 
    AND column_name = 'payment_amount'
  ) THEN
    ALTER TABLE applications ADD COLUMN payment_amount DECIMAL(10, 2);
  END IF;
END $$;

-- Note: Uses DO block with IF NOT EXISTS to handle existing columns safely

-- Create index
CREATE INDEX IF NOT EXISTS application_documents_application_id_idx ON application_documents(application_id);

-- ============================================================
-- APPLICATION NOTES TABLE (for admin notes)
-- ============================================================
CREATE TABLE IF NOT EXISTS application_notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  application_id UUID REFERENCES applications(id) ON DELETE CASCADE NOT NULL,
  admin_name TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Create index
CREATE INDEX IF NOT EXISTS application_notes_application_id_idx ON application_notes(application_id);
CREATE INDEX IF NOT EXISTS application_notes_created_at_idx ON application_notes(created_at DESC);

-- ============================================================
-- ENQUIRIES TABLE (for contact form submissions)
-- ============================================================
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

-- Create indexes
CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries(status);
CREATE INDEX IF NOT EXISTS enquiries_created_at_idx ON enquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS enquiries_email_idx ON enquiries(email);

-- Add updated_at column if it doesn't exist (for existing tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'enquiries' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE enquiries ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL;
  END IF;
END $$;

-- Note: Uses DO block with IF NOT EXISTS to handle existing columns safely

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_enquiries_updated_at ON enquiries;

CREATE TRIGGER update_enquiries_updated_at
  BEFORE UPDATE ON enquiries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Note: Uses DROP IF EXISTS to handle existing triggers safely

-- ============================================================
-- AUDIT LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  admin_email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log(action);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Profiles policies
-- Users can only see their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (triggered by auth)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Note: Uses DROP POLICY IF EXISTS to handle existing policies safely

-- Applications policies
-- Users can only see their own applications
DROP POLICY IF EXISTS "Users can view own applications" ON applications;
CREATE POLICY "Users can view own applications"
  ON applications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own applications
DROP POLICY IF EXISTS "Users can insert own applications" ON applications;
CREATE POLICY "Users can insert own applications"
  ON applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users cannot update applications (only admins can)
-- No UPDATE policy for regular users

-- Admin helper: checks profiles.is_admin for the current auth user
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Admin policies for applications
DROP POLICY IF EXISTS "Admins can view all applications" ON applications;
CREATE POLICY "Admins can view all applications"
  ON applications FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all applications" ON applications;
CREATE POLICY "Admins can update all applications"
  ON applications FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Note: Uses DROP POLICY IF EXISTS to handle existing policies safely

-- Application documents policies
-- Users can only see documents for their own applications
DROP POLICY IF EXISTS "Users can view own application documents" ON application_documents;
CREATE POLICY "Users can view own application documents"
  ON application_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = application_documents.application_id
      AND applications.user_id = auth.uid()
    )
  );

-- Users can insert documents for their own applications
DROP POLICY IF EXISTS "Users can insert own application documents" ON application_documents;
CREATE POLICY "Users can insert own application documents"
  ON application_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = application_documents.application_id
      AND applications.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view all application documents" ON application_documents;
CREATE POLICY "Admins can view all application documents"
  ON application_documents FOR SELECT
  USING (public.is_admin());

-- Note: Uses DROP POLICY IF EXISTS to handle existing policies safely

-- Application notes policies
-- Users can only see notes for their own applications
DROP POLICY IF EXISTS "Users can view own application notes" ON application_notes;
CREATE POLICY "Users can view own application notes"
  ON application_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM applications
      WHERE applications.id = application_notes.application_id
      AND applications.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view all application notes" ON application_notes;
CREATE POLICY "Admins can view all application notes"
  ON application_notes FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert application notes" ON application_notes;
CREATE POLICY "Admins can insert application notes"
  ON application_notes FOR INSERT
  WITH CHECK (public.is_admin());

-- Enquiries policies
DROP POLICY IF EXISTS "Anyone can submit enquiries" ON enquiries;
CREATE POLICY "Anyone can submit enquiries"
  ON enquiries FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view all enquiries" ON enquiries;
CREATE POLICY "Admins can view all enquiries"
  ON enquiries FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update enquiries" ON enquiries;
CREATE POLICY "Admins can update enquiries"
  ON enquiries FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admin profile access (for user management)
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (public.is_admin());

-- Note: Uses DROP POLICY IF EXISTS to handle existing policies safely

-- ============================================================
-- AUTOMATIC PROFILE CREATION TRIGGER
-- ============================================================
-- This trigger automatically creates a profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, full_name, phone, is_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    LOWER(NEW.email) = LOWER('info@clearrouteuk.co.uk')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Note: Uses DROP IF EXISTS to handle existing triggers safely

-- Fix existing admin profiles: ensure the admin user has is_admin = TRUE
-- This handles the case where the admin user was created before the trigger
DO $$
BEGIN
  UPDATE public.profiles
  SET is_admin = TRUE
  WHERE LOWER(email) = LOWER('info@clearrouteuk.co.uk')
    AND (is_admin IS NULL OR is_admin = FALSE);
END $$;

-- ============================================================
-- STORAGE BUCKETS (run in Supabase Storage)
-- ============================================================
-- Create these buckets in Supabase Storage:
-- 1. 'documents' - for user-uploaded documents
-- 2. 'avatars' - for user profile pictures

-- Storage policies (run in Supabase Storage SQL editor):
-- Allow authenticated users to upload to their own folder
-- Allow authenticated users to read their own files
-- Allow service role to read all files

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Function to get application count by status
CREATE OR REPLACE FUNCTION get_application_stats(user_id UUID)
RETURNS TABLE(
  total BIGINT,
  pending BIGINT,
  in_review BIGINT,
  processing BIGINT,
  approved BIGINT,
  rejected BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total,
    COUNT(*) FILTER (WHERE status = 'submitted' OR status = 'pending')::BIGINT as pending,
    COUNT(*) FILTER (WHERE status = 'in_review')::BIGINT as in_review,
    COUNT(*) FILTER (WHERE status = 'processing')::BIGINT as processing,
    COUNT(*) FILTER (WHERE status = 'approved')::BIGINT as approved,
    COUNT(*) FILTER (WHERE status = 'rejected')::BIGINT as rejected
  FROM applications
  WHERE applications.user_id = get_application_stats.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ADMIN SETUP (run once after creating your admin account)
-- ============================================================
-- Only info@clearrouteuk.co.uk should have admin access:
-- UPDATE profiles SET is_admin = (LOWER(email) = LOWER('info@clearrouteuk.co.uk'));

-- ============================================================
-- AUDIT LOG RLS POLICIES
-- ============================================================

-- Only admins can view audit log
DROP POLICY IF EXISTS "Admins can view audit log" ON audit_log;
CREATE POLICY "Admins can view audit log"
  ON audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- Only admins can insert into audit log
DROP POLICY IF EXISTS "Admins can insert audit log" ON audit_log;
CREATE POLICY "Admins can insert audit log"
  ON audit_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = TRUE
    )
  );

-- ============================================================
-- SAMPLE DATA (optional - for testing)
-- ============================================================

-- Uncomment to insert sample data for testing
-- INSERT INTO profiles (id, email, first_name, last_name, full_name, phone)
-- VALUES 
--   ('550e8400-e29b-41d4-a716-446655440000', 'test@example.com', 'John', 'Doe', 'John Doe', '+1234567890')
-- ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- CLEANUP FUNCTIONS (use with caution)
-- ============================================================

-- Function to delete all data for a user
-- CREATE OR REPLACE FUNCTION delete_user_data(user_id UUID)
-- RETURNS VOID AS $$
-- BEGIN
--   DELETE FROM application_notes WHERE application_id IN (
--     SELECT id FROM applications WHERE user_id = delete_user_data.user_id
--   );
--   DELETE FROM application_documents WHERE application_id IN (
--     SELECT id FROM applications WHERE user_id = delete_user_data.user_id
--   );
--   DELETE FROM applications WHERE user_id = delete_user_data.user_id;
--   DELETE FROM profiles WHERE id = delete_user_data.user_id;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER;
