"""
SQLite-based cache for OHLCV data and computed indicators.
Prevents re-fetching 5000 stocks on every scan trigger.
TTL: 24 hours for price data, 48 hours for fundamentals.
"""

import json
import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "cache.db"

OHLCV_TTL_HOURS = 24
FUNDAMENTALS_TTL_HOURS = 48
SCAN_RESULTS_TTL_HOURS = 24


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create cache tables if they don't exist."""
    with _get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS ohlcv_cache (
                ticker      TEXT NOT NULL,
                period      TEXT NOT NULL,
                cached_at   TEXT NOT NULL,
                data_json   TEXT NOT NULL,
                PRIMARY KEY (ticker, period)
            );

            CREATE TABLE IF NOT EXISTS fundamentals_cache (
                ticker      TEXT PRIMARY KEY,
                cached_at   TEXT NOT NULL,
                data_json   TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS scan_results (
                job_id      TEXT PRIMARY KEY,
                status      TEXT NOT NULL,
                progress    INTEGER DEFAULT 0,
                total       INTEGER DEFAULT 0,
                mode        TEXT DEFAULT 'bse500',
                started_at  TEXT NOT NULL,
                finished_at TEXT,
                results_json TEXT
            );
        """)
    logger.info("Cache DB initialised at %s", DB_PATH)


# ── OHLCV cache ────────────────────────────────────────────────────────────────

def get_ohlcv(ticker: str, period: str) -> Any | None:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT cached_at, data_json FROM ohlcv_cache WHERE ticker=? AND period=?",
            (ticker, period),
        ).fetchone()
    if row is None:
        return None
    cached_at = datetime.fromisoformat(row["cached_at"])
    if datetime.now() - cached_at > timedelta(hours=OHLCV_TTL_HOURS):
        return None
    return json.loads(row["data_json"])


def set_ohlcv(ticker: str, period: str, data: Any) -> None:
    with _get_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO ohlcv_cache (ticker, period, cached_at, data_json)
               VALUES (?, ?, ?, ?)""",
            (ticker, period, datetime.now().isoformat(), json.dumps(data)),
        )


# ── Fundamentals cache ─────────────────────────────────────────────────────────

def get_fundamentals(ticker: str) -> dict | None:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT cached_at, data_json FROM fundamentals_cache WHERE ticker=?",
            (ticker,),
        ).fetchone()
    if row is None:
        return None
    cached_at = datetime.fromisoformat(row["cached_at"])
    if datetime.now() - cached_at > timedelta(hours=FUNDAMENTALS_TTL_HOURS):
        return None
    return json.loads(row["data_json"])


def set_fundamentals(ticker: str, data: dict) -> None:
    with _get_conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO fundamentals_cache (ticker, cached_at, data_json)
               VALUES (?, ?, ?)""",
            (ticker, datetime.now().isoformat(), json.dumps(data)),
        )


# ── Scan job tracking ──────────────────────────────────────────────────────────

def create_scan_job(job_id: str, mode: str, total: int) -> None:
    with _get_conn() as conn:
        conn.execute(
            """INSERT INTO scan_results (job_id, status, progress, total, mode, started_at)
               VALUES (?, 'running', 0, ?, ?, ?)""",
            (job_id, total, mode, datetime.now().isoformat()),
        )


def update_scan_progress(job_id: str, progress: int) -> None:
    with _get_conn() as conn:
        conn.execute(
            "UPDATE scan_results SET progress=? WHERE job_id=?",
            (progress, job_id),
        )


def finish_scan_job(job_id: str, results: list) -> None:
    with _get_conn() as conn:
        conn.execute(
            """UPDATE scan_results
               SET status='completed', progress=total, finished_at=?, results_json=?
               WHERE job_id=?""",
            (datetime.now().isoformat(), json.dumps(results), job_id),
        )


def fail_scan_job(job_id: str, error: str) -> None:
    with _get_conn() as conn:
        conn.execute(
            """UPDATE scan_results
               SET status='failed', finished_at=?, results_json=?
               WHERE job_id=?""",
            (datetime.now().isoformat(), json.dumps({"error": error}), job_id),
        )


def get_scan_job(job_id: str) -> dict | None:
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM scan_results WHERE job_id=?", (job_id,)
        ).fetchone()
    if row is None:
        return None
    result = dict(row)
    if result.get("results_json"):
        result["results"] = json.loads(result["results_json"])
        del result["results_json"]
    else:
        result["results"] = []
    return result


def get_latest_completed_scan() -> dict | None:
    """Return the most recent completed scan results."""
    with _get_conn() as conn:
        row = conn.execute(
            """SELECT * FROM scan_results
               WHERE status='completed'
               ORDER BY finished_at DESC LIMIT 1"""
        ).fetchone()
    if row is None:
        return None
    result = dict(row)
    if result.get("results_json"):
        result["results"] = json.loads(result["results_json"])
        del result["results_json"]
    else:
        result["results"] = []
    return result
