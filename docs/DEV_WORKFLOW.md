# Development Workflow Guide

## Overview
This guide walks a new developer through setting up the **Hybrid Cloud‑Data** development environment for the **gracestowel** project.

## Prerequisites
- Node.js 20+ installed
- Yarn (or npm) installed
- A Railway account with the **Development** project created (see `ENVIRONMENT_SETUP.md` for details)
- Cloudflare account (for deploying the Remix storefront later)

## Steps
1. **Clone the Repository**
   ```bash
   git clone git@github.com:builderbuilds123/gracestowel.git
   cd gracestowel
   ```
2. **Create a `.env` for the Backend**
   - Copy the template:
     ```bash
     cp apps/backend/.env.template apps/backend/.env
     ```
   - Replace the placeholder values with the **Railway Development** PostgreSQL and Redis URLs you obtained from the Railway dashboard.
   - Ensure `STORE_CORS` points to `http://localhost:5173` (the Remix dev server).
3. **Create a `.dev.vars` for the Frontend**
   - In `apps/storefront/` create a file named `.dev.vars` (already added by the setup script).
   - Add the `DATABASE_URL` line with the same PostgreSQL dev URL used in the backend.
4. **Install Dependencies**
   ```bash
   # Backend
   cd apps/backend
   yarn install   # or npm install
   # Frontend
   cd ../storefront
   yarn install   # or npm install
   ```
5. **Run the Services Locally**
   - **Backend (Medusa)**
     ```bash
     cd apps/backend
     yarn dev   # or npm run dev
     ```
     You should see logs confirming connections to the Railway dev DB and Redis.
   - **Frontend (Remix)**
     ```bash
     cd apps/storefront
     yarn dev   # or npm run dev
     ```
     The app will start on `http://localhost:5173` and load data from the shared dev database.
6. **Verify Data Sync**
   - Open the Medusa admin at `http://localhost:7001` and create a product.
   - Refresh the Remix storefront; the new product should appear instantly, confirming both services are using the same dev DB.
7. **Collaboration**
   - Share the same Railway dev URLs with your co‑founder.
   - Both developers can run the steps above and see each other's changes in real time.

## Tips & Gotchas
- **Never commit `.dev.vars`** – it contains secrets. It is already ignored in `.gitignore`.
- If you see connection errors, double‑check that you are using the **external proxy** URLs (e.g., `shuttle.proxy.rlwy.net`) and not the internal Railway URLs.
- When you are ready to deploy to production, simply push your code; Railway will inject the production credentials automatically.

---

*Happy hacking!*
