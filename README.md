# 🇩🇴 Microservicio DGII e-CF

Microservicio Node.js para facturación electrónica de República Dominicana (DGII e-CF).

## 📋 Características

- ✅ Autenticación con DGII
- ✅ Firma digital de documentos XML
- ✅ Envío de facturas electrónicas (e-CF)
- ✅ Consulta de estados por trackID
- ✅ Consulta de historial de tracks
- ✅ Validación de facturas
- ✅ Soporte multi-tenant (múltiples RNCs)
- ✅ Logging detallado con Winston
- ✅ Validación de requests con Joi
- ✅ Manejo robusto de errores
- ✅ Dockerizado

## 🚀 Inicio Rápido

### Prerequisitos

- Node.js >= 20.0.0
- npm o pnpm
- Certificado digital .p12 válido

### Instalación

```bash
# Clonar el repositorio
git clone <repository-url>
cd firmadgii

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores

# Agregar certificado .p12
cp /path/to/your/certificado.p12 ./certificates/

# Desarrollo
npm run dev

# Producción
npm run build
npm start
```

### Con Docker

```bash
# Construir y ejecutar
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener
docker-compose down
```

## 🔧 Configuración

### Variables de Entorno

Crear archivo `.env`:

```env
PORT=3000
NODE_ENV=development

CERTIFICATE_PATH=./certificates/certificado.p12
CERTIFICATE_PASSWORD=tu_password_certificado

DGII_ENVIRONMENT=test
API_KEY=tu_api_key_segura

LOG_LEVEL=info
```

### Ambientes DGII

- `test`: TesteCF (desarrollo)
- `cert`: CerteCF (certificación)
- `prod`: eCF (producción)

## 📡 API Endpoints

### 🎯 **Documentación Interactiva con Swagger**

**La API cuenta con documentación Swagger/OpenAPI completa:**

```bash
# Iniciar servidor
npm run dev

# Abrir Swagger UI en el navegador
http://localhost:3000/api-docs
```

**Características:**
- ✅ Interfaz interactiva para probar endpoints
- ✅ Documentación completa de requests/responses
- ✅ Ejemplos de uso con autenticación
- ✅ Validación de esquemas en tiempo real
- ✅ Organización por categorías (tags)

**Swagger JSON spec disponible en:** `http://localhost:3000/api-docs.json`

---

### Health Check

```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-09T...",
  "environment": "test"
}
```

---

### Autenticación

#### POST `/api/auth/dgii`

Autenticar con DGII y obtener token.

**Headers:**
```
x-api-key: your_api_key
```

**Body:**
```json
{
  "environment": "test"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "Bearer eyJhbGc...",
    "expiresIn": 3600
  }
}
```

---

### Firmar XML

#### POST `/api/invoice/sign`

Firma un documento XML sin enviarlo a DGII.

**Headers:**
```
x-api-key: your_api_key
```

**Body:**
```json
{
  "xmlData": "<ECF>...</ECF>",
  "documentType": "ECF"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "signedXml": "<ECF>...<Signature>...</Signature></ECF>",
    "securityCode": "ABC123"
  }
}
```

---

### Enviar Factura

#### POST `/api/invoice/send`

Convierte JSON a XML, firma y envía a DGII.

**Headers:**
```
x-api-key: your_api_key
```

**Body:**
```json
{
  "invoiceData": {
    "ECF": {
      "Encabezado": {
        "Version": 1.0,
        "IdDoc": {
          "TipoeCF": 31,
          "eNCF": "E310005000201",
          "FechaVencimientoSecuencia": "31-12-2025",
          "IndicadorEnvioDiferido": 0,
          "IndicadorMontoGravado": 1,
          "TipoIngresos": "01",
          "TipoPago": 1
        },
        "Emisor": {
          "RNCEmisor": "130862346",
          "RazonSocialEmisor": "MI EMPRESA SRL",
          "DireccionEmisor": "Calle Principal #123",
          "FechaEmision": "09-12-2025"
        },
        "Comprador": {
          "RNCComprador": "123456789",
          "RazonSocialComprador": "CLIENTE SRL"
        },
        "Totales": {
          "MontoTotal": 11800.00,
          "MontoGravadoTotal": 10000.00,
          "TotalITBIS": 1800.00
        }
      },
      "DetallesItems": {
        "Item": [
          {
            "NumeroLinea": 1,
            "IndicadorFacturacion": 1,
            "NombreItem": "Producto de prueba",
            "CantidadItem": 1,
            "PrecioUnitarioItem": 10000.00,
            "MontoItem": 10000.00
          }
        ]
      },
      "Subtotales": {
        "Subtotal": [
          {
            "NumeroSubtotal": 1,
            "DescripcionSubtotal": "Operaciones Gravadas",
            "MontoSubtotal": 10000.00
          }
        ]
      }
    }
  },
  "rnc": "130862346",
  "encf": "E310005000201",
  "environment": "test"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "trackId": "d2b6e27c-3908-46f3-afaa-2207b9501b4b",
    "codigo": "1",
    "estado": "Aceptado",
    "rnc": "130862346",
    "encf": "E310005000201",
    "fechaRecepcion": "9/12/2025 5:06:57 PM",
    "signedXml": "<ECF>...</ECF>",
    "securityCode": "ABC123",
    "qrCodeUrl": "https://dgii.gov.do/ecf/qr?..."
  }
}
```

---

### Enviar Resumen (Factura Consumo < 250k)

#### POST `/api/invoice/send-summary`

Envía factura de consumo (tipo 32) menor a RD$250,000 como resumen (RFCE).

**Headers:**
```
x-api-key: your_api_key
```

**Body:**
```json
{
  "invoiceData": {
    "RFCE": {
      "Encabezado": {
        "Version": "1.0",
        "IdDoc": {
          "TipoeCF": 32,
          "eNCF": "E320000000001",
          "TipoIngresos": "01",
          "TipoPago": 1
        },
        "Emisor": {
          "RNCEmisor": "130939616",
          "RazonSocialEmisor": "MI EMPRESA SRL",
          "FechaEmision": "18-12-2025"
        },
        "Comprador": {
          "RNCComprador": "131880681",
          "RazonSocialComprador": "CLIENTE SRL"
        },
        "Totales": {
          "MontoGravadoTotal": 10000,
          "MontoGravadoI1": 10000,
          "MontoExento": 0,
          "TotalITBIS": 1800,
          "TotalITBIS1": 1800,
          "MontoTotal": 11800,
          "MontoNoFacturable": 0,
          "MontoPeriodo": 11800
        },
        "CodigoSeguridadeCF": "ABC123"
      }
    }
  },
  "rnc": "130939616",
  "encf": "E320000000001",
  "environment": "cert"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "codigo": 1,
    "estado": "Aceptado",
    "encf": "E320000000001",
    "secuenciaUtilizada": true,
    "signedXml": "<RFCE>...</RFCE>",
    "securityCode": "ABC123"
  }
}
```

> **Nota:** Para facturas tipo 32 >= RD$250,000 usar `/api/invoice/send` con formato ECF.

---

### Enviar Resumen con ECF Firmado (< 250k)

#### POST `/api/invoice/send-summary-with-ecf`

Para facturas de consumo menores a RD$250,000. Este endpoint:
1. Firma el ECF completo (con DetallesItems) → para guardar localmente
2. Convierte a RFCE (sin DetallesItems)
3. Firma el RFCE y envía a DGII

**Headers:**
```
x-api-key: your_api_key
```

**Body:**
```json
{
  "invoiceData": {
    "ECF": {
      "Encabezado": {
        "Version": "1.0",
        "IdDoc": {
          "TipoeCF": 32,
          "eNCF": "E320000000001",
          "TipoIngresos": "01",
          "TipoPago": 1
        },
        "Emisor": {
          "RNCEmisor": "130939616",
          "RazonSocialEmisor": "MI EMPRESA SRL",
          "FechaEmision": "18-12-2025"
        },
        "Comprador": {
          "RNCComprador": "131880681",
          "RazonSocialComprador": "CLIENTE SRL"
        },
        "Totales": {
          "MontoGravadoTotal": 10000,
          "MontoGravadoI1": 10000,
          "MontoExento": 0,
          "TotalITBIS": 1800,
          "TotalITBIS1": 1800,
          "MontoTotal": 11800,
          "MontoNoFacturable": 0
        }
      },
      "DetallesItems": {
        "Item": [
          {
            "NumeroLinea": 1,
            "IndicadorFacturacion": 1,
            "NombreItem": "Producto de prueba",
            "CantidadItem": 1,
            "PrecioUnitarioItem": 10000,
            "MontoItem": 10000
          }
        ]
      }
    }
  },
  "rnc": "130939616",
  "encf": "E320000000001",
  "environment": "cert"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "codigo": 1,
    "estado": "Aceptado",
    "encf": "E320000000001",
    "secuenciaUtilizada": true,
    "signedEcfXml": "<ECF>...<Signature>...</Signature></ECF>",
    "signedRfceXml": "<RFCE>...<Signature>...</Signature></RFCE>",
    "ecfSecurityCode": "ABC123",
    "rfceSecurityCode": "DEF456",
    "qrCodeUrl": "https://dgii.gov.do/ecf/qr?..."
  }
}
```

> **Uso:** El `signedEcfXml` contiene la factura completa firmada para guardar en tu sistema. El `signedRfceXml` es el resumen que se envió a DGII.

---

### Consultar Estado

#### GET `/api/invoice/status/:trackId`

Consulta el estado de un documento por trackID.

**Headers:**
```
x-api-key: your_api_key
```

**Response:**
```json
{
  "success": true,
  "data": {
    "trackId": "d2b6e27c-3908-46f3-afaa-2207b9501b4b",
    "codigo": "1",
    "estado": "Aceptado",
    "rnc": "130862346",
    "encf": "E310005000201",
    "secuenciaUtilizada": true,
    "fechaRecepcion": "9/12/2025 5:06:57 PM",
    "mensajes": [
      {
        "valor": "Documento aceptado correctamente",
        "codigo": 0
      }
    ]
  }
}
```

---

### Consultar Tracks

#### GET `/api/invoice/tracks/:rnc/:encf`

Obtiene todos los trackIDs de un e-NCF.

**Headers:**
```
x-api-key: your_api_key
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "trackId": "d2b6e27c-3908-...",
      "fechaEnvio": "9/12/2025 5:00:00 PM",
      "estado": "Aceptado"
    }
  ]
}
```

---

### Validar Factura

#### POST `/api/invoice/inquire`

Valida la existencia y estado de un e-CF.

**Headers:**
```
x-api-key: your_api_key
```

**Body:**
```json
{
  "rncEmisor": "130862346",
  "encf": "E310005000201",
  "rncComprador": "123456789",
  "securityCode": "ABC123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valido": true,
    "estado": "Vigente",
    "fechaEmision": "09-12-2025",
    "montoTotal": 11800.00
  }
}
```

---

### Información del Certificado

#### GET `/api/certificate/info`

Obtiene información del certificado .p12.

**Headers:**
```
x-api-key: your_api_key
```

**Query Params:**
- `rnc` (opcional): RNC específico

**Response:**
```json
{
  "success": true,
  "data": {
    "subject": "CN=EMPRESA SRL, OU=...",
    "issuer": "CN=DIGIFIRMA CA, O=...",
    "validFrom": "2024-01-01T00:00:00Z",
    "validTo": "2026-01-01T00:00:00Z",
    "serialNumber": "1234567890"
  }
}
```

---

## 🔐 Seguridad

### Autenticación

Todas las peticiones a `/api/*` requieren header:

```
x-api-key: your_api_key
```

### Certificados Multi-Tenant

Para soportar múltiples RNCs:

```
certificates/
  ├── 130862346.p12  # RNC empresa 1
  ├── 131880738.p12  # RNC empresa 2
  └── certificado.p12 # Default
```

El microservicio selecciona automáticamente el certificado según el RNC en el request.

---

## 🏢 Multiempresa

Un solo servicio para varias empresas. Cada una tiene su RNC, su certificado, **su propia clave de API**
(que solo puede usar el certificado de su RNC) y el Odoo al que se avisan los documentos recibidos.

```bash
node scripts/empresa.js alta 133524996 "MI EMPRESA SRL" cert /ruta/clave-del-certificado.txt
# → muestra UNA vez la clave de API; en config/empresas.json queda solo su SHA-256
node scripts/empresa.js nueva-clave 133524996
node scripts/empresa.js lista
```

`config/empresas.json` (o `EMPRESAS_PATH`) admite por empresa: `certificado` (por defecto `certificates/<RNC>.p12`),
`claveCertificadoArchivo` o `claveCertificado`, `ambiente`, `odooWebhookUrl`, `odooWebhookApiKey`, `activa`.
Se relee solo al cambiar. `API_KEY_ADMIN` (opcional) da acceso a todas. Sin archivo de empresas, el servicio
funciona como antes con una sola `API_KEY`.

URLs que cada empresa registra en su postulación ante la DGII (RNC delante):

```
https://<servicio>/<RNC>/fe/recepcion/api/ecf
https://<servicio>/<RNC>/fe/aprobacioncomercial/api/ecf
https://<servicio>/<RNC>/fe/autenticacion/api/semilla
https://<servicio>/<RNC>/fe/autenticacion/api/validacioncertificado
```

Las llamadas a la DGII se hacen en fila dentro del proceso (dgii-ecf guarda el token en una cabecera global).

---

## 📊 Logging

Los logs se guardan en:

- `logs/error.log`: Solo errores
- `logs/combined.log`: Todos los logs

Formato JSON con:
- timestamp
- level (error, warn, info, debug)
- message
- metadata

---

## 🧪 Testing

### Postman Collection

Importar `postman_collection.json` (pendiente de crear).

### Ejemplo con cURL

```bash
# Health check
curl http://localhost:3000/health

# Autenticar
curl -X POST http://localhost:3000/api/auth/dgii \
  -H "x-api-key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"environment": "test"}'

# Enviar factura
curl -X POST http://localhost:3000/api/invoice/send \
  -H "x-api-key: your_api_key" \
  -H "Content-Type: application/json" \
  -d @invoice.json
```

---

## 🐛 Manejo de Errores

Todos los errores retornan:

```json
{
  "success": false,
  "error": "Mensaje de error descriptivo"
}
```

Códigos HTTP:
- `400`: Bad Request (validación)
- `401`: Unauthorized (API key inválida)
- `404`: Not Found
- `500`: Internal Server Error

---

## 📂 Estructura del Proyecto

```
firmadgii/
├── src/
│   ├── config/
│   │   └── environment.ts
│   ├── controllers/
│   │   ├── authController.ts
│   │   ├── invoiceController.ts
│   │   └── certificateController.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── errorHandler.ts
│   │   └── validation.ts
│   ├── routes/
│   │   ├── authRoutes.ts
│   │   ├── invoiceRoutes.ts
│   │   ├── certificateRoutes.ts
│   │   └── index.ts
│   ├── services/
│   │   ├── certificateService.ts
│   │   └── dgiiService.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   └── logger.ts
│   ├── app.ts
│   └── index.ts
├── certificates/
├── logs/
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🔄 Integración con Odoo

Ver `plan_implementacion.md` para ejemplo completo de integración.

Ejemplo básico:

```python
import requests

MICROSERVICE_URL = 'http://localhost:3000/api'
API_KEY = 'your_api_key'

def send_invoice(invoice_data, rnc, encf):
    response = requests.post(
        f'{MICROSERVICE_URL}/invoice/send',
        json={
            'invoiceData': invoice_data,
            'rnc': rnc,
            'encf': encf,
            'environment': 'test'
        },
        headers={'x-api-key': API_KEY},
        timeout=30
    )
    return response.json()
```

---

## 📚 Recursos

- [DGII - Facturación Electrónica](https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/default.aspx)
- [dgii-ecf GitHub](https://github.com/victors1681/dgii-ecf)
- [dgii-ecf NPM](https://www.npmjs.com/package/dgii-ecf)

---

## 📝 Licencia

MIT

---

## 👨‍💻 Autor

Basado en la librería [dgii-ecf](https://github.com/victors1681/dgii-ecf) de Victor Santos.

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea un branch (`git checkout -b feature/AmazingFeature`)
3. Commit cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push al branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request
