# EcoCarry AI Packaging Generator

Frontend-only 3D cup editor for creating printable cup artwork, previewing it on an interactive cup mockup, exporting production files, and capturing preview images.

## Stack

- React 19
- Vite
- Three.js
- Tailwind CSS
- Lucide icons
- Vitest and React Testing Library

## Local Setup

```bash
corepack pnpm install
corepack pnpm dev
```

The web app runs on `http://localhost:5173`.

## Commands

```bash
corepack pnpm dev
corepack pnpm build
corepack pnpm lint
corepack pnpm test
corepack pnpm --filter @ecocarry/web dev
```

## Docker

```bash
docker build -f Dockerfile.web -t ecocarry-web .
docker run --rm -p 5173:80 ecocarry-web
```

## Notes

There is no backend API dependency in the current app. The cup editor runs fully in the browser. AI artwork generation uses Puter.js from the browser when the user clicks generate.
