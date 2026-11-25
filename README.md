# Executive Sprint Dashboard

A local-first web application that transforms Jira sprint data into a presentation-ready **Executive Sprint Dashboard** with dual data ingestion:
1. **Jira "All Fields" CSV Upload** (handles duplicate `Sprint`, `Comment`, `Labels`, and `Inward/Outward issue link` columns by index).
2. **Direct Jira Cloud REST API** (Standard Plan safe: strict `fields` projection, sequential `maxResults=100` pagination, `429 Retry-After` exponential backoff, and local JSON caching).

## Setup Instructions

1. **Configure Environment:**
   Copy `.env.example` to `backend/.env` and optionally set `AI_PROVIDER` (`openai`, `gemini`, `ollama`, or `none` for deterministic synthesis).

2. **Install Dependencies:**
   ```bash
   npm --prefix backend install
   npm --prefix frontend install
   ```

3. **Run Locally (Two Terminals):**
   ```bash
   # Terminal 1: Backend API (http://localhost:3001)
   npm --prefix backend run dev

   # Terminal 2: Frontend UI (http://localhost:5173)
   npm --prefix frontend run dev
   ```

4. **Run Backend Tests:**
   ```bash
   npm --prefix backend test
   ```
