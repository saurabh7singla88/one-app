# BSE Indian Stock Scanner

Scan all BSE-listed stocks for 52-week highs/lows, RSI, volume surge, golden cross, and AI-powered recommendations via Google Gemini. Powered by **Kite Connect** (official Zerodha API) for reliable BSE data.

## Architecture

```
stock-market/
├── data-service/    Python FastAPI — Kite Connect data, technical indicators, scan jobs
├── backend/         Node.js Express — orchestration, Google News RSS, Gemini AI, scoring
└── frontend/        Next.js 15 — dashboard + detail pages
```

## Prerequisites

- **Python 3.11+**
- **Node.js 20+**
- **Zerodha trading account** — needed for Kite Connect API access
- **Kite Connect Personal API app** (free) — https://developers.kite.trade/
- **Google Gemini API key** (free) — https://aistudio.google.com/apikey

## Setup

### 1. Create a Kite Connect App

1. Go to https://developers.kite.trade/ and log in with your Zerodha account
2. Click **Create new app** → choose **Personal** (free tier)
3. Set the **Redirect URL** to: `http://127.0.0.1:8000/auth/callback`
4. Copy your **API Key** and **API Secret**

### 2. Python Data Service

```bash
cd data-service
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — add your KITE_API_KEY and KITE_API_SECRET
```

### 3. Node.js Backend

```bash
cd backend
cp .env.example .env
# Edit .env — add your GEMINI_API_KEY
npm install
```

### 4. Next.js Frontend

```bash
cd frontend
npm install
```

## Running Locally

Open 3 terminal tabs:

**Tab 1 — Data Service (port 8000)**
```bash
cd data-service
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

**Tab 2 — Backend (port 3001)**
```bash
cd backend
npm run dev
```

**Tab 3 — Frontend (port 3000)**
```bash
cd frontend
npm run dev
```

Open http://localhost:3000

### Authenticate Kite Connect (once per day)

The Kite access token expires at **6:00 AM IST** daily. To authenticate:

1. Open http://localhost:8000/auth/login in your browser
2. Log in with your Zerodha credentials
3. You'll be redirected back and see a success message
4. You only need to do this once per trading day

You can also check auth status at http://localhost:8000/auth/status

## Usage

1. Click **Start Scan** and choose your universe:
   - **Sensex 50** — ~50 large caps, ~2 minutes
   - **BSE 500** — ~600 stocks, ~15 minutes *(recommended)*
   - **All BSE** — ~5000+ stocks, ~45 minutes

2. Watch the progress bar. Results are cached — subsequent scans on already-cached data are faster.

3. Use **filters** to narrow by signal type (Near 52W Low, Oversold, Volume Surge, etc.), market cap, or minimum score.

4. Click any stock for a **detail page** with:
   - Full technical + fundamental metrics
   - Google News headlines
   - **Gemini AI recommendation** (BUY / HOLD / SELL / WATCH)

## Scoring System (0–100)

| Signal | Points |
|--------|--------|
| Near 52W Low (≤5%) | +20 |
| Near 52W High (≥95%) | +15 |
| RSI < 30 (very oversold) | +22 |
| RSI < 35 (oversold) | +15 |
| RSI > 65 (momentum) | +8 |
| RSI > 75 (overbought) | −10 |
| Volume Surge > 300% | +18 |
| Volume Surge > 150% | +12 |
| Golden Cross (SMA50 > SMA200) | +15 |
| Death Cross | −12 |
| Above EMA20 | +6 |
| P/E < 15 (deep value) | +12 |
| P/E > 60 (very expensive) | −18 |
| Earnings Growth > 25% | +10 |

## Environment Variables

### data-service/.env
```
KITE_API_KEY=your_kite_api_key_here
KITE_API_SECRET=your_kite_api_secret_here
```

### backend/.env
```
PYTHON_SERVICE_URL=http://localhost:8000
GEMINI_API_KEY=your_key_here
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### frontend/.env.local
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Data Sources

- **Stock prices/OHLCV**: Yahoo Finance via `yfinance` (BSE suffix `.BO`)
- **BSE stock list**: BSE Bhavcopy daily CSV (auto-refreshed every 24h)
- **News**: Google News RSS (no API key required)
- **AI analysis**: Google Gemini 2.0 Flash

## Notes

- Yahoo Finance data is for personal/research use per their ToS
- Fundamentals (P/E, market cap, etc.) are fetched only for the top 200 signal candidates to avoid rate limits
- Cache is stored in `data-service/data/cache.db` (SQLite); delete to force a full refresh
- All scores and AI analysis are informational only — not financial advice
