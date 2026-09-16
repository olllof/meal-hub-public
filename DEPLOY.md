# Deploying to Vercel

## Prerequisites
1. Supabase project created
2. Vercel account created

## Step 1: Create Database Tables in Supabase

Go to your Supabase dashboard and run this SQL in the SQL Editor:

```sql
CREATE TABLE meals (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO meals (id, data) VALUES (
  'main',
  '{"weeks":[],"lastRefresh":null,"mealBackups":[],"logEntries":[],"shoppingItems":[]}'
);
```

## Step 2: Deploy to Vercel

1. Push your code to GitHub
2. Go to vercel.com and sign up/login
3. Click "New Project"
4. Import your GitHub repository
5. When prompted, add these environment variables:
   - `SUPABASE_URL`: https://kzhltdheizynqhbngdxa.supabase.co
   - `SUPABASE_KEY`: (your anon key from Supabase)
6. Click "Deploy"

## Step 3: Connect Your Domain

1. In Vercel project settings, go to "Domains"
2. Add `meal-planner.olofekman.com`
3. Follow Vercel's instructions to update your DNS

## Environment Variables

These are set in Vercel's project settings:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_KEY` - Your Supabase anonymous public key

## Notes

- WebSockets are disabled (Vercel free tier limitation)
- Picnic integration temporarily disabled during migration
- All data is now stored in Supabase PostgreSQL instead of local JSON files
- Updates are no longer real-time between devices - refresh to see changes
