-- Store consent to PII processing (152-FZ).
-- We need to prove the user actively accepted the privacy policy and terms.
alter table profiles
  add column if not exists consent_given_at  timestamptz,
  add column if not exists consent_version   text;

comment on column profiles.consent_given_at is 'When the user accepted the privacy policy and terms (152-FZ proof).';
comment on column profiles.consent_version  is 'Version tag of the policy/terms accepted (e.g. 2026-05-02).';
