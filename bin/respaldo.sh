#!/bin/sh
# Respaldo nocturno del servicio e-CF: empresas, claves, certificados, recibidos y registro de actividad.
# Uso (cron de root en el servidor):  15 3 * * * /opt/ecf-servicio/respaldo.sh >> /opt/ecf-servicio/respaldos/respaldo.log 2>&1
# El archivo lleva certificados y claves: queda con permisos 600 y no debe salir del servidor sin cifrar.
set -eu
RAIZ="${ECF_RAIZ:-/opt/ecf-servicio}"
DESTINO="$RAIZ/respaldos"
DIAS="${ECF_RESPALDO_DIAS:-30}"
umask 077
mkdir -p "$DESTINO"
ARCHIVO="$DESTINO/ecf-$(date +%Y%m%d-%H%M).tar.gz"
PARTES=""
for carpeta in config certificates bandeja actividad; do
  [ -d "$RAIZ/$carpeta" ] && PARTES="$PARTES $carpeta"
done
# shellcheck disable=SC2086
tar -czf "$ARCHIVO.tmp" -C "$RAIZ" $PARTES
tar -tzf "$ARCHIVO.tmp" >/dev/null          # se comprueba que se puede leer antes de darlo por bueno
mv "$ARCHIVO.tmp" "$ARCHIVO"
find "$DESTINO" -name 'ecf-*.tar.gz' -mtime +"$DIAS" -delete
echo "$(date '+%Y-%m-%d %H:%M') respaldo $(basename "$ARCHIVO") $(du -h "$ARCHIVO" | cut -f1)"
