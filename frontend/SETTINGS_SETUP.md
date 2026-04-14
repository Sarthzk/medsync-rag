# Settings Page - Supabase Setup

The Settings page is now fully functional with Supabase. Here's what you need to set up:

## Required: Create the `user_settings` Table

The Settings page requires a `user_settings` table in your Supabase database. This stores user preferences.

### Step 1: Create the Table in Supabase

1. Go to your Supabase dashboard
2. Click **SQL Editor** on the left
3. Click **New Query**
4. Paste this SQL:

```sql
CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_analysis_enabled BOOLEAN NOT NULL DEFAULT true,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  privacy_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create index for faster queries
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);

-- Enable RLS (Row Level Security)
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only read/write their own settings
CREATE POLICY "Users can read own settings"
  ON user_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

4. Click **Run** (or press Ctrl+Enter)
5. You should see "Success" message

## What Each Setting Does

### 🤖 AI Document Analysis
- **Toggle**: ON/OFF
- **Stores in**: `ai_analysis_enabled` column
- **Purpose**: Controls whether the RAG system indexes your vault documents
- **Saves automatically** with "Saved" toast message

### � Privacy Mode
- **Toggle**: ON/OFF
- **Stores in**: `privacy_enabled` column
- **Purpose**: Hides sensitive vitals from the Overview dashboard
- **Saves automatically** with "Saved" toast message

### �🔔 Health Reminders
- **Toggle**: ON/OFF  
- **Stores in**: `notifications_enabled` column
- **Purpose**: Controls whether you receive notification reminders
- **Saves automatically** with "Saved" toast message

### 📥 Data Export
- **Button**: Click "Export"
- **Downloads**: `medsync-export.json` with:
  - Export timestamp
  - User email and name
  - Current settings
  - List of uploaded files
- **No storage required** - just downloads to your computer

### 🗑️ Delete Account
- **Button**: Click "Delete Forever"
- **Shows confirmation modal** requiring you to type "DELETE"
- **Signs you out** and redirects to signup
- **Note**: Actual account deletion requires backend implementation with Supabase admin API

## How It Works

### Loading Settings
When you visit the Settings page:
1. Checks if you're logged in (redirects to /login if not)
2. Fetches your user data with `getUser()`
3. Queries the `user_settings` table for your preferences
4. If no settings exist, uses defaults (all features ON)

### Saving Settings
When you toggle a setting:
1. Updates local state immediately (fast UI)
2. Calls `upsert()` to save to Supabase
3. Shows "Saved" toast message
4. If error, shows "Failed to save" message

### Data Export
When you click Export:
1. Fetches your uploaded file list from `/api/files`
2. Compiles all data into JSON object
3. Opens browser download dialog
4. Saves as `medsync-export.json`

### Data Safety
✅ **Row Level Security (RLS)** - You can only see/modify your own settings  
✅ **User ID tied to auth** - Settings automatically linked to your account  
✅ **Auto-cascade delete** - Settings deleted when account is deleted  

## Testing the Settings

```bash
cd frontend
npm run dev
```

Then:
1. Sign up for a new account
2. Go to http://localhost:3000/settings
3. Toggle "AI Document Analysis" - should see "Saved"
4. Toggle "Health Reminders" - should see "Saved"
5. Click "Export" - should download JSON file
6. Click "Delete Forever" - should show confirmation modal

## Troubleshooting

### "Settings not loading"
- Check that `user_settings` table exists in Supabase
- Check RLS policies are enabled
- Check user is logged in: DevTools → Application → Cookies → `sb-auth-token`

### "Failed to save" message
- Check network in DevTools
- Check RLS policy allows INSERT/UPDATE
- Check Supabase API is accessible

### "Cannot export data"
- Check `/api/files` endpoint is working
- Check that you have uploaded some files
- Check network connectivity

### Export file is empty
- No error means export worked
- Check browser's Downloads folder
- File should be named `medsync-export.json`

## Future Enhancements

To fully implement account deletion, create a backend endpoint:

```typescript
// api/delete-account/route.ts
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Secret - backend only!
  );

  const user = await supabase.auth.getUser();
  
  // Delete with service role permissions
  await supabase.auth.admin.deleteUser(user.id);
  
  return { success: true };
}
```

This ensures deletion is secure and authorized.

## Environment Variables

Make sure your `.env.local` has:
```
NEXT_PUBLIC_SUPABASE_URL=your-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
```

No additional env vars needed for Settings page.
