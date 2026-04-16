# 🌾 AgroBot AI

AI-powered agricultural chatbot for Bangladeshi farmers. Built for [agro.com.bd](https://agro-com-bd.vercel.app).

## Features

- ✅ **Agro-Only Filter** — Only answers agriculture-related questions
- ✅ **Bilingual** — Supports Bengali (বাংলা) and English
- ✅ **AI-Powered** — Uses Google Gemini 2.5 Flash
- ✅ **Cost-Efficient** — Caches responses to save API costs
- ✅ **Rate Limited** — Prevents abuse (10/hour, 100/day per user)
- ✅ **Facebook Messenger** — Integrated chatbot for your FB page
- ✅ **Free Hosting** — Vercel + Supabase free tiers

## Tech Stack

- **Frontend:** Next.js 14, React, Tailwind CSS
- **Backend:** Next.js API Routes
- **AI:** Google Gemini 2.5 Flash
- **Database:** Supabase (PostgreSQL)
- **Hosting:** Vercel

---

## 🚀 Quick Deploy

### Step 1: Set Up Supabase Database

1. Go to your Supabase project dashboard
2. Click **SQL Editor** → **New Query**
3. Paste the contents of `supabase-schema.sql`
4. Click **Run**

### Step 2: Deploy to Vercel

1. Push this code to your GitHub repo
2. Go to [vercel.com](https://vercel.com)
3. Click **Add New → Project**
4. Import your `agro-ai` repository
5. Add Environment Variables (from `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`
   - `META_VERIFY_TOKEN` (any random string)
   - `META_PAGE_ACCESS_TOKEN` (from Facebook)
6. Click **Deploy**

### Step 3: Set Up Facebook Messenger

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create a new app → Select "Business"
3. Add **Messenger** product
4. Generate Page Access Token
5. Set up Webhook:
   - Callback URL: `https://your-app.vercel.app/api/webhook/meta`
   - Verify Token: Your `META_VERIFY_TOKEN`
   - Subscribe to: `messages`, `messaging_postbacks`

---

## 📁 Project Structure

```
agrobot-ai/
├── app/
│   ├── api/
│   │   ├── chat/route.js         # Website chat API
│   │   └── webhook/meta/route.js # Facebook webhook
│   ├── layout.js
│   ├── page.js                   # Main chat UI
│   └── globals.css
├── lib/
│   ├── supabase.js               # Database client
│   ├── gemini.js                 # AI + agro filter
│   └── rate-limiter.js           # Usage control
├── .env.example
├── supabase-schema.sql
└── README.md
```

---

## 🔒 Rate Limits

| Limit | Value | Purpose |
|-------|-------|---------|
| Per user / hour | 10 | Prevent spam |
| Per user / day | 100 | Fair usage |
| Global / day | 500 | Cost control |

---

## 💰 Cost Estimate

| Service | Free Tier | Your Usage | Cost |
|---------|-----------|------------|------|
| Vercel | 100K requests | ~5K/month | $0 |
| Supabase | 500MB DB | ~50MB | $0 |
| Gemini | 60 req/min | ~500/day | $0 |
| **Total** | | | **$0** |

---

## 🤝 Integration with agro.com.bd

To embed AgroBot in your main website:

```html
<iframe 
  src="https://your-agrobot.vercel.app" 
  width="400" 
  height="600"
  style="border: none; border-radius: 16px;"
></iframe>
```

Or use the API directly:

```javascript
const response = await fetch('https://your-agrobot.vercel.app/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    question: 'ধান চাষে কোন সার ব্যবহার করব?',
    userId: 'user123',
    platform: 'web'
  })
});

const data = await response.json();
console.log(data.response);
```

---

## 📞 Support

For issues or questions, contact: admin@agro.com.bd

---

Made with 💚 for Bangladeshi farmers
