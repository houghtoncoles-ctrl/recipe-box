# 🍴 The Recipe Box

A personal recipe manager with AI-powered upload, meal planning, and grocery lists.

## Features
- 📸 Upload recipes via photo, screenshot, or PDF — AI extracts everything automatically
- 🗂 Organize by Appetizer, Entrée, and Dessert
- 🍴 AI dinner assistant — ask what to make from your collection
- 📅 Weekly meal planner — AI builds your week from your recipes
- 🛒 Smart grocery list — consolidated, rounded up to real store quantities

---

## Setup

### 1. Get an Anthropic API Key
Go to [console.anthropic.com](https://console.anthropic.com/settings/keys) and create a key.

### 2. Install & run locally
```bash
npm install
cp .env.example .env
# Edit .env and paste your API key
npm run dev
```

### 3. Deploy to GitHub Pages

**Add your API key as a GitHub Secret:**
1. Go to your repo → Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Name: `VITE_ANTHROPIC_KEY`
4. Value: your Anthropic API key

**Enable GitHub Pages:**
1. Go to Settings → Pages
2. Under "Source" select **GitHub Actions**
3. Save

**Deploy:**
Push any commit to `main` — GitHub Actions will build and deploy automatically.

Your site will be live at:
`https://YOUR-USERNAME.github.io/The-Recipe-Box/`

---

## ⚠️ Security Note
Your API key is injected at **build time** and embedded in the compiled JavaScript.
This is fine for a private personal app, but don't share the built files publicly.
The `.env` file is in `.gitignore` so it will never be committed to GitHub.
