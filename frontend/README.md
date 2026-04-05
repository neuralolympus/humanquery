# HumanQuery — frontend

This package is the **HumanQuery** web UI (React + Vite + TypeScript). Project overview, features, and security notes live in the [root README](../README.md).

## Development

1. Start the [backend](../README.md#backend) first (`npm run dev` in `backend/`).
2. Copy environment defaults:

   ```bash
   cp .env.example .env
   ```

3. Run the dev server:

   ```bash
   npm install
   npm run dev
   ```

The app calls the API at `VITE_API_URL` (default `http://localhost:3001`). Override in `.env` if the backend runs elsewhere.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | ESLint |

## Stack

React 19, Vite, Tailwind CSS v4, DaisyUI, highlight.js for code tabs.
