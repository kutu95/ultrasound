-- Multiple screenshot/image attachments per case.
-- Files themselves live on disk; this table stores metadata only.

CREATE TABLE case_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
  stored_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_case_images_case_id ON case_images (case_id);
