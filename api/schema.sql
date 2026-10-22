-- One row per report. The finished report HTML lives here too (a report is about 60 KB).
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  scope TEXT NOT NULL,                 -- 'page' or 'site'
  status TEXT NOT NULL,                -- queued, running, done, failed
  step INTEGER NOT NULL DEFAULT 0,     -- index into the progress steps shown to the user
  product_name TEXT,
  error TEXT,
  html TEXT,
  cost_usd REAL NOT NULL DEFAULT 0,
  ip_hash TEXT,
  data TEXT,                           -- JSON inputs of the report (profile, taste, communities, spec)
  ads_status TEXT,                     -- running, done, failed; NULL for reports made before ad kits
  ads_html TEXT,
  activity TEXT,                       -- JSON: the taste agents' latest steps, for the progress page
  featured INTEGER NOT NULL DEFAULT 0, -- > 0: shown in the /reports gallery, in this order
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_created ON reports (created_at);
CREATE INDEX IF NOT EXISTS reports_url ON reports (url, scope, status);
