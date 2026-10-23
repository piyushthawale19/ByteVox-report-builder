# ByteVox — Show-Your-Work Report Builder

ByteVox is a full-stack, transparent report builder that enables teams to upload CSV datasets, inspect automated data-quality profiles, and construct verifiable, formula-backed reports. Every metric, chart, and table in ByteVox is fully traceable with an inspectable computation audit trail.

---

## 🌟 Key Features

- **Automated CSV Profiling & Quality Engine**:
  - Auto-detection of data types (`number`, `date`, `category`, `text`).
  - Missing value counts and anomaly row identification.
  - Granular inspection of invalid cells and parsing reason warnings.

- **Interactive Block-Based Report Builder**:
  - **Metric Blocks**: Sum, Average, Count, Min, Max with live formatting.
  - **Chart Blocks**: Bar, Line, Area charts powered by Recharts with dynamic dimension & metric selectors.
  - **Table Blocks**: Interactive data grid with configurable columns and sort orders.
  - **Rich Text Blocks**: Contextual descriptions and section headers.

- **"Show-Your-Work" Audit Trail**:
  - Every visualization includes an explanation drawer displaying the exact formula, row count, filtered-out record count, and sample data.

- **Secure Token-Based Share Links**:
  - Generate public read-only report links with customizable expiration (e.g., 24 hours, 7 days).
  - Ability to instantly revoke shared links.

- **Robust Cross-Platform Authentication**:
  - JWT authentication supporting both `httpOnly` cookies and `Bearer` authorization headers (guaranteeing cross-origin stability between Vercel and Render).
  - Password hashing with bcrypt (salt rounds = 10).
  - Rate limiting on login endpoints.

---

## 🏗️ Architecture & Technology Stack

```
ByteVox-report-builder/
├── client/                     # Frontend Application
│   ├── src/
│   │   ├── api/                # API client with dual Cookie + Bearer auth
│   │   ├── components/         # Reusable UI components & layouts
│   │   ├── context/            # AuthContext & state providers
│   │   └── pages/              # Datasets, Reports, Login, Signup
│   ├── vercel.json             # Vercel SPA routing rules
│   └── package.json            # React 18, Vite 5, Recharts, React Router 6
├── server/                     # Backend API Service
│   ├── src/
│   │   ├── db/                 # SQLite database & migrations (better-sqlite3)
│   │   ├── middleware/         # Auth, validation (Zod), and error handlers
│   │   ├── routes/             # Datasets, Reports, Share, Auth routes
│   │   └── services/           # CSV profiling, aggregation & math engine
│   └── package.json            # Express 4, TypeScript, Zod, Multer, Tsx
├── uploads/                    # Secure local dataset CSV storage
└── sample_sales.csv            # Demonstration dataset
```

---

## 🚀 Local Development Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

---

### Step 1: Clone the Repository
```bash
git clone https://github.com/piyushthawale19/ByteVox-report-builder.git
cd ByteVox-report-builder
```

---

### Step 2: Backend (Server) Setup

1. Navigate to the `server` directory and install dependencies:
   ```bash
   cd server
   npm install
   ```

2. Create a `.env` file in `server/`:
   ```env
   PORT=3001
   NODE_ENV=development
   JWT_SECRET=your-local-dev-jwt-secret-key-12345
   CLIENT_URL=http://localhost:5173
   UPLOAD_DIR=../uploads
   MAX_FILE_SIZE_MB=10
   ```

3. Start the backend development server:
   ```bash
   npm run dev
   ```
   *The backend will start at `http://localhost:3001`.*

---

### Step 3: Frontend (Client) Setup

1. Open a new terminal, navigate to the `client` directory, and install dependencies:
   ```bash
   cd client
   npm install
   ```

2. Create a `.env` file in `client/`:
   ```env
   # Leave blank in local development to use Vite's built-in /api proxy
   VITE_API_URL=
   ```

3. Start the frontend development server:
   ```bash
   npm run dev
   ```
   *The frontend will start at `http://localhost:5173`.*

---

## ☁️ Deployment Guide

### 1. Backend Deployment (Render)

1. Push your code to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com/) and click **New + > Web Service**.
3. Connect your GitHub repository.
4. Configure the service settings:
   - **Root Directory**: `server`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
5. In the **Environment Variables** section, add:
   | Key | Value (Example) | Notes |
   | :--- | :--- | :--- |
   | `NODE_ENV` | `production` | Enables production cookie & security rules |
   | `JWT_SECRET` | *(Random 32+ character string)* | Used for JWT signing |
   | `CLIENT_URL` | `https://byte-vox-report-builder.vercel.app` | Your Vercel frontend URL (no trailing slash) |
   | `UPLOAD_DIR` | `./uploads` or `/var/data` | Path to store uploaded files |
   | `MAX_FILE_SIZE_MB` | `10` | Maximum allowed upload size in megabytes |
6. Click **Create Web Service**. Note your backend URL (e.g. `https://bytevox-report-builder.onrender.com`).

---

### 2. Frontend Deployment (Vercel)

1. Go to [Vercel Dashboard](https://vercel.com/) and click **Add New > Project**.
2. Import your GitHub repository.
3. Configure the project settings:
   - **Root Directory**: `client`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. In the **Environment Variables** section, add:
   | Key | Value | Notes |
   | :--- | :--- | :--- |
   | `VITE_API_URL` | `https://bytevox-report-builder.onrender.com` | Your Render backend URL (no trailing slash) |
5. Click **Deploy**.

---

## 🧪 Testing the Complete Workflow

1. Open the deployed Vercel frontend.
2. **Sign Up**: Register a new user account.
3. **Upload Dataset**: Upload `sample_sales.csv` from the root folder.
4. **Data Quality Profile**: Check row count, column types, and data health inspection.
5. **Create Report**:
   - Add a **Metric Block** (e.g., Total Sales `Sum(Sales)`).
   - Add a **Chart Block** (e.g., Sales by Region Bar Chart).
   - Add a **Table Block** (e.g., Preview raw rows).
6. **Show Your Work**: Click "Explain" on any metric to view the execution math and data trail.
7. **Share**: Create a public link with expiration and verify viewing in an incognito window.

---

## 🛡️ Security & Reliability Best Practices

- **Strict CORS Validation**: Server checks request origins against configured `CLIENT_URL`.
- **Cross-Domain Token Redundancy**: Supports both `SameSite=None; Secure` cookies and `Authorization: Bearer` headers to prevent third-party cookie blocking across independent domains.
- **Input Validation**: All payloads validated with [Zod](https://zod.dev/) schemas before processing.
- **Parameterized SQL**: SQLite operations executed using prepared statements to prevent SQL injection.
- **Graceful Error Handling**: Structured JSON error responses across all endpoints.

---

## 📄 License
This project is licensed under the ISC License.
