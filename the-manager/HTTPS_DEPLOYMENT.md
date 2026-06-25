# HTTPS Deployment Guide

## Issue
When hosting on a custom domain with HTTPS, the app returns 500 errors with CORS failures because:
1. `ALLOWED_ORIGINS` defaults to `http://localhost:3000`
2. `PUBLIC_URL` defaults to `http://localhost:3000`
3. Browser sends requests from `https://yourdomain.com`, which doesn't match

## Are These Required?

Short answer:
- `ALLOWED_ORIGINS`: Required for production/custom domain deployments. Optional for localhost-only development.
- `PUBLIC_URL`: Required when using OAuth callback flows (for example Gmail OAuth) on a custom domain. Optional if OAuth is not used.

Details:
- `ALLOWED_ORIGINS` controls CORS allowlist. In development, if unset, the backend allows localhost/127.0.0.1 origins as a fallback.
- `PUBLIC_URL` is used to build externally visible callback URLs. If it is wrong, OAuth callbacks can fail or point to localhost.

Safe bypass options:
- Development only: leave `ALLOWED_ORIGINS` unset and use localhost.
- If OAuth is disabled/not used: `PUBLIC_URL` can remain unset.

Unsafe bypass option (not recommended):
- `ALLOWED_ORIGINS=*` allows any origin and increases risk. Use only for short-lived debugging.

## Solution

### Step 1: Update Environment Variables

Create or update `.env` with your domain:

```env
# For HTTPS deployment
APP_PORT=3000
ALLOWED_ORIGINS=https://yourdomain.com
PUBLIC_URL=https://yourdomain.com
DATA_DIR=./data
DATABASE_URL=file:/data/app.db

# If using Turso (cloud SQLite)
# TURSO_DATABASE_URL=libsql://...
# TURSO_AUTH_TOKEN=...

# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password

# Security - set a stable JWT secret
JWT_SECRET=your_random_secret_here

# Optional: encryption for stored API keys
TOKEN_ENCRYPTION_KEY=your_encryption_key_here
```

If you have multiple domains (for example root + www), list all origins:

```env
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
PUBLIC_URL=https://yourdomain.com
```

### Step 2: Configure HTTPS at Reverse Proxy Level

The Node.js app runs on HTTP internally. HTTPS is configured at the reverse proxy layer:

#### Option A: Using Docker with Nginx (Recommended)

Update `docker-compose.yml` to add Nginx:

```yaml
services:
  nginx:
    image: nginx:latest
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro  # SSL certificates
    depends_on:
      - app
    restart: unless-stopped

  app:
    # ... existing config ...
    expose:
      - "47421"
    # Remove ports mapping - only accessible via nginx
```

#### Option B: Using AWS Load Balancer / Azure Application Gateway

If using cloud services:
- Configure SSL/TLS termination on the load balancer
- Load balancer → Backend on HTTP
- Forward traffic to your app container on port 3000

#### Option C: Using Let's Encrypt with Certbot

For self-hosted:

```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Certificates will be at:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem

# Configure Nginx to use these certificates
```

### Step 3: Verify Deployment

```bash
# Check CORS is working
curl -i -X OPTIONS https://yourdomain.com/api/health \
  -H "Origin: https://yourdomain.com" \
  -H "Access-Control-Request-Method: GET"

# Should see: Access-Control-Allow-Origin: https://yourdomain.com

# Check API is accessible
curl https://yourdomain.com/api/health
```

### Step 4: Update Frontend Configuration (if needed)

If frontend is built separately:

```bash
# Build with correct API URL
VITE_API_URL=https://yourdomain.com/api npm run build
```

For Docker deployment, the frontend auto-detects from the same origin, so no changes needed.

## Troubleshooting

### "CORS: origin 'https://yourdomain.com' not allowed"
- Verify `ALLOWED_ORIGINS=https://yourdomain.com` in `.env`
- Ensure you're using `https://` (not `http://`)
- Rebuild/restart container: `docker compose down && docker compose up --build`
- Temporary dev-only bypass: set `ALLOWED_ORIGINS=*` and restart (do not keep this in production)

### Mixed Content Errors (ERR_BLOCKED_BY_CLIENT)
- Ensure `PUBLIC_URL=https://yourdomain.com` (not `http://`)
- Check all external requests use `https://`
- Check OAuth2 redirect URIs match the HTTPS domain

### 500 Error on Page Load
- Check backend logs: `docker compose logs -f app`
- Verify database connection in logs
- Ensure `DATABASE_URL` or `TURSO_DATABASE_URL` is set correctly

### SSL Certificate Errors
- If self-signed: add to browser exceptions or use Let's Encrypt
- Check certificate hasn't expired: `openssl x509 -text -noout -in cert.pem | grep -A 2 "Validity"`
- Verify certificate matches domain: `openssl x509 -text -noout -in cert.pem | grep "Subject:"`

## Example Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;

    location / {
        proxy_pass http://app:47421;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

## Production Checklist

- [ ] ALLOWED_ORIGINS set to your HTTPS domain(s)
- [ ] PUBLIC_URL set to your HTTPS domain (required when OAuth is used)
- [ ] JWT_SECRET set to a random value (not default)
- [ ] SSL certificate installed and valid
- [ ] Reverse proxy (Nginx / Load Balancer) configured for HTTPS
- [ ] Database connection verified
- [ ] Admin credentials set (ADMIN_USERNAME + ADMIN_PASSWORD)
- [ ] Health check passes: `curl https://yourdomain.com/api/health`
- [ ] Frontend loads without CORS errors
- [ ] Can login and access protected routes
