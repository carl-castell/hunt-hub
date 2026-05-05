# Hunt Hub — Web

React frontend built with Vite + TypeScript.

## Setup

From the repo root, install all dependencies:

```bash
npm install
```

## Development

Start the backend first (it must be running for API calls to work):

```bash
cd ../backend && npm run dev
```

Then start the frontend:

```bash
npm run dev
```

Vite runs on [http://localhost:5173](http://localhost:5173) and proxies `/api` requests to the backend on port 3000.

## Build

```bash
npm run build
```

Output goes to `dist/`.
