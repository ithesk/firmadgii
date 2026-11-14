#!/bin/sh
# Vigía del servicio e-CF: se ejecuta cada minuto FUERA del servidor del servicio (si se cae el servidor entero,
# también avisa). Consulta /health y, tras varios fallos seguidos, llama a un webhook (Home Assistant) que
# notifica al móvil. Avisa una vez al caer y otra al recuperarse.
#   Configuración: /opt/ecf-vigia/vigia.conf  →  URL_SALUD=…  WEBHOOK=…   (permisos 600)
#   Cron:  * * * * * /opt/ecf-vigia/vigia.sh
set -u
DIR="$(dirname "$0")"
. "$DIR/vigia.conf"
FALLOS_PARA_AVISAR="${FALLOS_PARA_AVISAR:-3}"       # minutos seguidos sin servicio
FALLOS_DGII_PARA_AVISAR="${FALLOS_DGII_PARA_AVISAR:-5}"
ESTADO="$DIR/estado"
mkdir -p "$ESTADO"
leer() { cat "$ESTADO/$1" 2>/dev/null || echo "${2:-0}"; }
avisar() {
  cuerpo=$(printf '{"titulo":"%s","mensaje":"%s"}' "$1" "$2")
  curl -s -m 10 -o /dev/null -X POST -H 'Content-Type: application/json' -d "$cuerpo" "$WEBHOOK" \
    || echo "$(date '+%F %T') no se pudo avisar: $1" >> "$DIR/vigia.log"
  echo "$(date '+%F %T') $1 — $2" >> "$DIR/vigia.log"
}
# Aviso al caer (al llegar al umbral) y al volver (si se había avisado)
evaluar() {  # nombre  bien(1/0)  umbral  titulo_mal  texto_mal  titulo_bien
  n=$(leer "$1.fallos"); avisado=$(leer "$1.avisado")
  if [ "$2" = 1 ]; then
    if [ "$avisado" = 1 ]; then
      desde=$(leer "$1.desde" "$(date +%s)")
      avisar "$6" "Volvió a funcionar tras $(( ($(date +%s) - desde) / 60 )) min."
    fi
    echo 0 > "$ESTADO/$1.fallos"; echo 0 > "$ESTADO/$1.avisado"
  else
    [ "$n" = 0 ] && date +%s > "$ESTADO/$1.desde"
    n=$((n + 1)); echo "$n" > "$ESTADO/$1.fallos"
    if [ "$n" -ge "$3" ] && [ "$avisado" != 1 ]; then
      echo 1 > "$ESTADO/$1.avisado"
      avisar "$4" "$5"
    fi
  fi
}

respuesta=$(curl -s -m 15 -w '\n%{http_code}' "$URL_SALUD" 2>/dev/null)
codigo=$(printf '%s' "$respuesta" | tail -n 1)
cuerpo=$(printf '%s' "$respuesta" | sed '$d' | tr -d '\n' | cut -c1-200)

servicio=0
[ "$codigo" = 200 ] && printf '%s' "$cuerpo" | grep -q '"status":"ok"' && servicio=1
if [ "$servicio" = 0 ]; then
  # Sin internet aquí no se puede saber nada del servicio: no cuenta como caída
  curl -s -m 8 -o /dev/null https://www.google.com/generate_204 || exit 0
fi
detalle="sin respuesta"
[ -n "$codigo" ] && [ "$codigo" != 000 ] && detalle="HTTP $codigo $(printf '%s' "$cuerpo" | grep -o '"status":"[a-z]*"' | tr -cd 'a-z:' | cut -c1-40)"
evaluar servicio "$servicio" "$FALLOS_PARA_AVISAR" \
  "Servicio e-CF caído" "fe.ithesk.com no responde desde hace $FALLOS_PARA_AVISAR min ($detalle). No se puede facturar." \
  "Servicio e-CF recuperado"

# La DGII solo se puede valorar si el servicio contesta
if [ "$servicio" = 1 ]; then
  dgii=1
  printf '%s' "$cuerpo" | grep -q '"dgii":"sin respuesta"' && dgii=0
  evaluar dgii "$dgii" "$FALLOS_DGII_PARA_AVISAR" \
    "DGII sin respuesta" "La DGII no responde desde hace varios minutos. El servicio funciona; las facturas quedan en espera y se envían solas al volver." \
    "DGII recuperada"
fi
