# Supabase Authentication Setup Guide

This MedSync application now uses **Supabase** for secure authentication and user management.

## What Changed

✅ **Login Page** - Uses Supabase `signInWithPassword`  
✅ **Signup Page** - Uses Supabase `signUp` with user metadata  
✅ **Profile Page** - Fetches user data from Supabase `getUser()`  
✅ **Sidebar** - Logout button calls Supabase `signOut()`  
✅ **ClientLayout** - Protects routes with auth checks  

## How to Set Up Supabase

### Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click "Start your project" and sign in (or create account)
3. Click "New Project"
4. Enter project details:
   - **Name**: `medsync` (or any name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to your location
5. Wait for project to initialize (2-3 minutes)

### Step 2: Get Your API Credentials

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL** - This is your `NEXT_PUBLIC_SUPABASE_URL`
   - **Anon Key** - This is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Step 3: Set Environment Variables

Create a `.env.local` file in `frontend/` directory:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Replace with your actual values from Step 2.

### Step 4: Enable Email Auth (Optional)

By default, Supabase requires email confirmation. To allow signups without confirmation:

1. Go to **Authentication** → **Providers** in Supabase
2. Click on **Email**
3. Turn **OFF** "Confirm email" (for development)
4. Turn **ON** "Confirm email" (for production)

### Step 5: Test Authentication

```bash
cd frontend
npm run dev
```

Then:
1. Go to http://localhost:3000/signup
2. Create new account with email/password
3. Sign in with that account
4. View profile with your user data

## Architecture

### Supabase Client (`lib/supabase.ts`)

```typescript
import { createBrowserClient } from "@supabase/ssr";

export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
```

This creates a browser-safe Supabase client for authentication.

### Authentication Flow

**Signup:**
```
User fills form → signUp() → Email confirmed → Redirect to /login
```

**Login:**
```
User enters credentials → signInWithPassword() → Session created → Redirect to /chat
```

**Protected Routes:**
```
User visits /chat → ClientLayout checks getUser() → Not logged in? → Redirect to /login
```

**Logout:**
```
User clicks logout → signOut() → Session cleared → Redirect to /login
```

## User Metadata

When users sign up, additional data is stored:

```javascript
signUp({
  email,
  password,
  options: {
    data: {
      full_name: "John Doe",
      blood_type: "O+",
    },
  },
});
```

This data is accessible via:

```javascript
const { data: { user } } = await supabase.auth.getUser();
user.user_metadata.full_name  // "John Doe"
user.user_metadata.blood_type // "O+"
```

## Security Best Practices

✅ **Never commit `.env` files** - Use `.gitignore`  
✅ **Anon key is public** - It's safe to expose  
✅ **Service role key is secret** - Never expose this  
✅ **Use Row Level Security (RLS)** - For database access  
✅ **Enable email confirmation** - For production  

## Troubleshooting

### "Invalid API Key"
- Check that `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
- Make sure it's in `.env.local` not `.env`
- Restart dev server: `npm run dev`

### "User not found after signup"
- Check that email confirmation is disabled (or user confirmed email)
- Check Supabase dashboard for user creation

### "signOut is not working"
- Make sure user is actually logged in: check `getUser()`
- Check browser console for errors
- Verify Supabase session in browser DevTools → Application → Cookies

### "Page redirects to login immediately"
- Check that `NEXT_PUBLIC_SUPABASE_URL` is correct
- Verify auth check in ClientLayout is working
- Check Supabase session in browser

## Production Considerations

Before deploying to production:

1. **Enable Email Confirmation** - Users must verify email
2. **Add RLS Policies** - Protect database access
3. **Use Service Role Key carefully** - Only on backend
4. **Enable MFA** - For extra security
5. **Set up Custom Domain** - For branded auth
6. **Monitor Auth Logs** - Check for suspicious activity

## References

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Supabase SSR Guide](https://supabase.com/docs/guides/auth/server-side-rendering)
- [JavaScript Client Library](https://supabase.com/docs/reference/javascript/introduction)
