"""
Kite Connect singleton client with persistent daily token management.

Setup:
  1. Create an app at https://developers.kite.trade/
  2. Set redirect URL to http://127.0.0.1:8000/auth/callback
  3. Add KITE_API_KEY and KITE_API_SECRET to data-service/.env
  4. Visit http://localhost:8000/auth/login once per day to authenticate.

Token is stored in data/kite_token.json and reused until it expires (6 AM IST).
"""

import json
import logging
import os
from datetime import datetime, time as dtime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from kiteconnect import KiteConnect

load_dotenv()

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
TOKEN_FILE = DATA_DIR / "kite_token.json"

IST = ZoneInfo("Asia/Kolkata")

API_KEY = os.getenv("KITE_API_KEY", "")
API_SECRET = os.getenv("KITE_API_SECRET", "")

_kite: KiteConnect | None = None


def _token_is_fresh(token_data: dict) -> bool:
    """
    Kite access tokens expire at 6:00 AM IST the next day.
    If the token was issued before today's 6 AM IST it is stale.
    """
    try:
        issued_at = datetime.fromisoformat(token_data["issued_at"])
        now_ist = datetime.now(IST)
        # Reset time: today 6 AM IST
        reset_today = now_ist.replace(hour=6, minute=0, second=0, microsecond=0)
        # If issued before today's 6 AM, it's expired
        if issued_at.astimezone(IST) < reset_today:
            return False
        return True
    except Exception:
        return False


def _load_saved_token() -> str | None:
    if not TOKEN_FILE.exists():
        return None
    try:
        data = json.loads(TOKEN_FILE.read_text())
        if _token_is_fresh(data):
            return data["access_token"]
        logger.info("Saved Kite token expired (past 6 AM IST); re-auth needed")
    except Exception as e:
        logger.warning(f"Could not load saved token: {e}")
    return None


def _save_token(access_token: str) -> None:
    TOKEN_FILE.write_text(json.dumps({
        "access_token": access_token,
        "issued_at": datetime.now(IST).isoformat(),
    }))
    logger.info("Kite access token saved")


def get_kite() -> KiteConnect:
    """
    Returns an authenticated KiteConnect instance, reusing a cached one if possible.
    Raises RuntimeError if not yet authenticated.
    """
    global _kite

    if not API_KEY:
        raise RuntimeError(
            "KITE_API_KEY is not set. Add it to data-service/.env"
        )

    if _kite is None:
        _kite = KiteConnect(api_key=API_KEY)
        saved = _load_saved_token()
        if saved:
            _kite.set_access_token(saved)
            logger.info("Kite: loaded saved access token")

    return _kite


def is_authenticated() -> bool:
    """Check if the current token is valid by making a lightweight API call."""
    try:
        kite = get_kite()
        if not kite.access_token:
            return False
        kite.profile()   # lightweight call; throws on invalid token
        return True
    except Exception:
        return False


def get_login_url() -> str:
    """Generate the Kite login URL for the user to visit."""
    kite = get_kite()
    return kite.login_url()


def complete_login(request_token: str) -> str:
    """
    Exchange request_token (from Kite callback) for a persistent access_token.
    Returns the access_token string.
    """
    if not API_SECRET:
        raise RuntimeError("KITE_API_SECRET is not set in data-service/.env")

    kite = get_kite()
    data = kite.generate_session(request_token, api_secret=API_SECRET)
    access_token: str = data["access_token"]
    kite.set_access_token(access_token)
    _save_token(access_token)
    logger.info("Kite: authenticated successfully")
    return access_token


def invalidate_token() -> None:
    """Clear the saved token (force re-login)."""
    global _kite
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()
    if _kite:
        _kite.access_token = None
    logger.info("Kite token invalidated")
