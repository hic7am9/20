/*
# Add external_uid column for iCal-synced bookings

1. Modified tables
- `bookings`: add `external_uid` (text, nullable) — stores the Airbnb/iCal event UID so synced bookings can be matched on subsequent syncs and updated instead of duplicated.
- `bookings`: add `sync_source` (text, nullable) — stores the origin of the sync (e.g. 'airbnb_ical') to distinguish imported bookings from manual ones.
- A unique index on (apartment_id, external_uid) prevents duplicate bookings for the same external event on the same apartment.
2. Security
- No new tables; existing RLS policies and grants on `bookings` already cover all columns.
*/

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS external_uid text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS sync_source text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_external_uid
  ON bookings (apartment_id, external_uid)
  WHERE external_uid IS NOT NULL;
