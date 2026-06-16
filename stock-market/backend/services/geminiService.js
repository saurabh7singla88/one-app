import { GoogleGenAI } from '@google/genai';

let genaiClient = null;

function getClient() {
  if (!genaiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    genaiClient = new GoogleGenAI({ apiKey });
  }
  return genaiClient;
}

const MODEL = 'gemini-2.0-flash';

/**
 * Generate an AI analysis for a stock given its metrics and recent news.
 * Returns { summary, recommendation, confidence, keyFactors }.
 */
export async function analyzeStock(stock, newsItems) {
  const client = getClient();

  const newsText = newsItems.length > 0
    ? newsItems.map((n, i) => `${i + 1}. ${n.title} (${n.pubDate})`).join('\n')
    : 'No recent news available.';

  const fundamentals = stock.fundamentals || {};

  const prompt = `You are a financial analyst specializing in Indian equities (BSE-listed stocks).

Analyze the following stock and provide a concise recommendation:

**Stock:** ${stock.company_name || stock.ticker} (${stock.ticker})
**Sector:** ${stock.sector || 'Unknown'} | **Industry:** ${stock.industry || 'Unknown'}
**Market Cap Category:** ${stock.market_cap_category || 'Unknown'}

**Technical Signals:**
- Current Price: ₹${stock.current_price}
- 52-Week High: ₹${stock.high_52w} | 52-Week Low: ₹${stock.low_52w}
- % from 52W High: ${stock.pct_from_high}% | % from 52W Low: +${stock.pct_from_low}%
- RSI (14): ${stock.rsi ?? 'N/A'}
- SMA50: ₹${stock.sma50 ?? 'N/A'} | SMA200: ₹${stock.sma200 ?? 'N/A'}
- EMA20: ₹${stock.ema20 ?? 'N/A'}
- Volume Surge: ${stock.volume_surge_pct}% vs 20-day avg
- 1-Month Return: ${stock.return_1m ?? 'N/A'}% | 3-Month Return: ${stock.return_3m ?? 'N/A'}%
- Active Signals: ${(stock.signals || []).join(', ') || 'None'}

**Fundamental Data:**
- P/E Ratio: ${fundamentals.pe_ratio ?? 'N/A'}
- EPS: ₹${fundamentals.eps ?? 'N/A'}
- Earnings Growth (YoY): ${fundamentals.earnings_growth != null ? (fundamentals.earnings_growth * 100).toFixed(1) + '%' : 'N/A'}
- Profit Margin: ${fundamentals.profit_margin != null ? (fundamentals.profit_margin * 100).toFixed(1) + '%' : 'N/A'}
- Beta: ${fundamentals.beta ?? 'N/A'}
- Dividend Yield: ${fundamentals.dividend_yield != null ? (fundamentals.dividend_yield * 100).toFixed(2) + '%' : 'N/A'}

**Recent News Headlines:**
${newsText}

**Rule-Based Score:** ${stock.score}/100

Respond ONLY with a valid JSON object (no markdown, no code blocks) with this exact structure:
{
  "recommendation": "BUY" | "HOLD" | "SELL" | "WATCH",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "summary": "2-3 sentence analysis of the stock's current position and outlook",
  "keyFactors": ["factor1", "factor2", "factor3"],
  "risks": ["risk1", "risk2"]
}`;

  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 512,
      },
    });

    const text = response.text?.trim() || '';

    // Strip markdown code fences if present
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return {
      recommendation: parsed.recommendation || 'HOLD',
      confidence: parsed.confidence || 'LOW',
      summary: parsed.summary || '',
      keyFactors: parsed.keyFactors || [],
      risks: parsed.risks || [],
    };
  } catch (err) {
    console.error(`[geminiService] Analysis failed for ${stock.ticker}: ${err.message}`);
    return {
      recommendation: 'HOLD',
      confidence: 'LOW',
      summary: 'AI analysis unavailable at this time.',
      keyFactors: [],
      risks: [],
    };
  }
}

/**
 * Generate a brief market summary for the top N stocks.
 */
export async function generateMarketSummary(topStocks) {
  const client = getClient();

  const stockList = topStocks.slice(0, 10).map((s, i) =>
    `${i + 1}. ${s.company_name || s.ticker} — Score: ${s.score}, Signals: ${(s.signals || []).join(', ')}`
  ).join('\n');

  const prompt = `You are a financial analyst covering Indian equities (BSE).

Based on these top-scoring stocks from today's scan:
${stockList}

Write a 3-4 sentence market commentary about current opportunities and themes. Be specific and data-driven.

Respond with plain text only, no JSON, no bullet points.`;

  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { temperature: 0.5, maxOutputTokens: 256 },
    });
    return response.text?.trim() || '';
  } catch (err) {
    console.error(`[geminiService] Market summary failed: ${err.message}`);
    return '';
  }
}
