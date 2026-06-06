# Quickstart: BurgerPrint Sync API

## Prerequisites

1. MongoDB is running and connected.
2. Redis is running (required for BullMQ queue, caching, and locks).
3. The `.env` file has the necessary MongoDB and Redis configurations.
4. Run `npm install` to install the newly added dependencies: `@nestjs/bullmq`, `bullmq`, `@nestjs/schedule`.

## Starting the Application

1. Ensure Redis is up (e.g., via Docker Compose `docker-compose up -d redis`).
2. Start the NestJS backend:
   ```bash
   cd backend
   npm run start:dev
   ```

## Triggering a Sync Manually

1. Get a JWT token by logging into the API or using Swagger UI (typically `/api/auth/login`).
2. Send a POST request to the trigger endpoint with the JWT Bearer token:
   ```bash
   curl -X POST http://localhost:3000/api/burgerprints-sync/trigger \
     -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
   ```
3. Observe the backend console logs. You should see:
   - The initial list sync fetching pages.
   - BullMQ jobs being enqueued for each product.
   - BullMQ workers processing the detail/partner/shipping fetches concurrently.

## Validating Results

- Check the MongoDB `products` collection to see the new fields populated (`baseSku`, `options`, `partnerSupport`, `detailFetched: true`, etc.).
- BullMQ provides automatic retries for failed jobs (e.g., if the external API rate-limits temporarily).
