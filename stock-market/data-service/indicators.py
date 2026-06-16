"""
Technical indicator computation using pandas-ta.
Accepts a DataFrame of OHLCV data and returns enriched DataFrame with indicators.
"""

import logging
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Try to import pandas_ta; fall back to manual calculations if unavailable
try:
    import pandas_ta as ta
    PANDAS_TA_AVAILABLE = True
except ImportError:
    PANDAS_TA_AVAILABLE = False
    logger.warning("pandas-ta not available; using manual indicator calculations")


def compute_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """
    Given a DataFrame with columns [Open, High, Low, Close, Volume],
    compute and append: RSI, SMA50, SMA200, EMA20, avg_volume_20, volume_surge_pct.

    Returns the DataFrame with additional columns appended.
    Requires at least 50 rows for meaningful indicators.
    """
    if len(df) < 20:
        return df

    df = df.copy()

    if PANDAS_TA_AVAILABLE:
        # RSI(14)
        df["RSI"] = ta.rsi(df["Close"], length=14)
        # Moving averages
        df["SMA50"] = ta.sma(df["Close"], length=50) if len(df) >= 50 else np.nan
        df["SMA200"] = ta.sma(df["Close"], length=200) if len(df) >= 200 else np.nan
        df["EMA20"] = ta.ema(df["Close"], length=20)
    else:
        df["RSI"] = _manual_rsi(df["Close"], 14)
        df["SMA50"] = df["Close"].rolling(50).mean() if len(df) >= 50 else np.nan
        df["SMA200"] = df["Close"].rolling(200).mean() if len(df) >= 200 else np.nan
        df["EMA20"] = df["Close"].ewm(span=20, adjust=False).mean()

    # 20-day average volume and volume surge
    df["avg_volume_20"] = df["Volume"].rolling(20).mean()
    last_volume = df["Volume"].iloc[-1]
    avg_vol = df["avg_volume_20"].iloc[-1]
    df["volume_surge_pct"] = (
        ((last_volume / avg_vol) - 1) * 100 if avg_vol and avg_vol > 0 else 0.0
    )

    return df


def _manual_rsi(series: pd.Series, length: int = 14) -> pd.Series:
    """Wilder's RSI without pandas-ta."""
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / length, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def extract_signals(df: pd.DataFrame, ticker: str) -> dict | None:
    """
    Extract the latest signal snapshot from an indicator-enriched DataFrame.
    Returns a dict of key metrics, or None if data is insufficient.
    """
    if df is None or len(df) < 20:
        return None

    try:
        last = df.iloc[-1]
        high_52w = df["High"].rolling(min(252, len(df))).max().iloc[-1]
        low_52w = df["Low"].rolling(min(252, len(df))).min().iloc[-1]
        current_price = float(last["Close"])

        if high_52w <= 0 or low_52w <= 0:
            return None

        pct_from_high = ((current_price - high_52w) / high_52w) * 100   # negative
        pct_from_low = ((current_price - low_52w) / low_52w) * 100      # positive

        # Golden cross: SMA50 > SMA200 (only if both are available)
        sma50 = float(last.get("SMA50", np.nan))
        sma200 = float(last.get("SMA200", np.nan))
        golden_cross = bool(not np.isnan(sma50) and not np.isnan(sma200) and sma50 > sma200)
        death_cross = bool(not np.isnan(sma50) and not np.isnan(sma200) and sma50 < sma200)

        rsi = float(last.get("RSI", np.nan))
        ema20 = float(last.get("EMA20", np.nan))
        volume_surge_pct = float(last.get("volume_surge_pct", 0))

        # Price vs EMA20 position
        above_ema20 = bool(not np.isnan(ema20) and current_price > ema20)

        # Return calculation (1 month)
        if len(df) >= 22:
            month_ago_price = float(df["Close"].iloc[-22])
            return_1m = ((current_price - month_ago_price) / month_ago_price) * 100
        else:
            return_1m = None

        # Return 3 months
        if len(df) >= 66:
            three_mo_price = float(df["Close"].iloc[-66])
            return_3m = ((current_price - three_mo_price) / three_mo_price) * 100
        else:
            return_3m = None

        signals = []
        if pct_from_low <= 5:
            signals.append("NEAR_52W_LOW")
        if pct_from_high >= -5:
            signals.append("NEAR_52W_HIGH")
        if not np.isnan(rsi):
            if rsi < 35:
                signals.append("OVERSOLD")
            elif rsi > 65:
                signals.append("OVERBOUGHT")
        if volume_surge_pct > 150:
            signals.append("VOLUME_SURGE")
        if golden_cross:
            signals.append("GOLDEN_CROSS")
        if death_cross:
            signals.append("DEATH_CROSS")

        return {
            "ticker": ticker,
            "current_price": round(current_price, 2),
            "high_52w": round(float(high_52w), 2),
            "low_52w": round(float(low_52w), 2),
            "pct_from_high": round(float(pct_from_high), 2),
            "pct_from_low": round(float(pct_from_low), 2),
            "rsi": round(rsi, 2) if not np.isnan(rsi) else None,
            "sma50": round(sma50, 2) if not np.isnan(sma50) else None,
            "sma200": round(sma200, 2) if not np.isnan(sma200) else None,
            "ema20": round(ema20, 2) if not np.isnan(ema20) else None,
            "volume_surge_pct": round(volume_surge_pct, 2),
            "golden_cross": golden_cross,
            "death_cross": death_cross,
            "above_ema20": above_ema20,
            "return_1m": round(float(return_1m), 2) if return_1m is not None else None,
            "return_3m": round(float(return_3m), 2) if return_3m is not None else None,
            "signals": signals,
        }
    except Exception as e:
        logger.error(f"Signal extraction failed for {ticker}: {e}")
        return None
