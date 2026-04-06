# Wedding API

Backend `NestJS` starter for the `wedding` project.

## Features

- `NestJS` REST API scaffold
- Global `ValidationPipe` with whitelist and transform enabled
- Global `ConfigModule` loading environment variables from `.env`
- Health check endpoint at `GET /api/health`

## Environment

Copy `.env.example` to `.env` and adjust values if needed:

```bash
NODE_ENV=development
PORT=3000
```

## Install

```bash
npm install
```

## Run

```bash
# development
npm run start:dev

# production build
npm run build
npm run start:prod
```

## Test

```bash
npm run test
npm run test:e2e
```

## API Check

After starting the app, verify the service is healthy:

```bash
GET http://localhost:3000/api/health
```
