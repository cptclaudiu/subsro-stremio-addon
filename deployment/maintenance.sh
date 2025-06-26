#!/bin/bash

# Maintenance script pentru Stremio Addon
# Rulează automat cleanup și verificări de sănătate

set -e

ADDON_DIR="/opt/stremio-addon"
LOG_FILE="/var/log/stremio-maintenance.log"

# Funcție de logging
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a $LOG_FILE
}

log "=== Starting maintenance ==="

# 1. Cleanup fișiere temporare vechi
log "Cleaning temporary files..."
if [ -d "$ADDON_DIR/temp" ]; then
    # Șterge fișiere .srt, .rar, .zip mai vechi de 48 ore
    find $ADDON_DIR/temp -type f \( -name "*.srt" -o -name "*.rar" -o -name "*.zip" -o -name "*.sub" \) -mtime +2 -delete 2>/dev/null || true
    
    # Număr fișiere rămase
    TEMP_COUNT=$(find $ADDON_DIR/temp -type f | wc -l)
    TEMP_SIZE=$(du -sh $ADDON_DIR/temp 2>/dev/null | cut -f1)
    log "Temp directory: $TEMP_COUNT files, $TEMP_SIZE total"
    
    # Dacă sunt prea multe fișiere (>1000) sau prea mult spațiu (>1GB), șterge cele mai vechi
    if [ $TEMP_COUNT -gt 1000 ]; then
        log "Too many temp files ($TEMP_COUNT), removing oldest..."
        find $ADDON_DIR/temp -type f -printf '%T+ %p\n' | sort | head -n 500 | cut -d' ' -f2- | xargs rm -f
    fi
fi

# 2. Cleanup cache vechi
log "Cleaning cache files..."
if [ -d "$ADDON_DIR/cache" ]; then
    # Șterge cache mai vechi de 30 zile
    find $ADDON_DIR/cache -type f -name "*.json" -mtime +30 -delete 2>/dev/null || true
    
    CACHE_COUNT=$(find $ADDON_DIR/cache -type f | wc -l)
    CACHE_SIZE=$(du -sh $ADDON_DIR/cache 2>/dev/null | cut -f1)
    log "Cache directory: $CACHE_COUNT files, $CACHE_SIZE total"
fi

# 3. Cleanup logs (backup pentru logrotate)
log "Cleaning old logs..."
if [ -d "$ADDON_DIR/logs" ]; then
    # Șterge logs mai vechi de 7 zile
    find $ADDON_DIR/logs -type f -name "*.log" -mtime +7 -delete 2>/dev/null || true
    find $ADDON_DIR/logs -type f -name "*.log.gz" -mtime +7 -delete 2>/dev/null || true
    
    # Compresează logs mai vechi de 1 zi
    find $ADDON_DIR/logs -type f -name "*.log" -mtime +1 -exec gzip {} \; 2>/dev/null || true
fi

# 4. Verificare spațiu disk
log "Checking disk space..."
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 90 ]; then
    log "WARNING: Disk usage is at ${DISK_USAGE}%!"
    
    # Cleanup mai agresiv
    find $ADDON_DIR/temp -type f -mtime +1 -delete 2>/dev/null || true
    find $ADDON_DIR/cache -type f -mtime +7 -delete 2>/dev/null || true
    
    # Cleanup system logs
    journalctl --vacuum-time=2d 2>/dev/null || true
fi

# 5. Verificare servicii
log "Checking services..."
for service in stremio-addon nginx; do
    if systemctl is-active --quiet $service; then
        log "$service: active"
    else
        log "WARNING: $service is not running!"
        # Încearcă restart
        systemctl restart $service || log "ERROR: Failed to restart $service"
    fi
done

# 6. Verificare certificate SSL
log "Checking SSL certificate..."
DOMAIN=$(grep PUBLIC_URL $ADDON_DIR/.env 2>/dev/null | cut -d'=' -f2 | sed 's|https://||' | sed 's|/$||')
if [ ! -z "$DOMAIN" ]; then
    CERT_EXPIRY=$(echo | openssl s_client -servername $DOMAIN -connect $DOMAIN:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d'=' -f2)
    if [ ! -z "$CERT_EXPIRY" ]; then
        EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s 2>/dev/null || echo 0)
        CURRENT_EPOCH=$(date +%s)
        DAYS_LEFT=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))
        
        if [ $DAYS_LEFT -lt 30 ] && [ $DAYS_LEFT -gt 0 ]; then
            log "WARNING: SSL certificate expires in $DAYS_LEFT days!"
            # Încearcă reînnoire
            certbot renew --quiet || log "ERROR: Failed to renew certificate"
        else
            log "SSL certificate valid for $DAYS_LEFT days"
        fi
    fi
fi

# 7. Optimizare bază de date (dacă folosești SQLite pentru cache)
if [ -f "$ADDON_DIR/cache/cache.db" ]; then
    log "Optimizing cache database..."
    sqlite3 $ADDON_DIR/cache/cache.db "VACUUM;" 2>/dev/null || true
fi

# 8. Restart serviciu dacă folosește prea multă memorie
log "Checking memory usage..."
ADDON_PID=$(systemctl show -p MainPID stremio-addon | cut -d'=' -f2)
if [ "$ADDON_PID" != "0" ]; then
    MEM_PERCENT=$(ps -p $ADDON_PID -o %mem= 2>/dev/null | tr -d ' ')
    if (( $(echo "$MEM_PERCENT > 50" | bc -l) )); then
        log "WARNING: Addon using ${MEM_PERCENT}% memory, restarting..."
        systemctl restart stremio-addon
    else
        log "Memory usage: ${MEM_PERCENT}%"
    fi
fi

# 9. Cleanup maintenance logs mai vechi
find /var/log -name "stremio-maintenance.log*" -mtime +30 -delete 2>/dev/null || true

# 10. Raport final
log "=== Maintenance completed ==="
FINAL_DISK=$(df -h / | awk 'NR==2 {print $4}')
log "Free disk space: $FINAL_DISK"

# Trimite notificare dacă sunt probleme (opțional)
if grep -q "WARNING\|ERROR" $LOG_FILE; then
    # Poți adăuga aici notificare email sau webhook
    :
fi