# CatrachoGo API

API backend de **CatrachoGo**, una plataforma de viajes tipo ride-hailing para Honduras. Construida con **NestJS 11 + Prisma ORM 7 + PostgreSQL/PostGIS**, expone autenticación (email/password y Google Sign-In), gestión de conductores con verificación de documentos, cálculo de tarifas geoespacial, ciclo de vida completo de viajes con matching de conductores, billetera con integración PayPal, calificaciones y un panel de administración.

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
| Autenticación | JWT (`@nestjs/jwt` + `passport-jwt`) y Google Sign-In (`google-auth-library`) |
| Hashing de contraseñas | Argon2id (`argon2`) |
| Pagos | PayPal Checkout (`@paypal/paypal-server-sdk`), sandbox/live vía `PAYPAL_MODE` |
| Mapas / distancia real | Google Directions API (`@googlemaps/google-maps-services-js`), con fallback a distancia en línea recta (PostGIS `ST_Distance` × 1.3) si la API falla |
| Almacenamiento de imágenes | Cloudinary (subida ocurre en el cliente; el backend solo valida que la URL resultante sea de `res.cloudinary.com`) |
| Validación | `class-validator` + `class-transformer`, `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`) |
| Seguridad HTTP | `helmet`, `@nestjs/throttler` (rate limiting global + por ruta en `login`/`register`) |
| Runtime | Node.js 24 LTS |

## Requisitos

- Node.js ≥ 24
- PostgreSQL con PostGIS (o Docker, ver `docker-compose.yml`)
- Cuenta de PayPal Developer (sandbox) para probar recargas de billetera
- Credenciales de Google OAuth (Client ID) para el login con Google
- API key de Google Maps con la **Directions API** habilitada

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

# 5. Sembrar datos base
npx tsx prisma/seed-admin.ts       # usuario admin (lee ADMIN_EMAIL/ADMIN_PASSWORD de .env)
npx tsx prisma/seed-fare-zones.ts  # las 4 zonas de tarifa
npx tsx prisma/seed.ts             # 50 pasajeros + 20 conductores de prueba (password: Test1234!)

# 6. Levantar la API en modo desarrollo
npm run start:dev
```

> ⚠️ **Antes de que `POST /trips/estimate` o `POST /trips` funcionen** hace falta importar el polígono de Honduras a una tabla `honduras_boundary` — ver [Limitaciones y pendientes conocidos](#limitaciones-y-pendientes-conocidos).

> ⚠️ `docker-compose.yml` publica Postgres en el puerto **5433** del host (`"5433:5432"`), pero `.env.example` trae `DATABASE_URL`/`DIRECT_URL` apuntando a `localhost:5432`. Si usas Docker para la base de datos, actualiza el puerto en tu `.env` a `5433` (o cambia el mapeo en `docker-compose.yml`).

## Variables de entorno

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión de Postgres usada en runtime por `PrismaService` (vía `@prisma/adapter-pg`) |
| `DIRECT_URL` | Cadena de conexión usada por `prisma migrate` (en `prisma.config.ts`). Igual a `DATABASE_URL` en local; en producción con pooler (PgBouncer, Supabase) debe apuntar directo a la base |
| `JWT_SECRET` | Secreto para firmar/verificar JWT. Genera uno fuerte con `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_EXPIRES_IN` | Expiración del token **en segundos** (no `"7d"`). `604800` = 7 días |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | Credenciales de la app de PayPal (Developer Dashboard) |
| `PAYPAL_MODE` | `sandbox` o `live` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciales del usuario admin creado por `prisma/seed-admin.ts` |
| `CORS_ORIGIN` | Dominio(s) permitidos, separados por coma. Nunca dejar `enableCors()` abierto en producción |
| `PORT` | Puerto HTTP de la API (default `3000`) |
| `GOOGLE_CLIENT_ID` | Client ID de OAuth usado para verificar el `idToken` en `POST /auth/google` |
| `GOOGLE_MAPS_API_KEY` | Key de Google Maps (Directions API) usada para calcular la distancia real de ruta en `POST /trips/estimate` y `POST /trips` |
| `CLOUDINARY_CLOUD_NAME` | Nombre del cloud de Cloudinary; lo usan los clientes (web/móvil) para subir imágenes directamente. El backend no llama a la API de Cloudinary, solo valida que las URLs recibidas empiecen con `https://res.cloudinary.com/<cloud>/...` |

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
| `npx tsx prisma/seed-bulk.ts` | Genera viajes históricos en volumen (para pruebas de carga / Power BI) |

## Arquitectura y módulos

```
src/
  common/
    decorators/roles.decorator.ts   → @Roles('admin')
    guards/roles.guard.ts           → RolesGuard, se combina con AuthGuard('jwt')
    filters/http-exception.filter.ts→ GlobalExceptionFilter (normaliza errores, loguea 500s)
    utils/env.util.ts               → getEnvOrThrow(): falla rápido si falta una env var obligatoria
    utils/pagination.util.ts        → paginationParams(page, limit)
    validators/is-cloudinary-url.ts → @IsCloudinaryUrl()
  prisma/                           → PrismaService (driver adapter pg) + PrismaModule (@Global)
  modules/
    auth/         → registro, login, Google Sign-In, foto de perfil, completar teléfono
    drivers/      → perfil de conductor, disponibilidad, resumen, verificación
    trips/        → estimación de tarifa, ciclo de vida del viaje
    tracking/     → ubicación en tiempo real de conductores
    matching/     → TripCandidatesCache (caché en memoria de candidatos por viaje)
    wallet/       → billetera, integración PayPal, retiros
    ratings/      → calificaciones entre pasajero y conductor
    admin/        → verificación de conductores, listado de viajes
    fare-zones/   → CRUD de zonas de tarifa
```

**Por qué existe `MatchingModule`:** `TripsModule` necesita `DriversModule` (para buscar conductores cercanos) y `DriversModule` necesita la misma caché de candidatos (para que un conductor consulte si tiene una solicitud pendiente). Si la caché viviera dentro de `TripsModule` se formaría una dependencia circular `Trips → Drivers → Trips`. Por eso vive en su propio módulo (`TripCandidatesCache`), que ambos importan.

**Guards compuestos:** las rutas de administrador usan `@UseGuards(AuthGuard('jwt'), RolesGuard)` + `@Roles('admin')`. `RolesGuard` no rechaza nada si el handler/controller no tiene `@Roles(...)` — siempre se combina con `AuthGuard('jwt')`, nunca se usa solo.

## Modelo de datos

Enums: `Role` (`passenger`/`driver`/`admin`), `VehicleType` (`car`/`motorcycle`), `VerificationStatus` (`pending`/`approved`/`rejected`), `TripStatus` (`pending`/`accepted`/`in_progress`/`completed`/`cancelled`), `WalletTransactionType` (`paypal_topup`/`trip_charge`/`trip_payout`/`withdrawal_adjustment`), `WithdrawalStatus` (`pending`/`completed`/`rejected`).

| Modelo | Campos clave | Notas |
|---|---|---|
| `User` | `email` (único), `phone` (único, **opcional** — nulo hasta completarlo), `passwordHash` (opcional — nulo si el usuario entró por Google), `googleId` (único, opcional), `profilePhotoUrl`, `role` | Un usuario puede autenticarse por password o por Google, no ambos a la vez inicialmente |
| `Driver` | `userId` (único, 1:1 con `User`), `vehicleType`, `licenseNumber`, `verificationStatus`, `averageRating`, `available`, `idFrontUrl`, `idBackUrl`, `vehicleRegistrationUrl`, `selfieWithIdUrl` | Los 4 documentos son obligatorios al completar perfil; `available` solo puede activarse si `verificationStatus = approved` |
| `Vehicle` | `driverId`, `brand`, `model`, `year`, `color`, `plate` (único) | Un conductor puede tener varios vehículos registrados |
| `Trip` | `passengerId`, `driverId` (nulo hasta aceptar), `originLat/Lng`, `destinationLat/Lng`, `originAddress`/`destinationAddress` (texto libre del frontend), `status`, `distanceKm`, `fare` | `distanceKm` viene de Google Directions con fallback geoespacial |
| `LocationTracking` | `driverId`, `tripId` (opcional), `lat`, `lng`, `recordedAt` | Historial de posiciones; se usa tanto para "conductores cercanos" como para el tracking en vivo de un viaje |
| `Rating` | `tripId`, `raterId`, `ratedId`, `score` (1-5), `comment` | Un rater solo puede calificar una vez por viaje |
| `FareZone` | `zoneName`, `baseFare`, `farePerKm`, `centerLat/Lng` | La tarifa se calcula contra la zona cuyo centro está más cerca del punto de origen |
| `Wallet` | `userId` (único), `balance` | Todo usuario nace con wallet en `0.00` |
| `WalletTransaction` | `walletId`, `type`, `amount`, `tripReferenceId`, `paypalReferenceId` | Un viaje completado genera dos filas: `trip_charge` (negativo, pasajero) y `trip_payout` (positivo, conductor) |
| `WithdrawalRequest` | `driverId`, `paypalEmail`, `amount`, `status`, `adminId` | El saldo se descuenta al **solicitar** el retiro, no al aprobarlo; si se rechaza, se reembolsa |

## Referencia de la API

Todas las rutas (salvo las marcadas como **Pública**) requieren header `Authorization: Bearer <jwt>`. Las marcadas **Admin** además requieren `role = admin`.

### Auth (`/auth`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| POST | `/auth/register` | Pública (5 req/min) | `{ name, email, phone, password (≥8), role: passenger\|driver }` | Crea `User` + `Wallet` en una transacción. Devuelve `{ id, name, email, role, token }` |
| POST | `/auth/login` | Pública (5 req/min) | `{ email, password }` | `401` si las credenciales son inválidas o si la cuenta se registró por Google (no tiene password). Devuelve `{ token, user }` |
| POST | `/auth/google` | Pública | `{ idToken }` | Verifica el ID token contra Google, crea el usuario si no existe (o lo vincula por email), rol `passenger` por defecto, `phone` queda `null` |
| PATCH | `/auth/profile-photo` | JWT | `{ profilePhotoUrl }` (URL de Cloudinary) | Actualiza la foto de perfil |
| PATCH | `/auth/phone` | JWT | `{ phone }` (8-15 dígitos, `+` opcional) | Completa/actualiza el teléfono. `409` si el número ya está en uso por otro usuario |
| GET | `/auth/profile` | JWT | — | `{ id, name, email, phone, role, createdAt }` |

### Drivers (`/drivers`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| POST | `/drivers/complete-profile` | JWT | `{ vehicleType, licenseNumber, vehicle: {brand, model, year, color, plate}, idFrontUrl, idBackUrl, vehicleRegistrationUrl, selfieWithIdUrl, profilePhotoUrl }` (URLs de Cloudinary) | Crea `Driver` + `Vehicle` en transacción, `verificationStatus = pending`. `409` si el usuario ya tiene perfil de conductor |
| PATCH | `/drivers/availability` | JWT | `{ available: boolean }` | `403` si intenta ponerse disponible sin `verificationStatus = approved` |
| GET | `/drivers/pending-requests` | JWT | — | Polling: devuelve el viaje `pending` donde este conductor es candidato en la caché, o `null` |
| GET | `/drivers/summary` | JWT | — | `{ earningsToday, tripsToday, averageRating }` |
| GET | `/drivers/:id` | JWT | — | Perfil público del conductor (sin teléfono): `{ id, name, averageRating, vehicle }` |

### Trips (`/trips`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| POST | `/trips/estimate` | JWT | `{ originLat, originLng, destinationLat, destinationLng }` | Sin efectos secundarios. `400` si algún punto está fuera de Honduras. Devuelve `{ distanceKm, fare }` |
| POST | `/trips` | JWT | Igual a `estimate` + `originAddress`, `destinationAddress` | `400` si el pasajero no tiene teléfono registrado; `402` si el saldo de la wallet es menor a la tarifa. Crea el viaje `pending` y cachea conductores candidatos cercanos (TTL 60s) |
| PATCH | `/trips/:id/accept` | JWT (conductor) | — | Solo si el conductor es candidato en caché (`403` si no). Update atómico condicional (`409` si otro conductor ya lo tomó) |
| PATCH | `/trips/:id/reject` | JWT (conductor) | — | Saca al conductor de la lista de candidatos, sin tocar el estado del viaje |
| PATCH | `/trips/:id/start` | JWT (conductor dueño) | — | Requiere `status = accepted` |
| PATCH | `/trips/:id/cancel` | JWT (pasajero o conductor del viaje) | — | Solo si `status` es `pending` o `accepted` |
| PATCH | `/trips/:id/complete` | JWT (conductor dueño) | — | Requiere `status = in_progress`. Transacción atómica: descuenta al pasajero, acredita al conductor, crea 2 `WalletTransaction` |
| GET | `/trips/history` | JWT | Query `page`, `limit` | Historial paginado, filtrado por el usuario autenticado (como pasajero o conductor según su rol) |
| GET | `/trips/:id` | JWT | — | Incluye `driverPhone`/`passengerPhone` solo si quien pregunta es parte del viaje y `status` es `accepted` o `in_progress` |
| GET | `/trips/:id/driver-location` | JWT | — | Última posición registrada para ese viaje |

### Tracking (`/tracking`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| POST | `/tracking/location` | JWT (conductor) | `{ lat, lng, tripId? }` | Inserta una fila en `LocationTracking`; también alimenta `GET /drivers/:id`/nearby |

### Wallet (`/wallet`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| GET | `/wallet` | JWT | — | `{ balance }` |
| POST | `/wallet/topup/create-order` | JWT | `{ amount (≥1) }` | Crea la orden en PayPal, devuelve `{ orderId }` |
| POST | `/wallet/topup/confirm` | JWT | `{ orderId }` | Captura la orden en PayPal y **verifica el monto capturado** antes de acreditar — nunca confía en un monto enviado por el cliente |
| GET | `/wallet/transactions` | JWT | Query `page`, `limit` | Historial paginado |
| POST | `/wallet/withdrawal` | JWT (conductor) | `{ paypalEmail, amount (≥1) }` | Descuenta el saldo de inmediato y crea `WithdrawalRequest` en `pending` |

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
| PATCH | `/admin/fare-zones/:id` | Admin | Parcial del anterior | Actualiza zona |

### Admin (`/admin`, `/admin/withdrawals`)

| Método | Ruta | Auth | Body | Descripción |
|---|---|---|---|---|
| GET | `/admin/drivers` | Admin | Query `status?` | Lista conductores (con `user` y `vehicles`), filtrable por `verificationStatus` |
| PATCH | `/admin/drivers/:id/verification` | Admin | `{ verificationStatus: approved\|rejected }` | Aprueba o rechaza documentos; setea `approvedAt` |
| GET | `/admin/trips` | Admin | Query `status?`, `page?`, `limit?` | Listado paginado de todos los viajes |
| GET | `/admin/withdrawals` | Admin | Query `status?` | Lista solicitudes de retiro |
| PATCH | `/admin/withdrawals/:id` | Admin | `{ status: completed\|rejected }` | Si `rejected`, reembolsa el saldo al conductor en la misma operación |

## Integraciones externas

- **PayPal** (`@paypal/paypal-server-sdk`): el módulo `wallet` crea la orden (`ordersCreate`) y la captura (`ordersCapture`) usando `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` en modo `PAYPAL_MODE`. El monto acreditado siempre sale de la respuesta de PayPal, nunca del request del cliente.
- **Google Sign-In** (`google-auth-library`): `GoogleAuthService` verifica el `idToken` contra `GOOGLE_CLIENT_ID` con `OAuth2Client.verifyIdToken`.
- **Google Directions API** (`@googlemaps/google-maps-services-js`): `FareCalculationService.calculateDistanceKm` pide la ruta real por carretera; si falla o no hay ruta, cae a distancia en línea recta (PostGIS `ST_Distance`) multiplicada por `1.3` como aproximación de la distancia real.
- **Cloudinary**: la subida de imágenes (fotos de perfil, documentos de conductor) ocurre del lado del cliente (web/móvil). El backend solo valida con `@IsCloudinaryUrl()` que la URL recibida tenga el formato `https://res.cloudinary.com/<cloud>/(image|video)/upload/...`.

## Seguridad

- Contraseñas con **Argon2id** (`argon2.hash(..., { type: argon2.argon2id })`).
- JWT verificado en cada request vía `JwtStrategy`, que además confirma que el usuario siga `isActive` en la base de datos — si un admin desactiva la cuenta, el token deja de servir de inmediato aunque no haya expirado.
- `RolesGuard` + `@Roles('admin')` protegen todas las rutas `/admin/*`.
- `helmet()` para cabeceras HTTP seguras.
- `ThrottlerGuard` global (20 req/min por IP) más límites más estrictos (5 req/min) en `login`/`register` para frenar fuerza bruta.
- `ValidationPipe` global con `whitelist` + `forbidNonWhitelisted`: cualquier campo no declarado en el DTO es rechazado.
- `GlobalExceptionFilter`: normaliza la respuesta de error (`{ statusCode, message, error }`) y solo loguea el stack trace completo en el servidor para errores 500 — nunca se expone al cliente.
- `CORS_ORIGIN` restringe explícitamente los orígenes permitidos.

## Limitaciones y pendientes conocidos

- **Falta la tabla `honduras_boundary`.** `FareCalculationService.isWithinHonduras` consulta `SELECT geom FROM honduras_boundary`, pero ninguna migración ni seed la crea todavía. Hasta que se importe el polígono de Honduras, `POST /trips/estimate` y `POST /trips` fallarán con un error de base de datos. Pasos para resolverlo:
  1. Descargar el polígono de Honduras (ej. geoBoundaries) en GeoJSON.
  2. Crear una migración manual que defina `CREATE TABLE honduras_boundary (geom geometry(Polygon, 4326))` (tipo `geometry`, no `geography` — `ST_Contains` no tiene overload para `geography`).
  3. Insertar el polígono con `ST_GeomFromGeoJSON` o `shp2pgsql`.
- **Caché de candidatos en memoria (`TripCandidatesCache`).** Válida para un solo proceso/instancia. Si la API escala horizontalmente (más de una instancia), hace falta moverla a Redis u otro store compartido.
- **Puerto de Docker vs. `.env.example`:** `docker-compose.yml` publica Postgres en `5433:5432`; ajusta `DATABASE_URL`/`DIRECT_URL` según cómo levantes la base.
- **`CLOUDINARY_CLOUD_NAME`** no se usa en ningún servicio del backend — solo documenta la variable que consumen los clientes.
