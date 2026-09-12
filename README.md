# Remote Device Monitor

A production-quality application for monitoring and managing your own Android device through an authenticated web dashboard.

## Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Router
- Backend: Node.js, TypeScript, Express
- Database: PostgreSQL, Prisma
- Android: Native Kotlin
- Infrastructure: Docker, Docker Compose

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- PostgreSQL
- Docker and Docker Compose
- Android Studio (for Android development)

### Installation

1. Clone the repository
2. Install dependencies for frontend and backend:
   ```
   cd frontend && npm install
   cd ../backend && npm install
   ```
3. Set up environment variables:
   ```
   cp .env.example .env
   # Edit .env with your configuration
   ```
4. Start the development servers:
   ```
   # In one terminal, start the backend
   cd backend && npm run dev
   # In another terminal, start the frontend
   cd frontend && npm run dev
   ```

## License

MIT
