# Nivaas — Live Deployment Guide (Vercel + Railway)

Complete step-by-step instructions to take the Nivaas Real Estate Platform live.

---

## 1. Quick Checklist

| Component | Platform | Role |
|---|---|---|
| **Database** | **Railway MySQL** | Cloud MySQL 8 database storing properties, users, bookings, inquiries |
| **Backend API** | **Railway** | Node.js / Express REST API (`server/`) with JWT authentication & uploads |
| **Frontend** | **Vercel** | React 19 + TanStack Router web application on global edge CDN |

---

## 2. Phase 1: Railway MySQL Database Setup

1. Go to [Railway.app](https://railway.app) and sign in with GitHub.
2. Click **`New Project`** > **`Provision MySQL`**.
3. Once created, click on the **MySQL** service card:
   - Click the **`Connect`** tab to find your connection details.
   - Click the **`Variables`** tab to see your `MYSQL_URL`, `MYSQLHOST`, `MYSQLUSER`, `MYSQLPASSWORD`, etc.
4. **Import Database Schema**:
   - Open [`nivaas_db.sql`](./nivaas_db.sql) in your code editor.
   - In Railway, click the **Data** tab on the MySQL service.
   - Paste the SQL script and run it, or connect via TablePlus/DBeaver using the public MySQL connection string and execute [`nivaas_db.sql`](./nivaas_db.sql).

---

## 3. Phase 2: Railway Backend API Deployment

1. **Push your Code to GitHub**:
   If you have not already initialized a Git repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Vercel and Railway live deployment"
   git branch -M main
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPOSITORY_NAME>.git
   git push -u origin main
   ```
   *(If you already have a GitHub repo, simply run `git add .`, `git commit -m "Ready for live deployment"`, and `git push origin main`)*.
2. In the same Railway project (with your MySQL service):
   - Click **`+ New`** > **`GitHub Repo`**.
   - Select this repository.
3. Configure the service:
   - Click the service card > **`Settings`**.
   - Under **Root Directory**, set: `/server` *(Crucial: runs the backend from the server folder)*.
   - Under **Build Command**: leave default or `npm install`.
   - Under **Start Command**: `npm start`.
4. Configure Variables:
   - Go to the **`Variables`** tab and add:

   ```env
   MYSQL_URL=${{MySQL.MYSQL_URL}}
   JWT_SECRET=nivaas_production_secret_key_2026_xyz987
   PORT=4000
   NODE_ENV=production
   CLIENT_URL=https://*.vercel.app
   ```
   *(Note: You can use Railway's "Add Reference" button to link `${{MySQL.MYSQL_URL}}` directly from your MySQL service!)*
5. Generate Public Domain:
   - Go to **`Settings`** > **`Public Networking`** (or **Networking** tab).
   - Click **`Generate Domain`**.
   - You will get a URL like `https://nivaas-server-production-xxxx.up.railway.app`.
   - Verify by visiting `https://nivaas-server-production-xxxx.up.railway.app/api/properties` in your browser.

---

## 4. Phase 3: Vercel Frontend Deployment

1. Go to [Vercel.com](https://vercel.com) and log in with GitHub.
2. Click **`Add New...`** > **`Project`**.
3. Select your GitHub repository and click **`Import`**.
4. Configure Project:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (Default root)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add Environment Variable:
   - Under **Environment Variables**, add:
     ```env
     VITE_API_URL=https://nivaas-server-production-xxxx.up.railway.app/api
     ```
     *(Use your actual Railway domain from Phase 2)*.
6. Click **`Deploy`**.
   - Vercel will build the frontend and provide your live URL (e.g. `https://nivaas-rental.vercel.app`).

---

## 5. Phase 4: Connect & Finalize

1. Go back to [Railway.app](https://railway.app) > Backend Service > **`Variables`**.
2. Update `CLIENT_URL` to match your exact live Vercel domain:
   ```env
   CLIENT_URL=https://nivaas-rental.vercel.app
   ```
   *(No trailing slash)*.
3. Test your live website:
   - User Sign-up & Login
   - Browsing & filtering property listings
   - Responsive mobile view with `<` and `>` carousel buttons
   - Property details and inquiry submission
