CREATE TABLE citizen_profile (
  user_id uuid PRIMARY KEY REFERENCES user_account(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  district text NOT NULL,
  state text NOT NULL,
  pincode text NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.citizen_profile IS
  'Citizen name and address only. No document, photo-ID, or file-reference columns by design.';
