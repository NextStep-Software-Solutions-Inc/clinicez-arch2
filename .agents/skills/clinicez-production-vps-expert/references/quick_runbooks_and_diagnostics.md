# Clinic EZ VPS Quick Runbooks & Diagnostics Reference

This document provides quick-reference diagnosis snippets, health-check commands, and emergency recovery steps for `130.94.50.27`.

---

## 1. Quick Cluster Status Check

Run from the local development machine:

```bash
# Check running containers and ports
ssh -i ~/.ssh/id_ed25519 root@130.94.50.27 "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# Check memory, swap, and volume disk space
ssh -i ~/.ssh/id_ed25519 root@130.94.50.27 "free -h; echo '---'; df -h /opt/clinicez/data"
```

Expected output:
- `npm` container: `Up (healthy)`
- `postgres` container: `Up (healthy)`
- `dozzle` container: `Up`
- `/dev/vdb` on `/opt/clinicez/data`: Under 20% utilization

---

## 2. Test External Endpoints

```bash
# Verify NPM GUI responds with 200
curl -s -o /dev/null -w "npm.clinicez.net: %{http_code}\n" https://npm.clinicez.net

# Verify Dozzle responds with 200
curl -s -o /dev/null -w "logs.clinicez.net: %{http_code}\n" https://logs.clinicez.net

# Verify direct IP access returns 403 Forbidden (Unbranded)
curl -i http://130.94.50.27 | head -n 5

# Verify port 81 and 5432 are inaccessible externally (should timeout)
curl -I --connect-timeout 2 http://130.94.50.27:81 || echo "Port 81 is blocked."
nc -zv -w 2 130.94.50.27 5432 || echo "Port 5432 is shielded."
```

---

## 3. PostgreSQL Database Diagnostics

```bash
# List all 8 databases
ssh -i ~/.ssh/id_ed25519 root@130.94.50.27 "docker exec -i postgres psql -U db_admin_node -d CLINICEZ-CLINIC_DB -c '\l'"

# Verify pgvector extension version (0.8.7) on template1 and clinic database
ssh -i ~/.ssh/id_ed25519 root@130.94.50.27 "docker exec -i postgres psql -U db_admin_node -d CLINICEZ-CLINIC_DB -c 'SELECT extname, extversion FROM pg_extension WHERE extname = \"vector\";'"
```

### 3.1. Connect via SSH Tunnel (DBeaver, TablePlus, pgAdmin, CLI)
```bash
# Open local port 5433 forwarded to VPS PostgreSQL (127.0.0.1:5432)
ssh -i ~/.ssh/id_ed25519 -N -L 5433:127.0.0.1:5432 root@130.94.50.27

# Connect using local psql:
psql -h 127.0.0.1 -p 5433 -U db_admin_node -d CLINICEZ-CLINIC_DB
```
GUI Database Tool Settings:
- **Host**: `127.0.0.1` | **Port**: `5433` (or built-in SSH tunnel tab using port `5432`)
- **User**: `db_admin_node` | **Password**: `t-G9x#mK5!pQ2vW8*zY;`
- **Database**: Any of the 8 production databases (e.g. `CLINICEZ-CLINIC_DB`)

---

## 4. Emergency Database Dump & Restore

### Force Immediate Manual Backup
```bash
ssh -i ~/.ssh/id_ed25519 root@130.94.50.27 "/opt/clinicez/data/scripts/backup-databases.sh"
```

### Inspect Stored Backups
```bash
ssh -i ~/.ssh/id_ed25519 root@130.94.50.27 "ls -lh /opt/clinicez/data/backups"
```

### Restore a Specific Database
```bash
ssh -i ~/.ssh/id_ed25519 root@130.94.50.27
cd /opt/clinicez/data/backups

# Example: Restore CLINICEZ-CLINIC_DB from newest archive
LATEST=$(ls -t CLINICEZ-CLINIC_DB_*.sql.gz | head -n 1)
gunzip -c "$LATEST" | docker exec -i postgres psql -U db_admin_node -d CLINICEZ-CLINIC_DB
```

---

## 5. Nginx Proxy Manager Hot Reload

If custom Nginx configs or site files are adjusted:

```bash
# Test configuration syntax first
ssh -i ~/.ssh/id_ed25519 root@130.94.50.27 "docker exec npm nginx -t"

# Gracefully reload without dropping connections
ssh -i ~/.ssh/id_ed25519 root@130.94.50.27 "docker exec npm nginx -s reload"
```
