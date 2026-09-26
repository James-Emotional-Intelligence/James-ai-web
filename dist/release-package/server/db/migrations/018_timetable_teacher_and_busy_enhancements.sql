-- Migration 018: Add teacher to school_timetable_entries, and location/commute to busy_events
ALTER TABLE school_timetable_entries ADD COLUMN teacher VARCHAR(100) NULL;
ALTER TABLE busy_events ADD COLUMN location VARCHAR(150) NULL;
ALTER TABLE busy_events ADD COLUMN commute_before_minutes INT DEFAULT 0;
ALTER TABLE busy_events ADD COLUMN commute_after_minutes INT DEFAULT 0;
