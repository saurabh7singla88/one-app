"""
FastAPI data microservice for BSE stock scanning.
Endpoints:
  GET  /health
  GET  /auth/login           — redirect to Kite login page
  GET  /auth/callback        — Kite OAuth callback (receives request_token)
  GET  /auth/status          — check if currently authenticated
  POST /scan                 — trigger a new scan job
  GET  /status/{job_id}      — poll scan progress
  GET  /stocks               — latest scan results (paginated + filtered)
  GET  /stock/{ticker}       — single stock detail
"""

import logging
import uuid
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, HTMLResponse
from pydantic import BaseModel

import cache
from scanner import run_scan

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    cache.init_db()
    logger.info("Data service started")
    yield


app = FastAPI(
    title="BSE Stock Scanner — Data Service",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ──────────────────────────────────────────────────

class ScanRequest(BaseModel):
    mode: str = "bse500"   # 'sensex30' | 'bse500' | 'full'


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    from kite_client import is_authenticated
    return {
        "status": "ok",
        "service": "bse-data-service",
        "kite_authenticated": is_authenticated(),
    }


# ── Kite Auth ──────────────────────────────────────────────────────────────────

@app.get("/auth/login")
def auth_login():
    """
    Redirect the user to Kite's login page.
    After login, Kite redirects to /auth/callback?request_token=...
    """
    from kite_client import get_login_url, API_KEY
    if not API_KEY:
        raise HTTPException(400, "KITE_API_KEY not configured in data-service/.env")
    url = get_login_url()
    return RedirectResponse(url)


@app.get("/auth/callback")
def auth_callback(request_token: str):
    """
    Kite OAuth callback. Exchanges request_token for a persistent access_token.
    Called automatically by Kite after the user logs in.
    """
    from kite_client import complete_login
    try:
        complete_login(request_token)
        return HTMLResponse("""
            <html><body style="font-family:sans-serif;text-align:center;padding:60px">
            <h2 style="color:#16a34a">✅ Kite Connect Authenticated!</h2>
            <p>You can now close this window and start a scan.</p>
            <p><a href="http://localhost:3000">← Go to BSE Scanner</a></p>
            </body></html>
        """)
    except Exception as e:
        raise HTTPException(400, f"Authentication failed: {e}")


@app.get("/auth/status")
def auth_status():
    """Check if the Kite session is valid."""
    from kite_client import is_authenticated
    authenticated = is_authenticated()
    return {"authenticated": authenticated}


@app.post("/auth/logout")
def auth_logout():
    """Invalidate the saved Kite token."""
    from kite_client import invalidate_token
    invalidate_token()
    return {"message": "Logged out"}




@app.post("/scan")
async def trigger_scan(body: ScanRequest, background_tasks: BackgroundTasks):
    """
    Trigger a new scan. Returns job_id immediately.
    The scan runs in the background; poll /status/{job_id} for progress.
    """
    valid_modes = {"sensex30", "bse500", "full"}
    if body.mode not in valid_modes:
        raise HTTPException(400, f"mode must be one of {valid_modes}")

    job_id = str(uuid.uuid4())
    background_tasks.add_task(_run_scan_task, job_id, body.mode)
    return {"job_id": job_id, "mode": body.mode, "status": "started"}


async def _run_scan_task(job_id: str, mode: str):
    try:
        await run_scan(job_id, mode)
    except Exception as e:
        logger.exception(f"Scan task {job_id} crashed: {e}")
        cache.fail_scan_job(job_id, str(e))


@app.get("/status/{job_id}")
def get_status(job_id: str):
    """Poll scan job status and progress."""
    job = cache.get_scan_job(job_id)
    if job is None:
        raise HTTPException(404, "Job not found")
    # Don't return full results on status endpoint — use /stocks instead
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "progress": job["progress"],
        "total": job["total"],
        "mode": job["mode"],
        "started_at": job["started_at"],
        "finished_at": job.get("finished_at"),
        "candidate_count": len(job.get("results", [])),
    }


@app.get("/stocks")
def get_stocks(
    job_id: Optional[str] = Query(None, description="Specific job ID; latest if omitted"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    signal: Optional[str] = Query(None, description="Filter by signal: NEAR_52W_LOW|NEAR_52W_HIGH|OVERSOLD|OVERBOUGHT|VOLUME_SURGE|GOLDEN_CROSS"),
    sector: Optional[str] = Query(None),
    market_cap: Optional[str] = Query(None, description="large_cap|mid_cap|small_cap"),
    min_score: int = Query(0, ge=0, le=100),
    sort_by: str = Query("score", description="score|rsi|volume_surge_pct|pct_from_low"),
    sort_dir: str = Query("desc", description="asc|desc"),
):
    """Return paginated scan results with filtering and sorting."""
    if job_id:
        job = cache.get_scan_job(job_id)
        if job is None:
            raise HTTPException(404, "Job not found")
        results = job.get("results", [])
    else:
        job = cache.get_latest_completed_scan()
        if job is None:
            return {"results": [], "total": 0, "page": page, "page_size": page_size, "job_id": None}
        results = job.get("results", [])

    # Filtering
    if signal:
        results = [r for r in results if signal in r.get("signals", [])]
    if sector:
        results = [r for r in results if (r.get("sector") or "").lower() == sector.lower()]
    if market_cap:
        results = [r for r in results if r.get("market_cap_category") == market_cap]
    if min_score:
        results = [r for r in results if r.get("score", 0) >= min_score]

    # Sorting
    reverse = sort_dir == "desc"
    results = sorted(
        results,
        key=lambda r: (r.get(sort_by) or 0),
        reverse=reverse,
    )

    total = len(results)
    start = (page - 1) * page_size
    page_results = results[start: start + page_size]

    # Strip heavy fields from list view
    slim = []
    for r in page_results:
        slim.append({
            k: v for k, v in r.items()
            if k not in ("fundamentals",)
        })

    return {
        "results": slim,
        "total": total,
        "page": page,
        "page_size": page_size,
        "job_id": job.get("job_id"),
        "scan_finished_at": job.get("finished_at"),
    }


@app.get("/stock/{ticker:path}")
def get_stock_detail(ticker: str):
    """Return full detail for a single stock from the latest completed scan."""
    job = cache.get_latest_completed_scan()
    if job is None:
        raise HTTPException(404, "No completed scan found; trigger a scan first")

    results = job.get("results", [])
    match = next((r for r in results if r["ticker"].lower() == ticker.lower()), None)
    if match is None:
        raise HTTPException(404, f"Stock {ticker} not found in latest scan results")

    return match
