# Render Deployment Runbook

## Overview

This runbook covers the deployment and operation of the Legal Service Rails Backend on Render.

## Architecture

- **API Service**: Web service handling HTTP requests
- **Worker Service**: Background worker for credential revalidation
- **PostgreSQL Database**: Managed PostgreSQL with separate owner and runtime credentials

## Initial Deployment

### 1. Prerequisites

- Render account with billing enabled
- Repository connected to Render
- PostgreSQL add-on provisioned

### 2. Environment Variables

Ensure these environment variables are set in Render dashboard:

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | Required |
| `DATABASE_URL` | Auto-generated | From PostgreSQL add-on |
| `DATABASE_EXPECTED_USER` | `legal_service_app` | Runtime login |
| `AUTH_MODE` | `SESSION` | Required for production |
| `SESSION_TOKEN_PEPPER` | Auto-generated | Min 32 characters |
| `PAYMENTS_MODE` | `OFF` | No PSP adapter |
| All capability modes | `OFF` | Until authorized adapters |

### 3. Database Setup

#### First-time Migration

1. Connect to database using owner credentials (`MIGRATION_DATABASE_URL`)
2. Run migration script:
   ```bash
   npm run db:migrate
   ```
3. Validate credential constraints:
   ```bash
   npm run db:validate-credential-constraints
   ```
4. Apply runtime role:
   ```bash
   npm run db:apply-runtime-role
   ```
5. Verify database boundary:
   ```bash
   npm run db:verify
   ```

#### Ongoing Migrations

For new migrations, run:
```bash
npm run db:migrate
```

## Release Gate

Before each deployment, run the release gate script:
```bash
npm run release:gate
```

This verifies:
- Required environment variables are set
- `NODE_ENV` is `production`
- `AUTH_MODE` is `SESSION`
- `PAYMENTS_MODE` is `OFF`
- `SESSION_TOKEN_PEPPER` is strong (min 32 chars)
- No `MOCK` capability modes
- Database connection works
- Migrations are applied
- Runtime identity is correct

## Health Checks

### API Service

- **Liveness**: `GET /health/live`
  - Returns: `{"status": "ok"}`
  - Use for: Process health monitoring

- **Readiness**: `GET /health/ready`
  - Returns: `{"status": "ready", "capabilities": {...}}`
  - Use for: Traffic routing decisions
  - Checks: Database connectivity, runtime identity, capability modes

### Worker Service

The worker process runs credential revalidation every 60 seconds. Monitor via:
- Process logs for "Credential revalidation degraded X stale tier(s)"
- Database connection health

## Monitoring

### Key Metrics

1. **API Response Times**: Monitor `/health/live` and `/health/ready`
2. **Database Connection Pool**: Check `DATABASE_POOL_MAX` usage
3. **Worker Activity**: Log messages about credential revalidation
4. **Error Rates**: Monitor 5xx responses

### Log Levels

- `info`: Default, normal operations
- `warn`: Potential issues
- `error`: Failures requiring attention
- `debug`: Detailed troubleshooting (not for production)

## Troubleshooting

### Common Issues

#### 1. Database Connection Failures

**Symptoms**: API/worker fail to start, health checks return 503

**Checks**:
- Verify `DATABASE_URL` is correct
- Check database is running in Render dashboard
- Verify `DATABASE_EXPECTED_USER` matches runtime login

**Resolution**:
- Restart service after database is available
- Check database logs for connection limits

#### 2. Migration Failures

**Symptoms**: `npm run db:migrate` fails

**Checks**:
- Verify `MIGRATION_DATABASE_URL` has owner permissions
- Check database logs for lock conflicts
- Ensure no active connections blocking DDL

**Resolution**:
- Wait for long-running queries to complete
- Retry migration during low-traffic period

#### 3. Identity Verification Failures

**Symptoms**: "Unsafe database runtime identity" error

**Checks**:
- Verify `DATABASE_EXPECTED_USER` matches expected login
- Check runtime role is properly granted
- Ensure no table ownership by runtime login

**Resolution**:
- Re-run `npm run db:apply-runtime-role`
- Verify grants with `npm run db:verify`

#### 4. Capability Mode Errors

**Symptoms**: "Production startup rejects MOCK capability modes"

**Checks**:
- Verify all capability modes are `OFF` in production
- Check environment variables in Render dashboard

**Resolution**:
- Set all capability modes to `OFF`
- Restart service

### Rollback Procedures

#### Service Rollback

1. In Render dashboard, go to service
2. Click "Manual Deploy" → "Deploy previous commit"
3. Select the last known good commit
4. Deploy

#### Database Rollback

**Warning**: Database rollbacks are complex and data-loss prone

1. Take database backup before any migration
2. If migration causes issues, restore from backup
3. Re-apply migrations in correct order

## Security Considerations

### Credential Management

- `SESSION_TOKEN_PEPPER`: Never expose in logs
- `DATABASE_URL`: Managed by Render, auto-rotated
- `MIGRATION_DATABASE_URL`: Use only for migrations, not runtime

### Runtime Identity

The application uses two database identities:
1. **Owner** (`MIGRATION_DATABASE_URL`): For migrations only
2. **Runtime** (`DATABASE_URL`): For application queries

The runtime identity:
- Cannot modify migrations
- Cannot modify credential policies
- Cannot directly insert credit events
- Uses security-definer functions for protected operations

### Network Security

- Render provides HTTPS by default
- Database is private to Render network
- No public database access

## Maintenance Windows

### Recommended Schedule

- **Migrations**: During low-traffic hours
- **Service updates**: During maintenance windows
- **Database maintenance**: Render-managed, automatic

### Communication

- Notify stakeholders before maintenance
- Document all changes in changelog
- Verify health checks after changes

## Support

### Escalation Path

1. Check service logs in Render dashboard
2. Run release gate script locally
3. Verify database status
4. Contact team lead if unresolved

### Useful Commands

```bash
# Local verification
npm ci
npm run verify

# Database verification
npm run db:migrate
npm run db:validate-credential-constraints
npm run db:apply-runtime-role
npm run db:verify

# Release gate
npm run release:gate

# Test suite
npm test
```
