# CatrachoGo API

API backend de **CatrachoGo**, una plataforma de viajes tipo ride-hailing para Honduras. Construida con **NestJS 11 + Prisma ORM 7 + PostgreSQL/PostGIS**, expone autenticación (email/password y Google Sign-In), gestión de conductores con verificación de documentos, cálculo de tarifas geoespacial, ciclo de vida completo de viajes con matching de conductores y no-show, billetera con integración PayPal y comisión de plataforma, calificaciones, direcciones favoritas, reportes de incidencias, notificaciones (in-app + push vía Expo) y un panel de administración.

## Tabla de contenido

- [Stack tecnológico](#stack-tecnológico)
- [Requisitos](#requisitos)
- [Puesta en marcha](#puesta-en-marcha)
- [Variables de entorno](#variables-de-entorno)
- [Scripts disponibles](#scripts-disponibles)
- [Arquitectura y módulos](#arquitectura-y-módulos)
- [Modelo de datos](#modelo-de-datos)
- [Referencia de la API](#referencia-de-la-api)
- [Integraciones externas](#integraciones-externas)
- [Seguridad](#seguridad)
- [Limitaciones y pendientes conocidos](#limitaciones-y-pendientes-conocidos)

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Framework | [NestJS](https://nestjs.com/) 11 |
| ORM | [Prisma ORM](https://www.prisma.io/) 7 (cliente TS nativo, `moduleFormat = "cjs"`, driver adapter `@prisma/adapter-pg`) |
| Base de datos | PostgreSQL 17 + PostGIS 3.5 (cálculos geoespaciales: distancia, radio de búsqueda, polígono de Honduras) |
| Autenticación | JWT (`@nestjs/jwt` + `passport-jwt`), con expiración distinta por plataforma (web vs. mobile), y Google Sign-In (`google-auth-library`) validando contra múltiples Client IDs |
| Hashing de contraseñas | Argon2id (`argon2`) |
| Pagos | PayPal Checkout (`@paypal/paypal-server-sdk`), sandbox/live vía `PAYPAL_MODE` |
| Mapas / distancia real | Google Directions API (`@googlemaps/google-maps-services-js`), con fallback a distancia en línea recta (PostGIS `ST_Distance` × 1.3) si la API falla |
| Almacenamiento de imágenes | Cloudinary — la subida ocurre en el cliente (web/móvil); el backend valida que la URL sea de `res.cloudinary.com` y además **llama a la API de Cloudinary** (`cloudinary` SDK) para borrar la foto de perfil anterior cuando se sube una nueva |
| Notificaciones push | [Expo Push API](https://docs.expo.dev/push-notifications/overview/) — no requiere credenciales de servidor; se envía a los `pushToken` (Expo push tokens) registrados por los clientes |
| Validación | `class-validator` + `class-transformer`, `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) |
| Seguridad HTTP | `helmet`, `@nestjs/throttler` (rate limiting global + por ruta en `login`/`register`) |
| Runtime | Node.js 24 LTS |

## Requisitos

- Node.js ≥ 24
- PostgreSQL con PostGIS (o Docker, ver `docker-compose.yml`)
- Cuenta de PayPal Developer (sandbox) para probar recargas de billetera
- Credenciales de Google OAuth (Client ID) para el login con Google — uno para web y, opcionalmente, uno o más para mobile (Android/iOS)
- API key de Google Maps con la **Directions API** habilitada
- Cuenta de Cloudinary (cloud name + API key/secret) — el backend la usa para borrar fotos de perfil reemplazadas
- No hace falta ninguna cuenta/credencial adicional para las notificaciones push (Expo Push API es pública para el envío básico)

## Puesta en marcha

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar variables de entorno y completar los valores reales
cp .env.example .env

# 3. Levantar PostgreSQL/PostGIS
docker compose up -d db

# 4. Generar el cliente de Prisma y aplicar migraciones
npx prisma generate
npx prisma migrate dev

# 5. Sembrar datos base (orden recomendado)
npx tsx prisma/seed-admin.ts             # usuario admin (lee ADMIN_EMAIL/ADMIN_PASSWORD de .env)
npx tsx prisma/seed-fare-zones.ts        # las 4 zonas de tarifa
npx tsx prisma/seed.ts                   # 50 pasajeros + 20 conductores de prueba (password: Test1234!)
npx tsx prisma/seed-platform-wallet.ts   # crea el usuario/wallet de plataforma; copia el PLATFORM_USER_ID que imprime a tu .env
npx tsx prisma/import-honduras-boundary.ts  # importa el polígono de Honduras a PostGIS (ver nota abajo)
npx tsx prisma/seed-bulk.ts              # opcional: 25,000 viajes históricos de prueba (requiere haber corrido seed.ts antes)

# 6. Levantar la API en modo desarrollo
npm run start:dev
```

> ⚠️ **`npx tsx prisma/import-honduras-boundary.ts`** espera un archivo `./honduras-boundary.geojson` en la raíz del proyecto (GeoJSON del polígono/multipolígono de Honduras, ej. de [geoBoundaries](https://www.geoboundaries.org/)) — descárgalo antes de correr el script. Sin la tabla `honduras_boundary` poblada, `POST /trips/estimate` y `POST /trips` fallan (`FareCalculationService.isWithinHonduras` depende de ella).

> ⚠️ **`npx tsx prisma/seed-platform-wallet.ts`** imprime un `PLATFORM_USER_ID` que **debes copiar a tu `.env`** antes de probar cualquier flujo de viaje: completar un viaje, cancelarlo con cargo, o reportar no-show, todos mueven dinero hacia la wallet de la plataforma (`process.env.PLATFORM_USER_ID`) y fallan si esa variable no apunta a un usuario/wallet real.

> ⚠️ `docker-compose.yml` publica Postgres en el puerto **5433** del host (`"5433:5432"`), pero `.env.example` trae `DATABASE_URL`/`DIRECT_URL` apuntando a `localhost:5432`. Si usas Docker para la base de datos, actualiza el puerto en tu `.env` a `5433` (o cambia el mapeo en `docker-compose.yml`).

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión de Postgres usada en runtime por `PrismaService` (vía `@prisma/adapter-pg`) |
| `DIRECT_URL` | Cadena de conexión usada por `prisma migrate` (en `prisma.config.ts`). Igual a `DATABASE_URL` en local; en producción con pooler (PgBouncer, Supabase) debe apuntar directo a la base |
| `JWT_SECRET` | Secreto para firmar/verificar JWT. Genera uno fuerte con `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRES_IN` | Expiración del token **en segundos** (no `"7d"`) para clientes web. `604800` = 7 días |
| `JWT_EXPIRES_IN_MOBILE` | Expiración del token en segundos para clientes que mandan el header `X-Client-Platform: mobile` en `register`/`login`/`google`. `2592000` = 30 días — la app instalada necesita sesiones más largas que una pestaña de navegador |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Credenciales de la app de PayPal (Developer Dashboard) |
| `PAYPAL_MODE` | `sandbox` o `live` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciales del usuario admin creado por `prisma/seed-admin.ts` |
| `CORS_ORIGIN` | Dominio(s) permitidos, separados por coma. Nunca dejar `enableCors()` abierto en producción |
| `PORT` | Puerto HTTP de la API (default `3000`) |
| `GOOGLE_CLIENT_ID` | Client ID de OAuth (web) usado para verificar el `idToken` en `POST /auth/google` |
| `GOOGLE_CLIENT_ID_MOBILE` | Client ID(s) de OAuth adicionales para mobile (Android/iOS), separados por coma. `GoogleAuthService` acepta el `idToken` si su audiencia coincide con `GOOGLE_CLIENT_ID` **o** con cualquiera de estos |
| `GOOGLE_MAPS_API_KEY` | Key de Google Maps (Directions API) usada para calcular la distancia real de ruta en `POST /trips/estimate` y `POST /trips` |
| `CLOUDINARY_CLOUD_NAME` | Nombre del cloud de Cloudinary; lo usan los clientes (web/móvil) para subir imágenes directamente, y el backend para validar/borrar URLs |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Credenciales de la API de Cloudinary usadas por `CloudinaryService` (rol con permiso de **borrado**, no solo lectura) para eliminar la foto de perfil anterior cuando se actualiza |
| `PLATFORM_USER_ID` | `id` del usuario/wallet de plataforma (creado por `prisma/seed-platform-wallet.ts`). Recibe la comisión de cada viaje completado y la parte de plataforma de los cargos por cancelación/no-show |
| `PLATFORM_COMMISSION_RATE` | Fracción (ej. `0.10` = 10%) que se retiene de la tarifa de cada viaje `completed` como comisión de la plataforma |
| `CANCELLATION_FEE_AMOUNT` | Monto fijo cobrado al pasajero cuando cancela un viaje ya `accepted`, o cuando el conductor reporta no-show |
| `CANCELLATION_FEE_DRIVER_SHARE` | Fracción de `CANCELLATION_FEE_AMOUNT` que recibe el conductor (el resto va a la plataforma) |
| `NO_SHOW_GRACE_PERIOD_MINUTES` | Minutos que deben pasar desde que el conductor marca `arrived` antes de poder reportar no-show |

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run start` | Arranca la API (sin watch) |
| `npm run start:dev` | Arranca en modo watch |
| `npm run start:debug` | Modo watch + debugger |
| `npm run build` | Compila con `nest build` a `dist/` |
| `npm run start:prod` | Ejecuta el build compilado (`node dist/src/main`) |
| `npm run lint` | ESLint con `--fix` |
| `npm run test` / `test:watch` / `test:cov` | Tests unitarios (Jest) |
| `npm run test:e2e` | Tests end-to-end (`test/jest-e2e.json`) |
| `npx prisma generate` | Regenera el cliente Prisma en `generated/prisma` |
| `npx prisma migrate dev` | Aplica migraciones en desarrollo |
| `npx tsx prisma/seed-admin.ts` | Crea/actualiza el usuario admin |
| `npx tsx prisma/seed-fare-zones.ts` | Inserta las 4 zonas de tarifa |
| `npx tsx prisma/seed.ts` | Datos de prueba: 50 pasajeros + 20 conductores aprobados y disponibles |
| `npx tsx prisma/seed-platform-wallet.ts` | Crea el usuario/wallet de plataforma e imprime el `PLATFORM_USER_ID` a copiar en `.env` |
| `npx tsx prisma/import-honduras-boundary.ts` | Importa el polígono de Honduras (`./honduras-boundary.geojson`) a la tabla `honduras_boundary` en PostGIS |
| `npx tsx prisma/seed-bulk.ts` | Genera 25,000 viajes históricos en volumen (para pruebas de carga / Power BI) — requiere correr `seed.ts` primero |

## Arquitectura y módulos

```
src/
  common/
    decorators/roles.decorator.ts   → @Roles('admin')
    guards/roles.guard.ts           → RolesGuard, se combina con AuthGuard('jwt')
    filters/http-exception.filter.ts→ GlobalExceptionFilter (normaliza errores, preserva campos extra como `code`, loguea 500s)
    utils/env.util.ts               → getEnvOrThrow(): falla rápido si falta una env var obligatoria
    utils/pagination.util.ts        → paginationParams(page, limit)
    validators/is-cloudinary-url.ts → @IsCloudinaryUrl()
  prisma/                           → PrismaService (driver adapter pg) + PrismaModule (@Global)
  modules/
    auth/              → registro, login, Google Sign-In, foto de perfil, nombre, completar teléfono
    drivers/           → perfil de conductor, disponibilidad, resumen, verificación (incl. detalle admin por id)
    trips/             → estimación de tarifa, ciclo de vida del viaje (incluye llegada, no-show, cancelación con motivo, finalización anticipada)
    tracking/          → ubicación en tiempo real de conductores
    matching/          → TripCandidatesCache (caché en memoria de candidatos por viaje)
    wallet/            → billetera, integración PayPal, retiros, billetera de plataforma
    ratings/           → calificaciones entre pasajero y conductor
    admin/             → estadísticas agregadas, verificación de conductores, listado de viajes
    fare-zones/        → CRUD de zonas de tarifa
    notifications/     → notificaciones in-app (paginadas) + push (Expo), registro/borrado de push token
    saved-addresses/   → direcciones favoritas del pasajero (casa/trabajo/otro)
    incident-reports/  → reportes de incidencias de pasajeros sobre un viaje, revisión por admin
    cloudinary/        → CloudinaryService: valida URLs y borra assets vía la API de Cloudinary
```

**Por qué existe `MatchingModule`:** `TripsModule` necesita `DriversModule` (para buscar conductores cercanos) y `DriversModule` necesita la misma caché de candidatos (para que un conductor consulte si tiene una solicitud pendiente). Si la caché viviera dentro de `TripsModule` se formaría una dependencia circular `Trips → Drivers → Trips`. Por eso vive en su propio módulo (`TripCandidatesCache`), que ambos importan.

**Guards compuestos:** las rutas de administrador usan `@UseGuards(AuthGuard('jwt'), RolesGuard)` + `@Roles('admin')`. `RolesGuard` no rechaza nada si el handler/controller no tiene `@Roles(...)` — siempre se combina con `AuthGuard('jwt')`, nunca se usa solo.

**Notificaciones push, best-effort:** `NotificationsService.create()` guarda la notificación in-app y **además** intenta el push (`PushNotificationsService.send`); un fallo de red o un token inválido nunca revierte ni bloquea la operación principal (aceptar un viaje, resolver un retiro, etc.) — se loguea como warning y sigue. Los tokens que Expo marca como `DeviceNotRegistered` se limpian automáticamente (`User.pushToken = null`).

## Modelo de datos

Enums: `Role` (`passenger`/`driver`/`admin`), `VehicleType` (`car`/`motorcycle`), `VerificationStatus` (`pending`/`approved`/`rejected`), `TripStatus` (`pending`/`accepted`/`in_progress`/`completed`/`cancelled`), `WalletTransactionType` (`paypal_topup`/`trip_charge`/`trip_payout`/`withdrawal_adjustment`/`platform_commission`/`cancellation_fee`/`cancellation_payout`), `WithdrawalStatus` (`pending`/`completed`/`rejected`), `NotificationType` (`trip_accepted`/`trip_started`/`trip_completed`/`trip_cancelled`/`withdrawal_resolved`/`driver_verification_updated`/`rating_received`/`driver_arrived`), `SavedAddressLabel` (`home`/`work`/`other`), `IncidentReportCategory` (`safety`/`driver_behavior`/`vehicle_condition`/`payment`/`other`), `IncidentReportStatus` (`pending`/`reviewed`).

| Modelo | Campos clave | Notas |
|---|---|---|
| `User` | `email` (único), `phone` (único, **opcional** — nulo hasta completarlo), `passwordHash` (opcional — nulo si el usuario entró por Google), `googleId` (único, opcional), `profilePhotoUrl`, `pushToken` (opcional, token de Expo Push), `role` | Un usuario puede autenticarse por password o por Google, no ambos a la vez inicialmente |
| `Driver` | `userId` (único, 1:1 con `User`), `vehicleType`, `licenseNumber`, `verificationStatus`, `averageRating`, `available`, `idFrontUrl`, `idBackUrl`, `vehicleRegistrationUrl`, `selfieWithIdUrl` | Los 4 documentos son obligatorios al completar perfil; `available` solo puede activarse si `verificationStatus = approved` |
| `Vehicle` | `driverId`, `brand`, `model`, `year`, `color`, `plate` (único) | Un conductor puede tener varios vehículos registrados |
| `Trip` | `passengerId`, `driverId` (nulo hasta aceptar), `originLat/Lng`, `destinationLat/Lng`, `originAddress`/`destinationAddress` (texto libre del frontend), `status`, `distanceKm`, `fare`, `arrivedAt` (cuándo el conductor marcó llegada), `cancelReason` (opcional, texto libre de quien cancela) | `distanceKm` viene de Google Directions con fallback geoespacial |
| `LocationTracking` | `driverId`, `tripId` (opcional), `lat`, `lng`, `recordedAt` | Historial de posiciones; se usa tanto para "conductores cercanos" como para el tracking en vivo de un viaje |
| `Rating` | `tripId`, `raterId`, `ratedId`, `score` (1-5), `comment` | Un rater solo puede calificar una vez por viaje |
| `FareZone` | `zoneName`, `baseFare`, `farePerKm`, `centerLat/Lng` | La tarifa se calcula contra la zona cuyo centro está más cerca del punto de origen |
| `Wallet` | `userId` (único), `balance` | Todo usuario nace con wallet en `0.00`; la plataforma también tiene su propia wallet (`PLATFORM_USER_ID`) |
| `WalletTransaction` | `walletId`, `type`, `amount`, `tripReferenceId`, `paypalReferenceId` | Un viaje completado genera **tres** filas: `trip_charge` (negativo, pasajero), `trip_payout` (positivo, conductor) y `platform_commission` (positivo, plataforma) |
| `WithdrawalRequest` | `driverId`, `paypalEmail`, `amount`, `status`, `adminId` | El saldo se descuenta al **solicitar** el retiro, no al aprobarlo; si se rechaza, se reembolsa |
| `Notification` | `userId`, `type`, `title`, `body`, `relatedTripId` (opcional), `read` | Cada `create()` también dispara un intento de push (ver más abajo) |
| `SavedAddress` | `userId`, `label` (`home`/`work`/`other`), `customLabel` (opcional), `address`, `lat`, `lng` | Solo pasajeros; sin límite de cantidad por usuario |
| `IncidentReport` | `reporterId`, `tripId` (opcional), `reportedDriverId` (opcional, inferido del viaje), `category`, `description`, `status` | Se permite más de un reporte por `(reporter, trip)` a propósito — un viaje puede tener varios problemas distintos |

## Referencia de la API

Todas las rutas (salvo las marcadas como **Pública**) requieren header `Authorization: Bearer <jwt>`. Las marcadas **Admin** además requieren `role = admin`. Los endpoints de `register`/`login`/`google` aceptan opcionalmente el header `X-Client-Platform: mobile` (ver [Variables de entorno](#variables-de-entorno)).

Los endpoints paginados devuelven `{ data, total, page, limit }` (query params `page`, `limit`). Un `status` de filtro inválido en un endpoint de admin responde `400` con la lista de valores aceptados, nunca `500`.

### Auth (`/auth`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| POST | `/auth/register` | Pública (throttle propio) | `{ name, email, phone (8-15 dígitos, + opcional), password (≥8), role: passenger\|driver }` | Crea `User` + `Wallet` en una transacción. `409` si el email o el teléfono ya están en uso. Devuelve `{ id, name, email, role, token }`. No permite `role: admin` |
| POST | `/auth/login` | Pública (throttle propio) | `{ email, password }` | `401` si las credenciales son inválidas o si la cuenta se registró por Google (no tiene password). Devuelve `{ token, user }` |
| POST | `/auth/google` | Pública | `{ idToken }` | Verifica el ID token contra `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_ID_MOBILE`, crea el usuario si no existe (o lo vincula por email), rol `passenger` por defecto, `phone` queda `null` |
| PATCH | `/auth/profile-photo` | JWT | `{ profilePhotoUrl }` (URL de Cloudinary) | Actualiza la foto de perfil y borra la anterior en Cloudinary |
| PATCH | `/auth/name` | JWT | `{ name }` (2-80 caracteres) | Actualiza el nombre |
| PATCH | `/auth/phone` | JWT | `{ phone }` (8-15 dígitos, `+` opcional) | Completa/actualiza el teléfono. `409` si el número ya está en uso por otro usuario |
| GET | `/auth/profile` | JWT | — | `{ id, name, email, phone, role, profilePhotoUrl, createdAt }` |

### Drivers (`/drivers`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| POST | `/drivers/complete-profile` | JWT | `{ vehicleType, licenseNumber, vehicle: {brand, model, year, color, plate}, idFrontUrl, idBackUrl, vehicleRegistrationUrl, selfieWithIdUrl, profilePhotoUrl }` (URLs de Cloudinary) | Crea `Driver` + `Vehicle` en transacción, `verificationStatus = pending`. `409` si el usuario ya tiene perfil de conductor. Notifica por push a los admins |
| PATCH | `/drivers/availability` | JWT | `{ available: boolean }` | `403` si intenta ponerse disponible sin `verificationStatus = approved` |
| GET | `/drivers/pending-requests` | JWT | — | Polling: devuelve el viaje `pending` donde este conductor es candidato en la caché, o `null` |
| GET | `/drivers/summary` | JWT | — | `{ earningsToday, tripsToday, averageRating, available }` |
| GET | `/drivers/:id` | JWT | — | Perfil público del conductor (sin teléfono): `{ id, userId, name, profilePhotoUrl, averageRating, vehicle }` |

### Trips (`/trips`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| POST | `/trips/estimate` | JWT | `{ originLat, originLng, destinationLat, destinationLng }` | Sin efectos secundarios. `400` si algún punto está fuera de Honduras. Devuelve `{ distanceKm, fare }` |
| POST | `/trips` | JWT | Igual a `estimate` + `originAddress`, `destinationAddress` | `400` si el pasajero no tiene teléfono registrado; `402` si el saldo de la wallet es menor a la tarifa. Crea el viaje `pending`, cachea conductores candidatos cercanos (TTL 60s) y les manda push |
| PATCH | `/trips/:id/accept` | JWT (conductor) | — | Solo si el conductor es candidato en caché (`403` si no). Update atómico condicional (`409` si otro conductor ya lo tomó) |
| PATCH | `/trips/:id/reject` | JWT (conductor) | — | Saca al conductor de la lista de candidatos, sin tocar el estado del viaje |
| PATCH | `/trips/:id/start` | JWT (conductor dueño) | — | Requiere `status = accepted` |
| PATCH | `/trips/:id/arrived` | JWT (conductor dueño) | — | Marca `arrivedAt`, requiere `status = accepted`. Notifica al pasajero (`driver_arrived`). Idempotente si ya estaba marcado |
| PATCH | `/trips/:id/no-show` | JWT (conductor dueño) | — | Requiere `arrivedAt` marcado y que haya pasado `NO_SHOW_GRACE_PERIOD_MINUTES`. Cancela el viaje y cobra `CANCELLATION_FEE_AMOUNT` al pasajero, repartido entre conductor y plataforma |
| PATCH | `/trips/:id/cancel` | JWT (pasajero o conductor del viaje) | `{ reason?: string }` (máx. 500 caracteres) | Solo si `status` es `pending` o `accepted`. Si el pasajero cancela un viaje ya `accepted`, se le cobra `CANCELLATION_FEE_AMOUNT`. `reason` se persiste en `cancelReason` |
| PATCH | `/trips/:id/complete-early` | JWT (pasajero dueño) | — | Requiere `status = in_progress`. Recalcula la tarifa prorrateada según la última posición conocida del conductor (requiere que haya tracking registrado) |
| PATCH | `/trips/:id/complete` | JWT (conductor dueño) | — | Requiere `status = in_progress`. Transacción atómica: descuenta al pasajero, acredita al conductor su parte, acredita la comisión a la plataforma (3 `WalletTransaction`) |
| GET | `/trips/history` | JWT | Query `page`, `limit` | Historial paginado, filtrado por el usuario autenticado (como pasajero o conductor según su rol) |
| GET | `/trips/:id` | JWT | — | Incluye `driverPhone`/`driver{...}` y `passengerPhone`/`passenger{...}` solo si quien pregunta es parte del viaje y `status` es `accepted` o `in_progress` |
| GET | `/trips/:id/driver-location` | JWT | — | Última posición registrada para ese viaje |

### Tracking (`/tracking`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| POST | `/tracking/location` | JWT (conductor) | `{ lat, lng, tripId? }` | Inserta una fila en `LocationTracking`; también alimenta `GET /drivers/:id`/nearby y `complete-early` |

### Wallet (`/wallet`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| GET | `/wallet` | JWT | — | `{ balance }` |
| POST | `/wallet/topup/create-order` | JWT (passenger) | `{ amount (≥1), returnUrl?, cancelUrl? }` | Crea la orden en PayPal. Devuelve `{ orderId, approveUrl }` (`approveUrl` es el link `rel: "approve"` de PayPal, listo para abrir en el cliente) |
| POST | `/wallet/topup/confirm` | JWT (passenger) | `{ orderId }` | Captura la orden en PayPal y **verifica el monto capturado** antes de acreditar — nunca confía en un monto enviado por el cliente |
| GET | `/wallet/transactions` | JWT | Query `page`, `limit` | Historial paginado |
| POST | `/wallet/withdrawal` | JWT (conductor) | `{ paypalEmail, amount (≥1) }` | Descuenta el saldo de inmediato y crea `WithdrawalRequest` en `pending`. `400` con `code: "insufficient_balance"` si no alcanza el saldo (distinguible de un `400` de validación del DTO, que no trae `code`) |

### Ratings (`/ratings`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| POST | `/ratings` | JWT | `{ tripId, ratedId, score (1-5), comment? }` | El viaje debe estar `completed`, el rater debe ser parte del viaje, `ratedId` debe ser el otro participante, `409` si ya calificó ese viaje. Si el calificado es conductor, recalcula su `averageRating` |
| GET | `/ratings/user/:id` | JWT | Query `page`, `limit` | Calificaciones recibidas por ese usuario |

### Fare zones (`/fare-zones`, `/admin/fare-zones`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| GET | `/fare-zones` | Pública | — | Lista de zonas de tarifa (se muestra antes de solicitar un viaje) |
| POST | `/admin/fare-zones` | Admin | `{ zoneName, baseFare, farePerKm, centerLat, centerLng }` | Crea zona |
| PATCH | `/admin/fare-zones/:id` | Admin | Parcial del anterior | Actualiza zona. `404` si no existe |

### Notifications (`/notifications`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| GET | `/notifications` | JWT | Query `page`, `limit` | Lista paginada, más recientes primero |
| GET | `/notifications/unread-count` | JWT | — | `{ count }` |
| PATCH | `/notifications/:id/read` | JWT | — | Marca una notificación propia como leída |
| PATCH | `/notifications/read-all` | JWT | — | Marca todas las notificaciones propias como leídas |
| POST | `/notifications/push-token` | JWT | `{ token }` (token de Expo Push) | Registra/actualiza el `pushToken` del usuario autenticado |
| DELETE | `/notifications/push-token` | JWT | — | Borra el `pushToken` (ej. al cerrar sesión en la app) |

### Saved addresses (`/saved-addresses`, solo passenger)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| GET | `/saved-addresses` | JWT (passenger) | — | Direcciones guardadas del usuario, más antiguas primero |
| POST | `/saved-addresses` | JWT (passenger) | `{ label: home\|work\|other, customLabel?, address, lat, lng }` | Crea una dirección favorita |
| DELETE | `/saved-addresses/:id` | JWT (passenger) | — | `403` si la dirección no pertenece al usuario |

### Incident reports (`/incident-reports`, `/admin/incident-reports`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| POST | `/incident-reports` | JWT (passenger) | `{ tripId, category: safety\|driver_behavior\|vehicle_condition\|payment\|other, description (10-1000 caracteres) }` | El viaje debe existir y pertenecer al pasajero. `reportedDriverId` se infiere del viaje. Notifica por push a los admins |
| GET | `/admin/incident-reports` | Admin | Query `status?`, `page?`, `limit?` | Lista paginada, filtrable por `pending`/`reviewed` |
| PATCH | `/admin/incident-reports/:id/review` | Admin | — | Marca el reporte como `reviewed`. `404` si no existe |

### Admin (`/admin`, `/admin/drivers`, `/admin/trips`, `/admin/withdrawals`, `/admin/platform-wallet`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| GET | `/admin/stats` | Admin | — | `{ tripsByStatus, revenueToday, tripsCompletedToday, availableDrivers, pendingDrivers, pendingWithdrawals, dailyCompleted[14] }` — todo calculado con agregaciones de Prisma, sin muestreo |
| GET | `/admin/drivers` | Admin | Query `status?`, `page?`, `limit?` | Lista paginada de conductores (con `user` y `vehicles`, sin `passwordHash`), filtrable por `verificationStatus` |
| GET | `/admin/drivers/:id` | Admin | — | Detalle de un solo conductor (mismo shape que un elemento de la lista). `404` si no existe |
| PATCH | `/admin/drivers/:id/verification` | Admin | `{ verificationStatus: approved\|rejected }` | Aprueba o rechaza documentos; setea `approvedAt`. `404` si el conductor no existe |
| GET | `/admin/trips` | Admin | Query `status?`, `page?`, `limit?` | Listado paginado de todos los viajes |
| GET | `/admin/withdrawals` | Admin | Query `status?`, `page?`, `limit?` | Lista paginada de solicitudes de retiro (con `driver.user`, sin `passwordHash`) |
| PATCH | `/admin/withdrawals/:id` | Admin | `{ status: completed\|rejected }` | Si `rejected`, reembolsa el saldo al conductor en la misma operación |
| GET | `/admin/platform-wallet` | Admin | — | `{ balance }` de la wallet de plataforma |
| GET | `/admin/platform-wallet/transactions` | Admin | Query `page`, `limit` | Historial paginado de la wallet de plataforma |

## Integraciones externas

- **PayPal** (`@paypal/paypal-server-sdk`): el módulo `wallet` crea la orden (`ordersCreate`, con `returnUrl`/`cancelUrl` opcionales para el flujo de checkout) y la captura (`ordersCapture`) usando `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` en modo `PAYPAL_MODE`. El monto acreditado siempre sale de la respuesta de PayPal, nunca del request del cliente.
- **Google Sign-In** (`google-auth-library`): `GoogleAuthService` verifica el `idToken` contra un arreglo de audiencias válidas (`GOOGLE_CLIENT_ID` + las de `GOOGLE_CLIENT_ID_MOBILE`) con `OAuth2Client.verifyIdToken`, para soportar Client IDs distintos de web y mobile.
- **Google Directions API** (`@googlemaps/google-maps-services-js`): `FareCalculationService.calculateDistanceKm` pide la ruta real por carretera; si falla o no hay ruta, cae a distancia en línea recta (PostGIS `ST_Distance`) multiplicada por `1.3` como aproximación de la distancia real.
- **Cloudinary** (`cloudinary` SDK): la subida de imágenes (fotos de perfil, documentos de conductor) ocurre del lado del cliente (web/móvil) contra un *unsigned upload preset*. El backend valida con `@IsCloudinaryUrl()` que la URL recibida tenga el formato `https://res.cloudinary.com/<cloud>/(image|video)/upload/...`, y además `CloudinaryService.deleteByUrl()` **llama a la API de Cloudinary** (`uploader.destroy`) para borrar la foto anterior cuando se reemplaza — requiere que la API key configurada tenga permiso de borrado (rol "Master Admin" o un rol personalizado con `Delete assets`, no "Media Library User").
- **Expo Push API** (`fetch` directo a `https://exp.host/--/api/v2/push/send`, sin SDK): `PushNotificationsService.send()` manda un push a cada usuario con `pushToken` registrado. Es *best-effort*: cualquier fallo (red, token inválido) se loguea como warning y nunca interrumpe el flujo principal. Los tokens que Expo reporta como `DeviceNotRegistered` se limpian automáticamente.

## Seguridad

- Contraseñas con **Argon2id** (`argon2.hash(..., { type: argon2.argon2id })`).
- JWT verificado en cada request vía `JwtStrategy`, que además confirma que el usuario siga `isActive` en la base de datos — si un admin desactiva la cuenta, el token deja de servir de inmediato aunque no haya expirado.
- Expiración de JWT distinta por plataforma (`JWT_EXPIRES_IN` vs `JWT_EXPIRES_IN_MOBILE`, según el header `X-Client-Platform`) — no hay refresh tokens, al expirar el cliente debe volver a autenticar.
- `RolesGuard` + `@Roles('admin')` protegen todas las rutas `/admin/*`.
- `helmet()` para cabeceras HTTP seguras.
- `ThrottlerGuard` global (`ThrottlerModule` con 3 tiers: 5 req/seg, 120 req/min, 2000 req/hora por IP) más límites más estrictos en `login`/`register` para frenar fuerza bruta.
- `ValidationPipe` global con `whitelist` + `forbidNonWhitelisted`: cualquier campo no declarado en el DTO es rechazado.
- `GlobalExceptionFilter`: normaliza la respuesta de error (`{ statusCode, message, error }`, más cualquier campo extra como `code` que el servicio haya adjuntado) y solo loguea el stack trace completo en el servidor para errores 500 — nunca se expone al cliente.
- Los endpoints de admin que exponen datos de usuario (`GET /admin/drivers`, `GET /admin/drivers/:id`, `GET /admin/withdrawals`) excluyen explícitamente `passwordHash` con `omit` de Prisma.
- `CORS_ORIGIN` restringe explícitamente los orígenes permitidos.
