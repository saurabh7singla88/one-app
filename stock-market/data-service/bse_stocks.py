"""
BSE stock list management via Kite Connect instruments endpoint.

Kite's instruments("BSE") call returns all BSE-listed instruments with:
  instrument_token, tradingsymbol, name, instrument_type, segment, exchange

We cache this in SQLite (via cache.py) for 24h to avoid redundant API calls.
"""

import logging
import os
from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

INSTRUMENTS_PATH = DATA_DIR / "bse_instruments.parquet"
INSTRUMENTS_TTL_HOURS = 24

# ── Fallback hardcoded lists (used if Kite is not authenticated yet) ───────────

SENSEX_30_SYMBOLS = [
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK",
    "BAJAJ-AUTO", "BAJAJFINSV", "BAJFINANCE", "BHARTIARTL", "BPCL",
    "BRITANNIA", "CIPLA", "COALINDIA", "DIVISLAB", "DRREDDY",
    "EICHERMOT", "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE",
    "HEROMOTOCO", "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDUSINDBK",
    "INFY", "ITC", "JSWSTEEL", "KOTAKBANK", "LT",
    "M&M", "MARUTI", "NESTLEIND", "NTPC", "ONGC",
    "POWERGRID", "RELIANCE", "SBILIFE", "SBIN", "SUNPHARMA",
    "TATACONSUM", "TATAMOTORS", "TATASTEEL", "TCS", "TECHM",
    "TITAN", "ULTRACEMCO", "UPL", "WIPRO",
]


def load_bse_instruments(force_refresh: bool = False) -> pd.DataFrame:
    """
    Load BSE EQ instruments from Kite, caching locally for 24h.

    Returns DataFrame with columns:
      instrument_token (int), tradingsymbol (str), name (str), exchange (str)
    """
    if not force_refresh and INSTRUMENTS_PATH.exists():
        age_hours = (datetime.now().timestamp() - os.path.getmtime(INSTRUMENTS_PATH)) / 3600
        if age_hours < INSTRUMENTS_TTL_HOURS:
            logger.info(f"Loading BSE instruments from cache ({age_hours:.1f}h old)")
            return pd.read_parquet(INSTRUMENTS_PATH)

    try:
        from kite_client import get_kite
        kite = get_kite()
        logger.info("Fetching BSE instruments from Kite Connect...")
        raw = kite.instruments(exchange="BSE")

        df = pd.DataFrame(raw)

        # Keep only equity instruments on BSE
        df = df[
            (df["instrument_type"] == "EQ") &
            (df["exchange"] == "BSE")
        ][["instrument_token", "tradingsymbol", "name", "exchange"]].copy()

        df["instrument_token"] = df["instrument_token"].astype(int)
        df = df.drop_duplicates(subset=["tradingsymbol"]).reset_index(drop=True)

        df.to_parquet(INSTRUMENTS_PATH, index=False)
        logger.info(f"Loaded {len(df)} BSE EQ instruments from Kite")
        return df

    except Exception as e:
        logger.warning(f"Could not load instruments from Kite: {e}. Using fallback list.")
        return _fallback_instruments()


def _fallback_instruments() -> pd.DataFrame:
    """Return a minimal hardcoded instrument list (no real tokens — for auth check only)."""
    rows = [
        {"instrument_token": 0, "tradingsymbol": s, "name": s, "exchange": "BSE"}
        for s in SENSEX_30_SYMBOLS
    ]
    return pd.DataFrame(rows)


def get_instrument_token_map(force_refresh: bool = False) -> dict[str, int]:
    """Return {tradingsymbol: instrument_token} mapping for BSE EQ instruments."""
    df = load_bse_instruments(force_refresh=force_refresh)
    return dict(zip(df["tradingsymbol"], df["instrument_token"]))


def get_tickers(mode: str = "bse500") -> list[tuple[str, int]]:
    """
    Return list of (tradingsymbol, instrument_token) tuples.
    mode: 'sensex30' | 'bse500' | 'full'
    """
    df = load_bse_instruments()
    token_map = dict(zip(df["tradingsymbol"], df["instrument_token"]))

    if mode == "sensex30":
        symbols = [s for s in SENSEX_30_SYMBOLS if s in token_map]
        return [(s, token_map[s]) for s in symbols]

    if mode == "bse500":
        # Heuristic: Kite returns ~5000 BSE EQ instruments; take first 600 by index
        # (actual BSE 500 would need a separate index file — this gives a representative set)
        subset = df.head(600)
        return list(zip(subset["tradingsymbol"], subset["instrument_token"]))

    # full: all BSE EQ instruments
    return list(zip(df["tradingsymbol"], df["instrument_token"]))


logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

SYMBOL_MAP_PATH = DATA_DIR / "bse_symbols.csv"
BHAVCOPY_URL = "https://www.bseindia.com/download/BhavCopy/Equity/EQ{date_str}_CSV.ZIP"

# Fallback: well-known BSE large-cap stocks for quick-scan mode
SENSEX_30 = [
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK",
    "BAJAJ-AUTO", "BAJAJFINSV", "BAJFINANCE", "BHARTIARTL", "BPCL",
    "BRITANNIA", "CIPLA", "COALINDIA", "DIVISLAB", "DRREDDY",
    "EICHERMOT", "GRASIM", "HCLTECH", "HDFCBANK", "HDFCLIFE",
    "HEROMOTOCO", "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDUSINDBK",
    "INFY", "ITC", "JSWSTEEL", "KOTAKBANK", "LT",
    "M&M", "MARUTI", "NESTLEIND", "NTPC", "ONGC",
    "POWERGRID", "RELIANCE", "SBILIFE", "SBIN", "SUNPHARMA",
    "TATACONSUM", "TATAMOTORS", "TATASTEEL", "TCS", "TECHM",
    "TITAN", "ULTRACEMCO", "UPL", "WIPRO",
]

BSE500_EXTRAS = [
    "ABB", "ABBOTINDIA", "ABCAPITAL", "ABFRL", "ACC", "AFFLE", "AIAENG",
    "AJANTPHARM", "ALKEM", "ALKYLAMINE", "AMARAJABAT", "AMBUJACEM",
    "ANGELONE", "APLAPOLLO", "ASTRAL", "ATUL", "AUBANK", "AUROPHARMA",
    "BALKRISIND", "BANDHANBNK", "BANKBARODA", "BEL", "BERGEPAINT",
    "BHARATFORG", "BIOCON", "BOSCHLTD", "BSE", "CAMS", "CANFINHOME",
    "CANBK", "CDSL", "CHAMBLFERT", "CHOLAFIN", "CRISIL", "CROMPTON",
    "CUMMINSIND", "DABUR", "DALBHARAT", "DEEPAKNTR", "DELTACORP",
    "DMART", "ELGIEQUIP", "EMAMILTD", "ESCORTS", "EXIDEIND",
    "FEDERALBNK", "FINEORG", "FLUOROCHEM", "FORTIS", "GAIL",
    "GICRE", "GILLETTE", "GLAXO", "GLENMARK", "GODREJCP",
    "GODREJIND", "GODREJPROP", "GRANULES", "GSPL", "HAPPSTMNDS",
    "HAVELLS", "HDFC", "HFCL", "HINDPETRO", "HONAUT",
    "IEX", "IPCALAB", "IRCTC", "ISEC", "JINDALSTEL",
    "JUBLFOOD", "JUBLINGREA", "KAJARIACER", "KANSAINER", "KPIL",
    "KRBL", "L&TFH", "LALPATHLAB", "LAURUSLABS", "LICHSGFIN",
    "LINDEINDIA", "LTIM", "LTTS", "LUPIN", "MARICO",
    "MCDOWELL-N", "MCX", "METROPOLIS", "MFSL", "MGL",
    "MINDTREE", "MPHASIS", "MRF", "MUTHOOTFIN", "NAUKRI",
    "NAVINFLUOR", "NBCC", "NCC", "NIACL", "NMDC",
    "OBEROIRLTY", "OFSS", "OIL", "PAGEIND", "PEL",
    "PERSISTENT", "PETRONET", "PFC", "PIIND", "PIDILITIND",
    "PNB", "POLYCAB", "POLYMED", "PRAJIND", "PRICOL",
    "PRINCEPIPE", "RADICO", "RAIN", "RAJESHEXPO", "RCF",
    "RECLTD", "ROUTE", "SANOFI", "SCI", "SHREECEM",
    "SIEMENS", "SKFINDIA", "SONACOMS", "SRTRANSFIN", "STARCEMENT",
    "STRTECH", "SUNTV", "SUPREMEIND", "SUZLON", "SYNGENE",
    "TATACHEM", "TATACOMM", "TATAELXSI", "TATAPOWER", "TATVA",
    "TIMKEN", "TORNTPHARM", "TORNTPOWER", "TRENT", "TTKPRESTIG",
    "TVSMOTORS", "UBL", "UNIONBANK", "UNITDSPR", "VEDL",
    "VBL", "VOLTAS", "WHIRLPOOL", "ZEEL", "ZYDUSLIFE",
]


def _clean_to_ticker(name: str) -> str:
    """Convert BSE SC_NAME to a probable Yahoo Finance ticker symbol."""
    # Remove common suffixes
    noise = [
        " LTD", " LIMITED", " LTD.", " PVT", " PRIVATE", " INDUSTRIES",
        " INDUSTRY", " CORPORATION", " CORP", " ENTERPRISE", " ENTERPRISES",
        " HOLDINGS", " HOLDING", " GROUP", ".", ",", "&", "'", "-", " "
    ]
    ticker = name.upper()
    for n in noise:
        ticker = ticker.replace(n, "")
    # Keep only alphanumeric and &/- which are valid in tickers
    ticker = re.sub(r"[^A-Z0-9]", "", ticker)
    return ticker


def download_bhavcopy_symbols(max_retries: int = 5) -> pd.DataFrame:
    """
    Download the latest BSE Bhavcopy CSV to get all traded stocks.
    Returns a DataFrame with columns: SC_CODE, SC_NAME, TICKER (Yahoo .BO symbol).
    Tries the last 5 trading days in case today/yesterday has no data yet.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.bseindia.com",
    }

    for days_back in range(1, max_retries + 1):
        date = datetime.now() - timedelta(days=days_back)
        # Skip weekends
        if date.weekday() >= 5:
            continue
        date_str = date.strftime("%d%m%y")
        url = BHAVCOPY_URL.format(date_str=date_str)
        try:
            logger.info(f"Fetching BSE Bhavcopy: {url}")
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code == 200:
                with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
                    csv_name = [n for n in z.namelist() if n.endswith(".CSV")][0]
                    with z.open(csv_name) as f:
                        df = pd.read_csv(f)
                # Bhavcopy columns: SC_CODE, SC_NAME, SC_GROUP, SC_TYPE, OPEN, HIGH, LOW, CLOSE, ...
                df = df[["SC_CODE", "SC_NAME"]].copy()
                df.columns = ["SC_CODE", "SC_NAME"]
                df["SC_NAME"] = df["SC_NAME"].astype(str).str.strip()
                df["TICKER"] = df["SC_NAME"].apply(_clean_to_ticker) + ".BO"
                df = df[df["SC_NAME"] != ""].reset_index(drop=True)
                logger.info(f"Bhavcopy loaded: {len(df)} stocks from {date.strftime('%Y-%m-%d')}")
                return df
        except Exception as e:
            logger.warning(f"Bhavcopy fetch failed for {date_str}: {e}")

    logger.warning("Bhavcopy unavailable; falling back to hardcoded BSE 500 list")
    return _fallback_symbols()


def _fallback_symbols() -> pd.DataFrame:
    """Return a hardcoded list of BSE 500 stocks as fallback."""
    tickers = list(set(SENSEX_30 + BSE500_EXTRAS))
    rows = [{"SC_CODE": 0, "SC_NAME": t, "TICKER": f"{t}.BO"} for t in tickers]
    return pd.DataFrame(rows)


def load_bse_symbols(force_refresh: bool = False) -> pd.DataFrame:
    """
    Load BSE symbols from local cache, refreshing from Bhavcopy if stale (>1 day).
    Returns DataFrame with SC_CODE, SC_NAME, TICKER columns.
    """
    if not force_refresh and SYMBOL_MAP_PATH.exists():
        mtime = os.path.getmtime(SYMBOL_MAP_PATH)
        age_hours = (datetime.now().timestamp() - mtime) / 3600
        if age_hours < 24:
            logger.info(f"Loading BSE symbols from cache ({age_hours:.1f}h old)")
            return pd.read_csv(SYMBOL_MAP_PATH)

    df = download_bhavcopy_symbols()
    df.to_csv(SYMBOL_MAP_PATH, index=False)
    return df


def get_tickers(mode: str = "full") -> list[str]:
    """
    Return list of Yahoo Finance ticker symbols.
    mode: 'sensex30' | 'bse500' | 'full'
    """
    if mode == "sensex30":
        return [f"{s}.BO" for s in SENSEX_30]
    if mode == "bse500":
        return [f"{s}.BO" for s in list(set(SENSEX_30 + BSE500_EXTRAS))]
    # full: load from Bhavcopy
    df = load_bse_symbols()
    return df["TICKER"].tolist()
