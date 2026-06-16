import RSSParser from 'rss-parser';

const parser = new RSSParser({
  timeout: 10_000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; BSEScanner/1.0)',
  },
});

const NEWS_CACHE = new Map(); // ticker → { items, fetchedAt }
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Build a Google News RSS URL for a given company name / ticker.
 */
function buildNewsUrl(companyName) {
  const query = encodeURIComponent(`${companyName} stock BSE`);
  return `https://news.google.com/rss/search?q=${query}&hl=en-IN&gl=IN&ceid=IN:en`;
}

/**
 * Fetch top N news articles for a company.
 * Returns array of { title, link, pubDate, source }.
 */
export async function fetchStockNews(ticker, companyName, limit = 5) {
  const cacheKey = ticker;
  const cached = NEWS_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.items.slice(0, limit);
  }

  const query = companyName && companyName !== ticker.replace('.BO', '')
    ? companyName
    : ticker.replace('.BO', '');

  try {
    const url = buildNewsUrl(query);
    const feed = await parser.parseURL(url);

    const items = (feed.items || []).slice(0, 10).map((item) => ({
      title: item.title || '',
      link: item.link || item.guid || '',
      pubDate: item.pubDate || item.isoDate || '',
      source: item.creator || (item.source && item.source.name) || 'Google News',
      snippet: item.contentSnippet || item.content || '',
    }));

    NEWS_CACHE.set(cacheKey, { items, fetchedAt: Date.now() });
    return items.slice(0, limit);
  } catch (err) {
    console.error(`[newsService] Failed to fetch news for ${ticker}: ${err.message}`);
    return [];
  }
}

/**
 * Fetch news for multiple stocks concurrently (with concurrency limit).
 * Returns Map<ticker, newsItems[]>
 */
export async function fetchBatchNews(stocks, limit = 5, concurrency = 5) {
  const result = new Map();
  const queue = [...stocks];

  async function worker() {
    while (queue.length > 0) {
      const stock = queue.shift();
      if (!stock) break;
      const news = await fetchStockNews(stock.ticker, stock.company_name, limit);
      result.set(stock.ticker, news);
    }
  }

  const workers = Array.from({ length: concurrency }, worker);
  await Promise.all(workers);
  return result;
}
