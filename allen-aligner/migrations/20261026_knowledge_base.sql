-- Allen Aligner Module 53: Knowledge Base
-- Apply explicitly before using the Knowledge Base; requests never change the schema.
CREATE TABLE IF NOT EXISTS allen_kb_articles (
  id uuid PRIMARY KEY,
  title text NOT NULL,
  category text NOT NULL,
  content text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published','archived')),
  version integer NOT NULL DEFAULT 1,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS allen_kb_audit (
  id bigserial PRIMARY KEY,
  article_id uuid NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS allen_kb_articles_updated_idx ON allen_kb_articles(updated_at DESC);
