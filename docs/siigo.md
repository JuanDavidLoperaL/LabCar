# Integración con Siigo (factura electrónica DIAN)

Estado: **preparado, sin conectar**. Las ventas que piden factura quedan en cola con
`invoice.status = "pending"` hasta que exista la Firebase Function que las envíe a Siigo.

## Qué ya existe

| Pieza | Dónde |
|---|---|
| Estado de la factura en cada venta | `sales/{id}.invoice` → `status`, `recipient`, `number`, `cufe`, `pdfUrl`, `error` (`src/ts/models/sale.ts`) |
| A nombre de quién | `invoice.recipient`: `customer` (datos en `sales/{id}.customer`) o `final-consumer` (222222222222, `src/ts/lib/dian.ts`) |
| Datos fiscales del cliente | `customer`: tipo y número de documento, DV (NIT), tipo de persona, nombre/razón social, correo, celular, dirección, ciudad, régimen |
| Servicios con precio, descuento y total | `sales/{id}.items[]` |
| Datos del emisor | `src/ts/config/business.ts` (NIT 1039474010-0) |
| Cálculo de totales compartible con el servidor | `src/ts/features/sales/pricing.ts` (lógica pura, sin Firebase ni DOM) |
| Cola visible | Historial de ventas → columna "Factura" y detalle de la venta |

## Qué falta (requiere plan Blaze)

1. **Firebase Functions** en `functions/` (TypeScript).
2. Credenciales de Siigo en Secret Manager:
   `firebase functions:secrets:set SIIGO_USERNAME`, `SIIGO_ACCESS_KEY` (y el `Partner-Id` que asigna Siigo).
3. Function `issueInvoice` disparada al crear una venta con `invoice.status == "pending"`:
   - Autenticarse en Siigo (`/auth`) y reutilizar el token (dura ~24 h).
   - Mapear `items`, `customer` / consumidor final y forma de pago a la factura de Siigo
     (los IDs de tipo de comprobante, impuestos y medios de pago salen de la cuenta de Siigo).
   - Guardar el resultado en la venta: `status: "issued"`, `number`, `cufe`, `pdfUrl`; o `status: "error"` y `error`.
4. (Recomendado) Mover el registro de la venta a una Function `createSale` que recalcule totales y
   comisiones con `pricing.ts`; las reglas de Firestore quedan como respaldo.

Las reglas actuales solo permiten crear facturas en `not-requested` o `pending`; los estados
`issued`/`error` los escribirá la Function (con privilegios de administrador).
