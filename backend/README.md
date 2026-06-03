Backend module

Run:

1. Install dependencies

```
npm install
```

2. Start in development (uses nodemon)

```
npm start
```

The `start` script uses `nodemon app.js`.

Environment:

- Copy `backend/.env.example` to `backend/.env` and fill your PostgreSQL (EDB) credentials.
- The app loads environment variables via `dotenv` at startup.

## Backend pagination API

List endpoints paginate on the server with `page` and `limit` query parameters so the frontend only requests the rows needed for the current screen.

Examples:

```http
GET /api/orders?page=1&limit=10&search=ha-noi&status=pending
GET /api/admin/users?page=2&limit=15&search=driver&sortField=full_name&sortDir=asc
GET /api/trips/history?page=1&limit=20
```

Paginated responses include a `pagination` object:

```json
{
  "total": 42,
  "page": 1,
  "limit": 10,
  "totalPages": 5,
  "hasPreviousPage": false,
  "hasNextPage": true
}
```

Limits are capped by each API to avoid loading too many rows at once.
