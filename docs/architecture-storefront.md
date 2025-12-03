# Storefront Architecture

## Executive Summary

The Storefront is an **Edge-rendered Web Application** built with **React Router v7**. It is designed for high performance, SEO optimization, and a seamless user experience. It runs on **Cloudflare Workers** for global distribution.

## Technology Stack

- **Framework**: React Router v7
- **Language**: TypeScript
- **Styling**: TailwindCSS v4
- **Platform**: Cloudflare Workers
- **State Management**: React Router Loaders/Actions (Server State), React Context (Client State)

## Architecture Pattern

The storefront follows a **Remix-style / Edge-first** architecture.
- **Loaders**: Fetch data on the server (edge) before rendering.
- **Actions**: Handle form submissions and mutations on the server (edge).
- **Components**: Reusable UI blocks (see [Component Inventory](../component-inventory-storefront.md)).
- **Routes**: File-system based routing mapping URLs to UI.

## Integration

- **Backend**: Communicates with the Medusa Backend via REST API.
- **Stripe**: Integrates Stripe Elements for payment processing.
- **PostHog**: Client-side analytics integration.

## Development Workflow

- **Local Dev**: `npm run dev` starts the React Router dev server.
- **Testing**: Vitest is used for component and logic tests.
- **Preview**: `npm run preview` builds and runs the worker locally.

## Deployment

Deployed to **Cloudflare Workers** via Wrangler.
See [Deployment Guide](../deployment-guide.md) for details.
