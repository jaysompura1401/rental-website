# Nivaas — Agent Verification Panel Guide

## 📍 Path to Open the Agent Panel

- **Web URL**: [`/dashboard/agent-verification`](http://localhost:8080/dashboard/agent-verification) (or `http://localhost:5173/dashboard/agent-verification`)
- **Navigation in App**: Open the sidebar in the Dashboard and click **"Agent Verification"** (with the clipboard icon).
- **Source Code Path**: [`src/routes/_authenticated/dashboard.agent-verification.tsx`](file:///d:/rental-website-main/rental-website-main/src/routes/_authenticated/dashboard.agent-verification.tsx)

> **Note on Roles:** Access is restricted to users with role **`agent`**, **`admin`**, or **`verification_team`**. You can change any user's role to `agent` via the **Admin Console** at [`/dashboard/admin`](http://localhost:8080/dashboard/admin) under the **Users** tab.

---

## 🚀 How to Use the Agent Panel (Step-by-Step)

```
1. Owner Posts Property ──► 2. Agent Visits & Verifies ──► 3. Instant Go-Live in Owner Panel
   (Status: Pending)           • Verify Mobile (OTP)         (Status: Active & Verified)
                               • Upload Aadhaar Card
                               • Upload Utility Bill
                               • Upload Owner Photo
                               • Upload Property Photos
```

### 1. View Pending Listings
1. Log in with an account having role `agent` or `admin`.
2. Navigate to [`/dashboard/agent-verification`](http://localhost:8080/dashboard/agent-verification).
3. Browse all properties submitted by owners that are currently **Pending Verification**.
4. Click **"Verify Now"** on any property card to open the verification workspace.

### 2. Complete the 5 Verification Requirements
1. **📱 Step 1: Owner Mobile Verification (OTP)**
   - Enter/confirm the owner's phone number.
   - Click **"Send OTP"** (In development/demo mode, the fixed OTP is `123456`).
   - Enter the OTP received by the owner and click **"Verify"** to mark mobile as verified.
2. **🆔 Step 2: Owner Aadhaar Card**
   - Click to upload the owner's government identity document (Aadhaar Card) in JPG, PNG, or PDF format.
3. **📄 Step 3: Utility Bill**
   - Click to upload the Electricity, Water, or Gas bill as proof of address/ownership.
4. **📸 Step 4: Owner Photograph**
   - Upload/capture the owner's live photograph taken on-site.
5. **🏠 Step 5: Property Verification Photos**
   - Upload field inspection photos of the property (living room, bedrooms, exterior, entrance).
6. **📝 Step 6: Agent Notes (Optional)**
   - Add any inspection remarks, locality highlights, or condition notes.

### 3. Submit & Publish
- Click **"Submit & List Property"**.
- The backend validates all requirements, updates the property status to **`active`** and **`verified=true`**, sends an in-app notification to the owner, and makes the listing publicly visible!

---

## 🛠️ Summary of Changes Made

### 1. Database Schema
- **File**: [`nivaas_agent_verification.sql`](file:///d:/rental-website-main/rental-website-main/nivaas_agent_verification.sql)
  - Created table `nivaas_agent_verifications` to store Aadhaar URL, Utility Bill URL, Owner Photo URL, Property Photos JSON, Mobile Verification status, and Agent Notes.
  - Linked to `nivaas_properties` and `nivaas_users` with foreign keys and cascade delete.

### 2. Backend API
- **File**: [`server/routes/agent-verification.js`](file:///d:/rental-website-main/rental-website-main/server/routes/agent-verification.js)
  - `GET /api/agent-verification/pending-properties` — Lists pending properties awaiting agent review.
  - `GET /api/agent-verification/:propertyId` — Retrieves draft verification details for a property.
  - `POST /api/agent-verification/upload-doc/:propertyId` — Streams document uploads (Aadhaar, Utility Bill, Owner Photo) to Supabase Storage.
  - `POST /api/agent-verification/upload-property-photos/:propertyId` — Multi-photo upload for field inspection images.
  - `POST /api/agent-verification/send-otp` — Generates and sends OTP to owner's mobile.
  - `POST /api/agent-verification/verify-otp` — Verifies the OTP entered by the agent.
  - `POST /api/agent-verification/submit/:propertyId` — Validates complete check, marks property as `verified=true`, `verification_status='verified'`, `status='active'`, logs the audit, and notifies the owner.
- **File**: [`server/index.js`](file:///d:/rental-website-main/rental-website-main/server/index.js)
  - Registered the `/api/agent-verification` route.

### 3. Frontend API Client
- **File**: [`src/lib/api.ts`](file:///d:/rental-website-main/rental-website-main/src/lib/api.ts)
  - Added `agentVerification` namespace with typed interfaces (`AgentVerificationRecord`, `PendingProperty`) and API methods.

### 4. Navigation & Layout
- **File**: [`src/components/dashboard/DashboardShell.tsx`](file:///d:/rental-website-main/rental-website-main/src/components/dashboard/DashboardShell.tsx)
  - Added **"Agent Verification"** navigation link in sidebar for users with `agent`, `admin`, and `verification_team` roles.

### 5. Frontend Agent Verification Workspace
- **File**: [`src/routes/_authenticated/dashboard.agent-verification.tsx`](file:///d:/rental-website-main/rental-website-main/src/routes/_authenticated/dashboard.agent-verification.tsx)
  - Full-featured dashboard page with search/filtering, pending count KPI cards, step-by-step verification modal, upload previews, OTP workflow, and one-click submission.
