"""
Core BSE stock scanner using Kite Connect.
- Fetches 1-year daily OHLCV for each BSE instrument via kite.historical_data()
- Respects Kite rate limit: max 3 requests/second for historical API
- Computes technical indicators (RSI, SMA, EMA, volume surge)
- Filters for signal-bearing stocks
- Note: Kite Connect does not provide fundamentals (P/E, EPS, etc.)
  Scoring is purely technical when using Kite.
"""

import asyncio
import logging
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from cache import (
    update_scan_progress, finish_scan_job, fail_scan_job, create_scan_job,
)
from bse_stocks import get_tickers
from indicators import compute_indicators, extract_signals

logger = logging.getLogger(__name__)

# Kite historical API: max 3 requests/second on free plan
RATE_LIMIT_SLEEP = 0.35   # ~2.85 req/sec (under 3 limit)
PROGRESS_EVERY = 50       # emit progress update every N stocks


def _classify_market_cap(market_cap: float | None) -> str:
    if market_cap is None:
        return "unknown"
    if market_cap >= 200_000_000_000:
        return "large_cap"
    if market_cap >= 50_000_000_000:
        return "mid_cap"
    return "small_cap"


def _compute_score(signal: dict) -> int:
    """
    Rule-based technical-only scoring 0–100.
    (Fundamentals are unavailable via Kite Connect free API.)
    """
    score = 50

    pct_from_low = signal.get("pct_from_low", 100)
    pct_from_high = signal.get("pct_from_high", -100)
    rsi = signal.get("rsi")
    volume_surge = signal.get("volume_surge_pct", 0)
    golden_cross = signal.get("golden_cross", False)
    death_cross = signal.get("death_cross", False)
    above_ema20 = signal.get("above_ema20", False)
    return_1m = signal.get("return_1m")
    return_3m = signal.get("return_3m")

    # ── 52-week position ───────────────────────────────────────────────────────
    if pct_from_low <= 5:
        score += 20
    elif pct_from_low <= 15:
        score += 8
    if pct_from_high >= -5:
        score += 15
    elif pct_from_high >= -15:
        score += 6

    # ── RSI ────────────────────────────────────────────────────────────────────
    if rsi is not None:
        if rsi < 30:
            score += 22
        elif rsi < 35:
            score += 15
        elif rsi < 40:
            score += 8
        elif rsi > 75:
            score -= 10
        elif rsi > 65:
            score += 8

    # ── Volume ────────────────────────────────────────────────────────────────
    if volume_surge > 300:
        score += 18
    elif volume_surge > 150:
        score += 12
    elif volume_surge > 75:
        score += 5

    # ── Moving averages / trend ────────────────────────────────────────────────
    if golden_cross:
        score += 15
    if death_cross:
        score -= 12
    if above_ema20:
        score += 6

    # ── Returns ───────────────────────────────────────────────────────────────
    if return_1m is not None:
        if return_1m > 10:
            score += 8
        elif return_1m < -15:
            score -= 8
    if return_3m is not None:
        if return_3m > 20:
            score += 6
        elif return_3m < -25:
            score -= 6

    return max(0, min(100, score))


def _fetch_ohlcv(instrument_token: int, tradingsymbol: str) -> pd.DataFrame | None:
    """
    Fetch 1 year of daily OHLCV data from Kite for a single instrument.
    Returns a DataFrame with columns: Open, High, Low, Close, Volume
    or None if the fetch fails / data is insufficient.
    """
    from kite_client import get_kite
    try:
        kite = get_kite()
        to_date = datetime.now().date()
        from_date = to_date - timedelta(days=365)

        rows = kite.historical_data(
            instrument_token=instrument_token,
            from_date=str(from_date),
            to_date=str(to_date),
            interval="day",
            continuous=False,
            oi=False,
        )

        if not rows or len(rows) < 20:
            return None

        df = pd.DataFrame(rows)
        df = df.rename(columns={
            "date": "Date",
            "open": "Open",
            "high": "High",
            "low": "Low",
            "close": "Close",
            "volume": "Volume",
        })
        df = df.set_index("Date")[["Open", "High", "Low", "Close", "Volume"]]
        df = df.dropna()
        return df

    except Exception as e:
        logger.debug(f"OHLCV fetch failed for {tradingsymbol} (token {instrument_token}): {e}")
        return None


async def run_scan(job_id: str, mode: str = "bse500") -> None:
    """
    Main async scan function. Runs as a FastAPI background task.
    mode: 'sensex30' | 'bse500' | 'full'
    """
    from kite_client import get_kite, is_authenticated
    if not is_authenticated():
        fail_scan_job(job_id, "Kite Connect not authenticated. Visit /auth/login first.")
        return

    instruments = get_tickers(mode)
    total = len(instruments)
    create_scan_job(job_id, mode, total)
    logger.info(f"[{job_id}] Starting scan: {total} instruments, mode={mode}")

    all_signals: list[dict] = []
    processed = 0

    # ── Fetch OHLCV + compute indicators for each instrument ──────────────────
    for tradingsymbol, instrument_token in instruments:
        try:
            # Run blocking Kite call in thread pool to avoid blocking event loop
            df = await asyncio.to_thread(_fetch_ohlcv, instrument_token, tradingsymbol)

            if df is not None and len(df) >= 20:
                df = compute_indicators(df)
                signal = extract_signals(df, tradingsymbol)
                if signal and signal.get("signals"):
                    # Enrich with company name from instruments list (no API call needed)
                    signal["company_name"] = tradingsymbol
                    signal["fundamentals"] = {}
                    signal["market_cap_category"] = "unknown"
                    signal["sector"] = "Unknown"
                    signal["industry"] = "Unknown"
                    signal["score"] = _compute_score(signal)
                    all_signals.append(signal)

        except Exception as e:
            logger.debug(f"[{job_id}] Failed to process {tradingsymbol}: {e}")

        processed += 1

        if processed % PROGRESS_EVERY == 0:
            update_scan_progress(job_id, processed)
            logger.info(
                f"[{job_id}] {processed}/{total} | Signals so far: {len(all_signals)}"
            )

        # Respect Kite's 3 req/sec rate limit
        await asyncio.sleep(RATE_LIMIT_SLEEP)

    # ── Sort by score ─────────────────────────────────────────────────────────
    all_signals.sort(key=lambda x: x.get("score", 0), reverse=True)

    logger.info(
        f"[{job_id}] Scan complete. {len(all_signals)} candidates with signals. "
        f"Top score: {all_signals[0]['score'] if all_signals else 'N/A'}"
    )
    finish_scan_job(job_id, all_signals)

BATCH_SLEEP = 2.0         # seconds between batches to avoid rate limiting
FUND_BATCH_SIZE = 10      # fundamentals fetched per mini-batch
