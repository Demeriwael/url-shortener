-- Owned by the URLs module. Other modules must use its public API.
CREATE SCHEMA urls;

CREATE TABLE urls.short_urls (
  code varchar(64) PRIMARY KEY,
  original_url text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT short_urls_code_format CHECK (code ~ '^[A-Za-z0-9_-]{3,64}$'),
  CONSTRAINT short_urls_http_url CHECK (original_url ~ '^https?://'),
  CONSTRAINT short_urls_url_length CHECK (length(original_url) <= 8192)
);
