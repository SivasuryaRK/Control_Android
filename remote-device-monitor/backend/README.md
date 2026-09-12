# Backend

## Installation

1. Install Node.js (v18 or later)
2. Install dependencies:

   ```bash
   npm install
   ```

## Prisma Setup

1. Copy the example environment file and adjust the values:

   ```bash
   cp .env.example .env
   ```

2. Generate the Prisma client:

   ```bash
   npx prisma generate
   ```

3. Run the Prisma migrations:

   ```bash
   npx prisma migrate dev --name init
   ```

## Development

Start the development server:

```bash
npm run dev
```

The server will be available at http://localhost:3000.

## Health Check

A health check endpoint is available at:

```
GET /health
```

It returns a JSON object indicating the status of the server and the database connection.
