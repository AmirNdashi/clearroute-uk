# Chatbot Setup Guide

## Overview
The ClearRoute UK chatbot has been upgraded to use secure API key management via Supabase Edge Functions. This ensures your Groq API key is never exposed in client-side code.

## 🚀 Setup Instructions

### 1. Deploy the Supabase Edge Function

The chatbot now uses a Supabase Edge Function to securely call the Groq API. You need to deploy this function and configure your Groq API key.

#### Option A: Using Supabase CLI (Recommended)

1. Install Supabase CLI if you haven't already:
   ```bash
   npm install -g supabase
   ```

2. Initialize Supabase in your project (if not already done):
   ```bash
   supabase init
   ```

3. Link to your Supabase project:
   ```bash
   supabase link --project-ref lxbsdgvzdqptdatluxlg
   ```

4. Deploy the chatbot function:
   ```bash
   supabase functions deploy chatbot
   ```

5. Set your Groq API key as an environment variable:
   ```bash
   supabase secrets set GROQ_API_KEY=your_groq_api_key_here
   ```

#### Option B: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to "Edge Functions" in the left sidebar
3. Click "New Function"
4. Name it `chatbot`
5. Copy the contents of `supabase/functions/chatbot/index.ts`
6. Paste it into the function editor
7. Go to "Settings" → "Environment Variables"
8. Add a new variable:
   - Name: `GROQ_API_KEY`
   - Value: `gsk_C0OX6UaBSLO0tGqm9uYWGdyb3FYnFy0a0PWKO9wO8ofS7xRO4YD`
9. Save and deploy the function

### 2. Update Database Schema

The chatbot requires database tables for session management. Run the updated schema:

1. Open Supabase SQL Editor
2. Run the entire `supabase-schema.sql` file
3. This will create:
   - `chat_sessions` table
   - `chat_messages` table
   - `admin_queue` table
   - `admin_replies` table
   - Proper RLS policies

### 3. Test the Chatbot

1. Open your website in a browser
2. Click the chatbot button (bottom right)
3. Test basic functionality:
   - Send a message to see if the AI responds
   - Click "Speak to a human" to test handoff
   - Check the admin panel to see if the conversation appears

## 🔒 Security Features

### API Key Security
- ✅ Groq API key is stored in Supabase environment variables
- ✅ Never exposed in client-side code
- ✅ Accessed only via secure Edge Function
- ✅ Compliant with GitHub API privacy policies

### Admin Panel Filtering
- ✅ Only shows conversations where users requested human support
- ✅ Filters out all bot-only conversations
- ✅ Clearly labels "Live" vs "Requested" conversations
- ✅ Dashboard stats only count human conversations

### Database Security
- ✅ Row Level Security (RLS) policies on all chat tables
- ✅ Public read access for admin panel
- ✅ Anyone can create sessions and messages
- ✅ Secure admin handoff mechanism

## 🎯 Key Features

### 1. Secure API Management
- Groq API key is stored securely in Supabase
- Edge Function handles all API calls
- No API keys in client-side code
- Easy to rotate keys without redeploying frontend

### 2. Human Handoff System
- Users can request human support via chat
- Admin panel shows only human-requested conversations
- Real-time admin replies via Supabase subscriptions
- Clear visual indicators for live conversations

### 3. Admin Panel Improvements
- **Filtered Sessions**: Only shows conversations with human requests
- **Status Indicators**: "Live" for active conversations, "Requested" for pending
- **Activity Feed**: Dashboard shows only human conversations
- **Message Count**: Stats only count admin messages

### 4. Chatbot Functionality
- AI-powered responses via Groq Llama 3
- Context-aware conversations
- Fallback responses for common questions
- Typing indicators and smooth UX

## 🛠️ Troubleshooting

### Chatbot not responding
1. Check browser console for errors
2. Verify Edge Function is deployed
3. Check Groq API key is set correctly
4. Ensure Supabase URL is correct in `supabase-config.js`

### Admin panel shows no conversations
1. Ensure database schema is updated
2. Check that user has clicked "Speak to a human"
3. Verify RLS policies are correctly configured
4. Check browser console for errors

### Edge Function deployment fails
1. Verify Supabase CLI is properly linked
2. Check your Supabase project is active
3. Ensure you have proper permissions
4. Try using the dashboard deployment method

### API errors in console
1. Verify Groq API key is valid
2. Check Groq API status (https://status.groq.com)
3. Ensure Edge Function has environment variable set
4. Check Edge Function logs in Supabase dashboard

## 📊 Database Schema

### chat_sessions
- `id` (TEXT, PRIMARY KEY): Session identifier
- `last_message` (TEXT): Most recent message
- `last_sender` (TEXT): Who sent last message
- `page` (TEXT): Page where chat started
- `is_admin_mode` (BOOLEAN): Whether admin is handling
- `requested_human` (BOOLEAN): Whether user requested human
- `created_at`, `updated_at`: Timestamps

### chat_messages
- `id` (UUID, PRIMARY KEY): Message identifier
- `session_id` (TEXT): Session reference
- `text` (TEXT): Message content
- `sender` (TEXT): 'user', 'bot', or 'admin'
- `created_at`: Timestamp

### admin_queue
- `id` (UUID, PRIMARY KEY): Queue entry
- `session_id` (TEXT): Session reference
- `status` (TEXT): 'pending', 'active', etc.
- `page` (TEXT): Page where requested
- `created_at`: Timestamp

### admin_replies
- `id` (UUID, PRIMARY KEY): Reply identifier
- `session_id` (TEXT): Session reference
- `text` (TEXT): Reply content
- `created_at`: Timestamp

## 🔧 Configuration Files

### supabase-config.js
Contains your Supabase URL and anon key. The chatbot dynamically constructs the Edge Function URL from this.

### chatbot.js
Main chatbot logic that:
- Builds the chat UI
- Handles user messages
- Calls the Edge Function for AI responses
- Manages human handoff requests
- Listens for admin replies

### admin.js
Admin panel logic that:
- Loads filtered chat sessions
- Handles admin replies
- Manages conversation status
- Filters dashboard stats

## 📝 Notes

- The Edge Function uses Groq's Llama 3 8B model
- Conversation history is limited to last 20 messages
- Fallback responses are available if API fails
- All chat data is stored in Supabase for analytics
- GDPR-compliant data handling

## 🚀 Future Enhancements

Potential improvements:
- Multi-language support
- Sentiment analysis
- Automated follow-up suggestions
- Chat analytics dashboard
- File sharing in conversations
- Voice input/output