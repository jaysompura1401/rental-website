# Nivaas — Real Estate Platform

A full-stack modern real estate web platform to rent, buy, and manage residential & commercial properties across Gujarat.

- **Frontend**: React 19, TanStack Router, TanStack Query, Tailwind CSS v4, Lucide Icons
- **Backend**: Node.js, Express REST API, MySQL 8 (`mysql2/promise`), JWT Authentication, Multer
- **Production Infrastructure**:
  - **Frontend UI**: [Vercel](https://vercel.com) (Global Edge CDN)
  - **Backend API**: [Railway](https://railway.app) (Express Node.js Container)
  - **Database**: [Railway MySQL](https://railway.app) (Managed Cloud MySQL 8)

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Step-by-Step Live Deployment Guide](#step-by-step-live-deployment-guide)
   - [Phase 1: Railway MySQL Database Setup](#phase-1-railway-mysql-database-setup)
   - [Phase 2: Railway Backend API Deployment](#phase-2-railway-backend-api-deployment)
   - [Phase 3: Vercel Frontend Deployment](#phase-3-vercel-frontend-deployment)
   - [Phase 4: Connect & Enable CORS](#phase-4-connect--enable-cors)
3. [Environment Variables Reference](#environment-variables-reference)
4. [Local Development Setup](#local-development-setup)
5. [Troubleshooting & FAQs](#troubleshooting--faqs)

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                   USER BROWSER / MOBILE                │
└───────────────────────────┬────────────────────────────┘
                            │
              HTTPS Requests│
                            ▼
┌────────────────────────────────────────────────────────┐
│              FRONTEND (Hosted on VERCEL)               │
│  • React 19 + TanStack Router (File-based SPA)         │
│  • Responsive Mobile & Desktop Layouts                 │
│  • Domain: https://your-nivaas.vercel.app              │
│  • Env: VITE_API_URL=https://your-api.up.railway.app/api│
└───────────────────────────┬────────────────────────────┘
                            │
                 REST API   │ (CORS Enabled)
                            ▼
┌────────────────────────────────────────────────────────┐
│              BACKEND (Hosted on RAILWAY)               │
│  • Node.js / Express REST API (server/)                │
│  • JWT Auth, Image Uploads (/uploads), Scoring Engine  │
│  • Domain: https://your-api.up.railway.app             │
└───────────────────────────┬────────────────────────────┘
                            │
               TCP Port 3306│ (Internal Private Network)
                            ▼
┌────────────────────────────────────────────────────────┐
│            DATABASE (Hosted on RAILWAY MYSQL)          │
│  • Managed MySQL 8 Database                            │
│  • Schema: nivaas_db.sql                               │
│  • Tables: Users, Properties, Images, Reviews, etc.    │
└────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Live Deployment Guide

---

### Phase 1: Railway MySQL Database Setup

1. **Sign in to Railway**:
   - Go to [Railway.app](https://railway.app) and sign in with your GitHub account.

2. **Create a New Project**:
   - Click **`New Project`** (or **`+ New`**).
   - Select **`Provision MySQL`**.
   - Railway will provision a dedicated MySQL database within seconds.

3. **Get MySQL Connection Details**:
   - Click on the **MySQL** card in your project canvas.
   - Go to the **`Variables`** tab to see your credentials:
     - `MYSQLHOST`
     - `MYSQLUSER`
     - `MYSQLPASSWORD`
     - `MYSQLDATABASE`
     - `MYSQLPORT`
     - `MYSQL_URL` (Full connection string)
   - Go to the **`Connect`** tab and copy the **Public URL** or connection command.

4. **Import Database Schema (`nivaas_db.sql`)**:
   You can import the database schema using either of these simple methods:

   - **Option A (Railway Dashboard - Easiest)**:
     1. Click the MySQL box on Railway.
     2. Open the **`Data`** tab.
     3. Open your local [`nivaas_db.sql`](./nivaas_db.sql) file in VS Code / Notepad.
     4. Copy all contents, paste into Railway's SQL Query runner, and click **Run Query**.

   - **Option B (Using TablePlus / DBeaver / MySQL Workbench)**:
     1. In Railway MySQL > **Connect**, copy the **Public Connection URL**.
     2. Open TablePlus / DBeaver, create a new connection, and paste the connection string.
     3. Open [`nivaas_db.sql`](./nivaas_db.sql) and execute the script.

   - **Option C (Using Command Line / Terminal)**:
     ```bash
     mysql -h <MYSQLHOST> -u <MYSQLUSER> -p<MYSQLPASSWORD> -P <MYSQLPORT> <MYSQLDATABASE> < nivaas_db.sql
     ```

---

### Phase 2: Railway Backend API Deployment

1. **Push your Code to GitHub**:
   If you have not already pushed your code to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Vercel and Railway live deployment"
   git branch -M main
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPOSITORY_NAME>.git
   git push -u origin main
   ```
   *(If you already have a GitHub repo, simply run `git add .`, `git commit -m "Ready for live deployment"`, and `git push origin main`)*.

2. **Add Backend Service on Railway**:
   - In the same Railway project where your MySQL database is running:
   - Click **`+ New`** > **`GitHub Repo`**.
   - Select your repository (`rental-website-main-fixed` or your repo name).

3. **Configure the Service Settings**:
   - Click on the newly created service card.
   - Go to the **`Settings`** tab:
     - **Root Directory**: Set to `/server` *(Very important: This tells Railway to build and run the backend code in the `server` folder)*.
     - **Build Command**: Leave default (or `npm install`).
     - **Start Command**: `npm start` (or `node index.js`).

4. **Add Environment Variables**:
   - In the service card, switch to the **`Variables`** tab.
   - Click **`Add Variable`** or **`Raw Editor`** and add:

   | Key | Value | Description |
   |---|---|---|
   | `MYSQL_URL` | `${{MySQL.MYSQL_URL}}` | Select "Add Reference" to your Railway MySQL service |
   | `JWT_SECRET` | `nivaas_super_secret_jwt_key_live_2026_production` | Strong random secret string |
   | `PORT` | `4000` | Railway port |
   | `CLIENT_URL` | `https://*.vercel.app` | Will be updated with your exact Vercel URL in Phase 4 |
   | `NODE_ENV` | `production` | Production mode |

   > **Note on MySQL Reference**: Railway allows you to reference variables between services. If you type `${{MySQL.MYSQL_URL}}`, Railway will automatically link the database credentials!

5. **Generate a Public Domain for your API**:
   - Go to the **`Networking`** (or **Settings > Public Networking**) section of your backend service.
   - Click **`Generate Domain`**.
   - You will receive a URL like:
     ```
     https://nivaas-server-production-xxxx.up.railway.app
     ```
   - **Test it in your browser**:
     Visit: `https://nivaas-server-production-xxxx.up.railway.app/api/properties`
     *(You should receive a JSON response with status 200 and properties list!)*

---

### Phase 3: Vercel Frontend Deployment

1. **Sign in to Vercel**:
   - Go to [Vercel.com](https://vercel.com) and log in with your GitHub account.

2. **Import Repository**:
   - Click **`Add New...`** > **`Project`**.
   - Find your GitHub repository and click **`Import`**.

3. **Configure Project Settings**:
   - **Framework Preset**: `Vite` (automatically detected).
   - **Root Directory**: `./` (Default root).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist` (or default).
   - **Install Command**: `npm install`

4. **Add Environment Variables**:
   - In the **Environment Variables** section on Vercel, add:

   | Variable Name | Value |
   |---|---|
   | `VITE_API_URL` | `https://nivaas-server-production-xxxx.up.railway.app/api` |

   *(Replace `nivaas-server-production-xxxx.up.railway.app` with the real domain Railway gave you in Phase 2)*.

5. **Deploy**:
   - Click **`Deploy`**.
   - Vercel will build the frontend and provide your live URL (e.g., `https://nivaas-rental.vercel.app`).

---

### Phase 4: Connect & Enable CORS

Now link the two deployments together so they can communicate seamlessly:

1. **Update `CLIENT_URL` in Railway**:
   - Go back to [Railway.app](https://railway.app) > Backend Service > **`Variables`**.
   - Edit `CLIENT_URL` and set it to your exact Vercel production domain:
     ```env
     CLIENT_URL=https://nivaas-rental.vercel.app
     ```
   - Railway will automatically redeploy with the updated CORS policy.

2. **Verify Full Application Functionality**:
   - Open your Vercel URL in your mobile browser and desktop browser.
   - **Check**:
     1. Homepage property carousels load properly with live images.
     2. Mobile `<` and `>` arrow buttons scroll smoothly.
     3. Search filters (Rent, Buy, Short-Term, PG) return matching properties.
     4. User registration & Login work with JWT authentication.
     5. Saved properties, inquiry submissions, and property listings function without errors.

---

## Environment Variables Reference

### Backend (Railway)

```env
# Database (Auto-populated if using Railway MySQL Reference)
MYSQL_URL=mysql://root:password@mysql.railway.internal:3306/railway
# Or individual fields:
DB_HOST=mysql.railway.internal
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=railway

# Server Configuration
PORT=4000
NODE_ENV=production
JWT_SECRET=generate_a_random_64_character_string_here

# Frontend CORS URL
CLIENT_URL=https://your-nivaas-app.vercel.app
```

### Frontend (Vercel)

```env
# URL pointing to your Railway backend API
VITE_API_URL=https://your-backend-service.up.railway.app/api
```

---

## Local Development Setup

If you want to run the project locally on your development machine:

### 1. Start Local MySQL Database
Create a MySQL database named `nivaas` and import `nivaas_db.sql`:
```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS nivaas;"
mysql -u root -p nivaas < nivaas_db.sql
```

### 2. Start Backend API
```bash
cd server
npm install
npm run dev
```
Backend runs at: `http://localhost:4000/api`

### 3. Start Frontend
In a new terminal window at the project root:
```bash
npm install
npm run dev
```
Frontend runs at: `http://localhost:5173`

---

## Troubleshooting & FAQs

### Q1: API calls return `Network Error` or `CORS Error`
- **Cause**: The backend does not allow requests from your Vercel domain.
- **Fix**: Check `CLIENT_URL` in your Railway backend variables. Ensure it matches your Vercel domain exactly (e.g. `https://nivaas-app.vercel.app`, with no trailing slash). Note that Railway already allows all `*.vercel.app` domains automatically.

### Q2: Images uploaded by users are not showing up
- **Cause**: Image uploads are stored in `server/uploads/`.
- **Fix**: When uploading images, the backend serves them statically at `https://your-railway-domain.up.railway.app/uploads/...`. Ensure your backend service is running and `server/uploads` directory is accessible.

### Q3: Vercel shows 404 when refreshing sub-pages (e.g. `/properties`)
- **Cause**: Single-page application routing needs all URL paths redirected to `index.html`.
- **Fix**: Ensure `vercel.json` exists in your repository root with rewrite rules:
  ```json
  {
    "rewrites": [
      {
        "source": "/((?!assets|uploads|favicon.ico).*)",
        "destination": "/index.html"
      }
    ]
  }
  ```

### Q4: Database tables are missing columns
- **Fix**: The backend automatically runs schema extension migrations on startup (`initSchemaExtensions()` in `server/db.js`), ensuring tables and columns are created even if omitted from the initial import.

---

## License

This project is licensed under the MIT License.