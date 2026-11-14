# Operación del servicio e-CF multiempresa

Un mismo servicio firma y envía los e-CF de varias empresas. Cada empresa tiene su RNC, su certificado y su clave
de API; ninguna puede usar el certificado de otra.

## Saber si funciona

| Qué | Dónde |
|---|---|
| ¿Se puede facturar? | `GET /health` → `status: ok` (HTTP 200). `atascado` (HTTP 503) = la fila de la DGII no avanza |
| ¿Responde la DGII? | `GET /health` → `dgii: ok` o `sin respuesta` (no es un fallo del servicio) |
| Estado por empresa | `https://<servicio>/admin` con la clave de administración (`API_KEY_ADMIN` del stack) |
| Registro | `/opt/ecf-servicio/logs/combined.log` y `error.log` (rotan solos) |

El panel es de **solo consulta**: fila, respuesta de la DGII, y por empresa los documentos del mes, los errores,
el vencimiento del certificado y lo recibido que su Odoo aún no recogió.

## Protecciones

- Cada petición a la DGII tiene un máximo de 25 s y cada tarea de la fila 50 s (`DGII_LIMITE_PETICION`,
  `DGII_LIMITE_TAREA`, en segundos). Una llamada sin respuesta falla sola; no detiene a las demás empresas.
- Una llamada que esperó más de 45 s su turno (`DGII_LIMITE_ESPERA`) no se envía: Odoo ya dejó de esperarla.
- Si aun así la fila se detuviera, el proceso termina y Docker lo arranca de nuevo.
- Tras 8 claves erróneas en 15 minutos desde una dirección, esa dirección no puede usar la clave de
  administración durante 15 minutos. Las claves de empresa no se bloquean.

## Avisos al móvil

`bin/vigia.sh` corre cada minuto en otro servidor (hoy 192.168.2.68, `/opt/ecf-vigia`), consulta `/health` y,
tras 3 minutos sin servicio (5 si es la DGII la que no responde), llama a un webhook de Home Assistant
(automatización «Servicio e-CF - aviso de caída») que notifica por Telegram y al móvil. Avisa también al volver.
Va fuera del servidor del servicio a propósito: si se cae la máquina entera, avisa igual.

## Dar de alta una empresa (10 minutos)

1. Copiar su certificado al servidor: `/opt/ecf-servicio/certificates/<RNC>.p12` (permisos 600).
2. Guardar la clave del certificado en `/opt/ecf-servicio/config/<RNC>.clave` (permisos 600, sin salto de línea).
3. Darla de alta, primero en pruebas:
   `docker exec ecf-servicio node bin/empresa.js alta <RNC> "<RAZÓN SOCIAL>" cert /app/config/<RNC>.clave`
   Muestra la clave de API **una sola vez**: va en el Odoo de la empresa.
4. Comprobar: en el panel aparece la empresa con los días de su certificado; desde su Odoo, «Probar conexión».
5. Registrar en la Oficina Virtual de la DGII sus direcciones (el formulario fija el final de la ruta):
   `https://<servicio>/<RNC>` en Recepción, Aprobación comercial y Autenticación.
6. Al pasar a producción: editar `"ambiente": "prod"` en `config/empresas.json` (se relee solo).

No hace falta reiniciar: el archivo de empresas se vuelve a leer cuando cambia.

## Renovar un certificado

1. Sustituir `/opt/ecf-servicio/certificates/<RNC>.p12` y, si cambió, `config/<RNC>.clave`.
2. Reiniciar para que se cargue el nuevo: `docker restart ecf-servicio` (unos segundos sin servicio).
3. En el panel, la empresa debe mostrar la nueva fecha de vencimiento.

## Baja o suspensión

En `config/empresas.json`, `"activa": false` en la empresa: su clave deja de servir al momento.
`node bin/empresa.js nueva-clave <RNC>` cambia su clave (la anterior deja de servir).

## Respaldo

`bin/respaldo.sh` (copiado a `/opt/ecf-servicio/respaldo.sh`, cron diario) guarda `config`, `certificates`,
`bandeja` y `actividad` en `/opt/ecf-servicio/respaldos/`, 30 días. Para restaurar: detener el contenedor,
`tar -xzf <archivo> -C /opt/ecf-servicio` y arrancarlo.

## Desplegar

Portainer reconstruye y despliega con cada cambio subido a la rama configurada en el stack. Las dependencias
están fijadas (`package-lock.json`, `npm ci`). Al desplegar el servicio se corta unos segundos; Odoo reintenta solo.
