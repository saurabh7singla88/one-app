/**
 * Pushes README.md to Docker Hub as the repository full description.
 *
 * Usage:
 *   DOCKERHUB_USERNAME=nebrix001 DOCKERHUB_PASSWORD=yourpat node scripts/push-dockerhub-readme.js
 *
 * Or set DOCKERHUB_USERNAME / DOCKERHUB_PASSWORD in your .env (never commit them).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal .env parser — no dotenv dependency needed
const envPath = resolve(__dirname, '../.env');
try {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  });
} catch { /* .env optional — env vars may be set externally */ }

const USERNAME = process.env.DOCKERHUB_USERNAME;
const PASSWORD = process.env.DOCKERHUB_PASSWORD;
const REPO     = `${USERNAME}/one-app`;

if (!USERNAME || !PASSWORD) {
  console.error('Set DOCKERHUB_USERNAME and DOCKERHUB_PASSWORD in your .env or environment.');
  process.exit(1);
}

const readme = readFileSync(resolve(__dirname, '../README.md'), 'utf8');

// Try using the PAT directly as a Bearer token first (avoids scope downgrade from /v2/users/login).
// Falls back to JWT login if that fails.
async function getToken() {
  const directRes = await fetch(`https://hub.docker.com/v2/repositories/${REPO}/`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${PASSWORD}`,
    },
    body: JSON.stringify({ full_description: readme }),
  });
  if (directRes.ok) return null; // already done — PAT worked directly
  if (directRes.status !== 401) {
    // Not an auth error — fall through to login approach
  }

  // Fallback: exchange PAT for JWT via login
  const loginRes = await fetch('https://hub.docker.com/v2/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!loginRes.ok) {
    console.error('Login failed:', await loginRes.text());
    process.exit(1);
  }
  return (await loginRes.json()).token;
}

const token = await getToken();
if (token === null) {
  // Already patched via direct PAT
  console.log(`✓ Docker Hub README updated for ${REPO}`);
  process.exit(0);
}

// Patch full_description using JWT token
const patchRes = await fetch(`https://hub.docker.com/v2/repositories/${REPO}/`, {
  method: 'PATCH',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({ full_description: readme }),
});
if (!patchRes.ok) {
  console.error('Update failed:', await patchRes.text());
  process.exit(1);
}
console.log(`✓ Docker Hub README updated for ${REPO}`);
