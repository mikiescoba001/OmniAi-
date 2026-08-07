# OmniAI — Launch Candidate 1.0 Deployment Guide

## Production Deployment Checklist

### 1. Backend Setup
```bash
# Clone and install
git clone <repo>
cd omniai/server
npm install --production

# Configure environment
cp ../.env.example ../.env
# Edit .env with production values
```

### 2. Environment Variables
| Variable | Required | Source |
|----------|----------|--------|
| `SUPABASE_URL` | ✅ Core | Supabase project dashboard |
| `SUPABASE_SERVICE_KEY` | ✅ Core | Supabase project settings → API → service_role key |
| `JWT_SECRET` | ✅ Core | `openssl rand -hex 32` |
| `OPENAI_API_KEY` | ⭕ AI | https://platform.openai.com/api-keys |
| `STRIPE_SECRET_KEY` | ⭕ Payments | Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | ⭕ Payments | Stripe webhook settings |
| `SENDGRID_API_KEY` | ⭕ Email | SendGrid dashboard |
| `GOOGLE_CLIENT_ID` | ⭕ OAuth | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | ⭕ OAuth | Google Cloud Console |
| `CORS_ORIGIN` | ✅ Core | Your frontend domain |
| `NODE_ENV` | ✅ Core | Set to `production` |
| `AI_KILL_SWITCH` | ⭕ Safety | Set to `true` to disable AI globally |

### 3. Database
```bash
# Option A: Supabase SQL Editor
# 1. Go to Supabase dashboard → SQL Editor
# 2. Copy server/migrations/001_initial_schema.sql
# 3. Execute entire script

# Option B: Supabase CLI
npm install -g supabase
supabase link --project-ref <your-ref>
supabase db push

# Verify
curl https://your-api.com/health
# Expected: {"success":true,"data":{"status":"healthy",...}}
```

### 4. Frontend
```bash
# The frontend is a static SPA
# Update API URL in index.html:
#   <script>window.OMNIAI_API_URL = 'https://api.yourdomain.com/api';</script>

# Serve via Nginx or CDN
```

### 5. Domain & HTTPS
```
Frontend:   https://omniai.app → CDN / Nginx serving static files
API:        https://api.omniai.app → Node.js reverse proxy

Nginx config:
  server {
      listen 443 ssl;
      server_name api.omniai.app;
      
      ssl_certificate /etc/letsencrypt/live/api.omniai.app/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/api.omniai.app/privkey.pem;
      
      location / {
          proxy_pass http://localhost:3001;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }
```

### 6. CORS Configuration
```
CORS_ORIGIN=https://omniai.app,https://www.omniai.app
```

### 7. OAuth Callback URLs
```
Google OAuth redirect:
  https://api.omniai.app/api/auth/google/callback
```

### 8. Payment Webhooks
```
Stripe webhook endpoint:
  https://api.omniai.app/api/subscription/webhook
  
Events to listen for:
  - checkout.session.completed
  - customer.subscription.updated
  - customer.subscription.deleted
  - invoice.payment_failed
```

### 9. Email Provider
```
Configure SMTP or API key for:
  - Email verification
  - Password reset
  - Account notifications
```

### 10. Monitoring
```
Health check endpoint:
  GET https://api.omniai.app/health
  
Uptime monitoring:
  - UptimeRobot or similar: check /health every 5 minutes
  
Error tracking:
  - Configure logging to stdout (already done via morgan)
  - Set up log aggregation (e.g., Papertrail, Logtail)
```

---

## Backup & Recovery

### Database Backup Strategy
> **NOTE:** This documents the *procedure*. Actual backups depend on Supabase's infrastructure.

**Supabase provides:**
- Automatic daily backups (Pro plan and above)
- Point-in-time recovery (Team plan and above)
- Manual backup via `pg_dump`

### Manual Backup Procedure
```bash
# Backup entire database
pg_dump --dbname=postgresql://<user>:<password>@<host>:<port>/<db> \
  --format=custom \
  --file=omniai-backup-$(date +%Y%m%d).dump

# Backup specific schema only
pg_dump --dbname=<connection-string> \
  --schema=public \
  --format=custom \
  --file=omniai-schema-$(date +%Y%m%d).dump

# Encrypt backup
gpg --symmetric --cipher-algo AES256 omniai-backup-*.dump
```

### Recovery Procedure
```bash
# Restore from backup
pg_restore --dbname=<connection-string> \
  --clean \
  --if-exists \
  omniai-backup-<date>.dump

# Verify recovery
# 1. Check user count matches expected
# 2. Spot-check recent conversations
# 3. Verify subscription states
```

### Environment Restoration
```bash
# Store .env in a secure vault (e.g., 1Password, AWS Secrets Manager)
# To restore:
# 1. Copy .env.example to .env
# 2. Restore values from vault
# 3. Verify: node -e "require('dotenv').config(); console.log('DB:', !!process.env.SUPABASE_URL)"
```

### Migration Rollback Strategy
```sql
-- Each migration should be reversible
-- For 001_initial_schema.sql, rollback:
DROP TABLE IF EXISTS 
  admin_events, audit_log, admin_users, business_projects,
  learning_progress, goals, habit_logs, habits, notes, todos,
  documents, images, generated_content, messages, conversations,
  usage_log, subscriptions, profiles, users, health_check CASCADE;
DROP TYPE IF EXISTS subscription_plan, subscription_status, usage_action;
```

### User Data Recovery
```sql
-- Recover deleted user data (if within Supabase retention)
-- 1. Enable point-in-time recovery
-- 2. Restore to timestamp before deletion
-- 3. Export specific user's data
-- 4. Merge into production database

-- Or restore specific user from backup:
SELECT * FROM messages WHERE user_id = '<user-id>';
SELECT * FROM documents WHERE user_id = '<user-id>';
SELECT * FROM todos WHERE user_id = '<user-id>';
```

---

## Production Build Verification

```bash
# 1. No dev dependencies
grep -r "nodemon\|ts-node\|webpack-dev" server/package.json

# 2. No exposed secrets
grep -r "sk-[A-Za-z0-9]\|SUPABASE_KEY\|password=" --include="*.js" --include="*.html" js/ server/src/

# 3. No mock/fake functionality
grep -rn "simulateAI\|mock\|fake\|placeholder\|demo" --include="*.js" server/src/

# 4. No unnecessary console logs (in production code)
grep -rn "console.log" server/src/ | grep -v "console.error\|console.warn"

# 5. Verify production start
cd server && NODE_ENV=production node src/index.js
# Expected: clean startup, no warnings
```

---

## Post-Deployment Verification

```bash
# 1. Health check
curl https://api.omniai.app/health

# 2. Auth flow
curl -X POST https://api.omniai.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"TestPass123!","name":"Test"}'

# 3. Protected route
TOKEN=<token-from-register>
curl -H "Authorization: Bearer $TOKEN" https://api.omniai.app/api/auth/me

# 4. AI (if configured)
curl -X POST https://api.omniai.app/api/ai/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello!"}'

# 5. File upload
curl -X POST https://api.omniai.app/api/documents/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test.txt"
```