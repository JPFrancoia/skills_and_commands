#!/usr/bin/env python3
"""Thunderbird/Betterbird calendar reader.

Read-only access to Thunderbird's cached CalDAV calendar data.
Configuration is stored in `pass` (the standard unix password manager)
under the entry `thunderbird_calendar/config`.

Usage:
    cal.py today
    cal.py tomorrow
    cal.py week
    cal.py upcoming [--days N]
    cal.py range --from YYYY-MM-DD --to YYYY-MM-DD
    cal.py search "query"
    cal.py free --date YYYY-MM-DD [--start HH:MM] [--end HH:MM]
    cal.py list-calendars [--db PATH]
    cal.py ics "Title" --start "YYYY-MM-DD HH:MM" --end "YYYY-MM-DD HH:MM" [--location ...] [--description ...] [--output FILE]
"""

import argparse
import glob
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import textwrap
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# ---------------------------------------------------------------------------
# Configuration via `pass`
# ---------------------------------------------------------------------------

PASS_ENTRY = "thunderbird_calendar/config"


def _load_config():
    """Load config from `pass`, with env var overrides."""
    config = {}

    # Try pass first
    try:
        result = subprocess.run(
            ["pass", "show", PASS_ENTRY],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            for line in result.stdout.strip().splitlines():
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    key, _, value = line.partition("=")
                    config[key.strip()] = value.strip()
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Env var overrides
    if os.environ.get("THUNDERBIRD_CALENDAR_DB"):
        config["db"] = os.environ["THUNDERBIRD_CALENDAR_DB"]
    if os.environ.get("THUNDERBIRD_CALENDAR_ID"):
        config["calendar_id"] = os.environ["THUNDERBIRD_CALENDAR_ID"]
    if os.environ.get("THUNDERBIRD_CALENDAR_TZ"):
        config["timezone"] = os.environ["THUNDERBIRD_CALENDAR_TZ"]

    return config


def _get_config():
    """Get config, erroring with setup instructions if missing."""
    config = _load_config()

    missing = []
    for key in ("db", "calendar_id", "timezone"):
        if key not in config:
            missing.append(key)

    if missing:
        print("ERROR: Missing config keys: " + ", ".join(missing), file=sys.stderr)
        print("", file=sys.stderr)
        print("Setup instructions:", file=sys.stderr)
        print("", file=sys.stderr)
        print("  1. Find your Thunderbird profile:", file=sys.stderr)
        print(
            "     ls ~/.thunderbird/*/calendar-data/cache.sqlite",
            file=sys.stderr,
        )
        print("", file=sys.stderr)
        print("  2. Find your calendar ID:", file=sys.stderr)
        print("     cal.py list-calendars --db /path/to/cache.sqlite", file=sys.stderr)
        print("", file=sys.stderr)
        print("  3. Store config in pass:", file=sys.stderr)
        print(f"     pass insert -m {PASS_ENTRY}", file=sys.stderr)
        print("     Then paste:", file=sys.stderr)
        print(
            "       db=~/.thunderbird/PROFILE/calendar-data/cache.sqlite",
            file=sys.stderr,
        )
        print("       calendar_id=YOUR_CALENDAR_UUID", file=sys.stderr)
        print("       timezone=Europe/London", file=sys.stderr)
        sys.exit(1)

    # Expand ~ in db path
    config["db"] = os.path.expanduser(config["db"])
    return config


# ---------------------------------------------------------------------------
# Database access
# ---------------------------------------------------------------------------


def _open_db(db_path):
    """Copy the SQLite DB (+ WAL/SHM) to a temp file and open it.

    Thunderbird uses WAL mode, so recent changes live in the -wal file
    rather than the main .sqlite.  We must copy all three files so that
    SQLite can replay the WAL when it opens our private copy.
    """
    if not os.path.exists(db_path):
        print(f"ERROR: Database not found: {db_path}", file=sys.stderr)
        sys.exit(1)

    tmp = tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False)
    tmp.close()
    shutil.copy2(db_path, tmp.name)

    # Copy the WAL and SHM files if they exist so SQLite sees recent data
    for suffix in ("-wal", "-shm"):
        src = db_path + suffix
        if os.path.exists(src):
            shutil.copy2(src, tmp.name + suffix)

    conn = sqlite3.connect(tmp.name)
    conn.row_factory = sqlite3.Row
    return conn, tmp.name


def _close_db(conn, tmp_path):
    """Close connection and clean up temp file (+ WAL/SHM copies)."""
    conn.close()
    for suffix in ("", "-wal", "-shm"):
        try:
            os.unlink(tmp_path + suffix)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Thunderbird prefs.js parser (for calendar names)
# ---------------------------------------------------------------------------


def _read_calendar_names_from_prefs(db_path):
    """Try to read calendar names from Thunderbird's prefs.js."""
    # Navigate from cache.sqlite up to the profile dir
    profile_dir = os.path.dirname(os.path.dirname(db_path))
    prefs_path = os.path.join(profile_dir, "prefs.js")
    names = {}
    if not os.path.exists(prefs_path):
        return names
    try:
        with open(prefs_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                # user_pref("calendar.registry.UUID.name", "Calendar Name");
                if "calendar.registry." in line and ".name" in line:
                    parts = line.split('"')
                    if len(parts) >= 4:
                        key = parts[1]  # calendar.registry.UUID.name
                        value = parts[3]  # Calendar Name
                        # Extract UUID from key
                        segments = key.split(".")
                        if len(segments) >= 4:
                            cal_uuid = segments[2]
                            names[cal_uuid] = value
    except OSError:
        pass
    return names


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

# Thunderbird stores timestamps as microseconds since Unix epoch
US_PER_SEC = 1_000_000


def _ts_to_us(dt):
    """Convert a datetime to Thunderbird microsecond timestamp."""
    return int(dt.timestamp() * US_PER_SEC)


def _us_to_dt(us, tz_str, local_tz):
    """Convert Thunderbird microsecond timestamp + tz string to a local datetime."""
    utc_dt = datetime.fromtimestamp(us / US_PER_SEC, tz=timezone.utc)
    if tz_str and tz_str != "floating":
        try:
            event_tz = ZoneInfo(tz_str)
            return utc_dt.astimezone(event_tz)
        except (KeyError, ValueError):
            pass
    return utc_dt.astimezone(local_tz)


def _format_time(dt):
    """Format time as HH:MM."""
    return dt.strftime("%H:%M")


def _format_date(dt):
    """Format date as YYYY-MM-DD (Weekday)."""
    return dt.strftime("%Y-%m-%d (%a)")


def _is_all_day(row):
    """Check if event is an all-day event."""
    return (
        row["event_start_tz"] == "floating"
        and (row["event_end"] - row["event_start"]) % (86400 * US_PER_SEC) == 0
    )


def _get_event_properties(conn, cal_id, event_id):
    """Get properties (LOCATION, DESCRIPTION, etc.) for an event."""
    cursor = conn.execute(
        "SELECT key, value FROM cal_properties WHERE cal_id = ? AND item_id = ?",
        (cal_id, event_id),
    )
    props = {}
    for row in cursor:
        props[row["key"]] = row["value"]
    return props


def _query_events(conn, cal_id, start_us, end_us):
    """Query events in a time range."""
    cursor = conn.execute(
        """
        SELECT * FROM cal_events
        WHERE cal_id = ?
          AND event_start < ?
          AND event_end > ?
        ORDER BY event_start ASC
        """,
        (cal_id, end_us, start_us),
    )
    return cursor.fetchall()


def _print_events(events, conn, cal_id, local_tz, show_date=True):
    """Pretty-print a list of events."""
    if not events:
        print("  No events found.")
        return

    current_date = None
    for ev in events:
        start_dt = _us_to_dt(ev["event_start"], ev["event_start_tz"], local_tz)
        end_dt = _us_to_dt(ev["event_end"], ev["event_end_tz"], local_tz)
        props = _get_event_properties(conn, cal_id, ev["id"])
        all_day = _is_all_day(ev)

        if show_date:
            date_str = _format_date(start_dt)
            if date_str != current_date:
                current_date = date_str
                print(f"\n  {date_str}")
                print("  " + "-" * len(date_str))

        if all_day:
            days = (ev["event_end"] - ev["event_start"]) // (86400 * US_PER_SEC)
            if days > 1:
                end_display = _format_date(end_dt - timedelta(days=1))
                print(f"    [all day -> {end_display}]  {ev['title']}")
            else:
                print(f"    [all day]  {ev['title']}")
        else:
            duration = end_dt - start_dt
            hours, remainder = divmod(int(duration.total_seconds()), 3600)
            minutes = remainder // 60
            dur_str = f"{hours}h{minutes:02d}" if hours else f"{minutes}min"
            print(
                f"    {_format_time(start_dt)}-{_format_time(end_dt)} ({dur_str})  {ev['title']}"
            )

        if props.get("LOCATION"):
            loc = props["LOCATION"]
            if len(loc) > 80:
                loc = loc[:77] + "..."
            print(f"      Location: {loc}")

        if props.get("DESCRIPTION"):
            desc = props["DESCRIPTION"].strip()
            if desc:
                # Show first 2 lines of description
                lines = desc.splitlines()[:2]
                for line in lines:
                    if len(line) > 80:
                        line = line[:77] + "..."
                    print(f"      {line}")

    print()


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------


def cmd_today(args):
    config = _get_config()
    local_tz = ZoneInfo(config["timezone"])
    now = datetime.now(local_tz)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)

    conn, tmp = _open_db(config["db"])
    try:
        events = _query_events(
            conn, config["calendar_id"], _ts_to_us(start), _ts_to_us(end)
        )
        print(f"Today - {_format_date(start)}")
        _print_events(events, conn, config["calendar_id"], local_tz, show_date=False)
    finally:
        _close_db(conn, tmp)


def cmd_tomorrow(args):
    config = _get_config()
    local_tz = ZoneInfo(config["timezone"])
    now = datetime.now(local_tz)
    start = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)

    conn, tmp = _open_db(config["db"])
    try:
        events = _query_events(
            conn, config["calendar_id"], _ts_to_us(start), _ts_to_us(end)
        )
        print(f"Tomorrow - {_format_date(start)}")
        _print_events(events, conn, config["calendar_id"], local_tz, show_date=False)
    finally:
        _close_db(conn, tmp)


def cmd_week(args):
    config = _get_config()
    local_tz = ZoneInfo(config["timezone"])
    now = datetime.now(local_tz)
    # Monday of current week
    start = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    end = start + timedelta(days=7)

    conn, tmp = _open_db(config["db"])
    try:
        events = _query_events(
            conn, config["calendar_id"], _ts_to_us(start), _ts_to_us(end)
        )
        print(
            f"This week: {start.strftime('%Y-%m-%d')} to {(end - timedelta(days=1)).strftime('%Y-%m-%d')}"
        )
        _print_events(events, conn, config["calendar_id"], local_tz)
    finally:
        _close_db(conn, tmp)


def cmd_upcoming(args):
    config = _get_config()
    local_tz = ZoneInfo(config["timezone"])
    now = datetime.now(local_tz)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=args.days)

    conn, tmp = _open_db(config["db"])
    try:
        events = _query_events(
            conn, config["calendar_id"], _ts_to_us(start), _ts_to_us(end)
        )
        print(f"Next {args.days} days")
        _print_events(events, conn, config["calendar_id"], local_tz)
    finally:
        _close_db(conn, tmp)


def cmd_range(args):
    config = _get_config()
    local_tz = ZoneInfo(config["timezone"])

    start = datetime.strptime(getattr(args, "from"), "%Y-%m-%d").replace(
        tzinfo=local_tz
    )
    end = datetime.strptime(args.to, "%Y-%m-%d").replace(tzinfo=local_tz) + timedelta(
        days=1
    )

    conn, tmp = _open_db(config["db"])
    try:
        events = _query_events(
            conn, config["calendar_id"], _ts_to_us(start), _ts_to_us(end)
        )
        print(f"Events from {getattr(args, 'from')} to {args.to}")
        _print_events(events, conn, config["calendar_id"], local_tz)
    finally:
        _close_db(conn, tmp)


def cmd_search(args):
    config = _get_config()
    local_tz = ZoneInfo(config["timezone"])
    query = args.query.lower()

    conn, tmp = _open_db(config["db"])
    try:
        # Search in titles
        cursor = conn.execute(
            """
            SELECT DISTINCT e.* FROM cal_events e
            WHERE e.cal_id = ?
              AND LOWER(e.title) LIKE ?
            ORDER BY e.event_start DESC
            LIMIT 50
            """,
            (config["calendar_id"], f"%{query}%"),
        )
        title_matches = cursor.fetchall()

        # Search in properties (LOCATION, DESCRIPTION)
        cursor = conn.execute(
            """
            SELECT DISTINCT e.* FROM cal_events e
            JOIN cal_properties p ON e.id = p.item_id AND e.cal_id = p.cal_id
            WHERE e.cal_id = ?
              AND p.key IN ('LOCATION', 'DESCRIPTION')
              AND LOWER(p.value) LIKE ?
            ORDER BY e.event_start DESC
            LIMIT 50
            """,
            (config["calendar_id"], f"%{query}%"),
        )
        prop_matches = cursor.fetchall()

        # Merge and deduplicate, preserving order
        seen_ids = set()
        all_events = []
        for ev in title_matches + prop_matches:
            if ev["id"] not in seen_ids:
                seen_ids.add(ev["id"])
                all_events.append(ev)

        # Sort by start time descending
        all_events.sort(key=lambda e: e["event_start"], reverse=True)
        all_events = all_events[:50]

        print(f'Search results for "{args.query}" ({len(all_events)} found)')
        _print_events(all_events, conn, config["calendar_id"], local_tz)
    finally:
        _close_db(conn, tmp)


def cmd_free(args):
    config = _get_config()
    local_tz = ZoneInfo(config["timezone"])

    date = datetime.strptime(args.date, "%Y-%m-%d").replace(tzinfo=local_tz)

    # Parse work hours
    start_h, start_m = map(int, args.start.split(":"))
    end_h, end_m = map(int, args.end.split(":"))
    day_start = date.replace(hour=start_h, minute=start_m)
    day_end = date.replace(hour=end_h, minute=end_m)

    conn, tmp = _open_db(config["db"])
    try:
        events = _query_events(
            conn, config["calendar_id"], _ts_to_us(day_start), _ts_to_us(day_end)
        )

        # Build list of busy intervals (exclude all-day events)
        busy = []
        for ev in events:
            if _is_all_day(ev):
                continue
            ev_start = _us_to_dt(ev["event_start"], ev["event_start_tz"], local_tz)
            ev_end = _us_to_dt(ev["event_end"], ev["event_end_tz"], local_tz)
            # Clamp to work hours
            ev_start = max(ev_start, day_start)
            ev_end = min(ev_end, day_end)
            if ev_start < ev_end:
                busy.append((ev_start, ev_end, ev["title"]))

        # Sort busy intervals
        busy.sort(key=lambda x: x[0])

        # Find free slots
        free_slots = []
        cursor = day_start
        for b_start, b_end, _ in busy:
            if cursor < b_start:
                free_slots.append((cursor, b_start))
            cursor = max(cursor, b_end)
        if cursor < day_end:
            free_slots.append((cursor, day_end))

        print(f"Free slots on {_format_date(date)} ({args.start}-{args.end})")
        print()

        if busy:
            print("  Busy:")
            for b_start, b_end, title in busy:
                print(f"    {_format_time(b_start)}-{_format_time(b_end)}  {title}")
            print()

        if free_slots:
            print("  Free:")
            for f_start, f_end in free_slots:
                duration = f_end - f_start
                hours, remainder = divmod(int(duration.total_seconds()), 3600)
                minutes = remainder // 60
                dur_str = f"{hours}h{minutes:02d}" if hours else f"{minutes}min"
                print(f"    {_format_time(f_start)}-{_format_time(f_end)} ({dur_str})")
        else:
            print("  No free slots in this window.")
        print()
    finally:
        _close_db(conn, tmp)


def cmd_list_calendars(args):
    """List available calendars. Works without full config (needs --db or auto-discover)."""
    db_path = args.db

    if not db_path:
        # Try to get from config
        config = _load_config()
        db_path = config.get("db")

    if not db_path:
        # Auto-discover
        pattern = os.path.expanduser("~/.thunderbird/*/calendar-data/cache.sqlite")
        matches = glob.glob(pattern)
        if not matches:
            print("ERROR: No Thunderbird calendar databases found.", file=sys.stderr)
            print(f"  Searched: {pattern}", file=sys.stderr)
            sys.exit(1)
        if len(matches) > 1:
            print("Multiple profiles found. Use --db to specify:", file=sys.stderr)
            for m in matches:
                print(f"  {m}", file=sys.stderr)
            sys.exit(1)
        db_path = matches[0]
    else:
        db_path = os.path.expanduser(db_path)

    # Read calendar names from prefs.js
    cal_names = _read_calendar_names_from_prefs(db_path)

    conn, tmp = _open_db(db_path)
    try:
        cursor = conn.execute(
            """
            SELECT cal_id,
                   COUNT(*) as event_count,
                   MIN(event_start) as earliest,
                   MAX(event_start) as latest
            FROM cal_events
            GROUP BY cal_id
            ORDER BY event_count DESC
            """
        )

        print(f"Database: {db_path}")
        print()
        print("Calendars found:")
        print()
        for row in cursor:
            cal_id = row["cal_id"]
            name = cal_names.get(cal_id, "(unknown)")
            earliest = datetime.fromtimestamp(
                row["earliest"] / US_PER_SEC, tz=timezone.utc
            )
            latest = datetime.fromtimestamp(row["latest"] / US_PER_SEC, tz=timezone.utc)

            # Get sample titles
            sample = conn.execute(
                """
                SELECT title FROM cal_events
                WHERE cal_id = ?
                  AND event_start_tz != 'floating'
                ORDER BY event_start DESC
                LIMIT 3
                """,
                (cal_id,),
            ).fetchall()

            print(f"  ID: {cal_id}")
            print(f"  Name: {name}")
            print(f"  Events: {row['event_count']}")
            print(
                f"  Range: {earliest.strftime('%Y-%m-%d')} to {latest.strftime('%Y-%m-%d')}"
            )
            if sample:
                titles = [s["title"] for s in sample]
                print(f"  Sample: {', '.join(titles)}")
            print()
    finally:
        _close_db(conn, tmp)


def cmd_ics(args):
    """Generate an .ics file for import."""
    config = _get_config()
    local_tz = ZoneInfo(config["timezone"])

    start = datetime.strptime(args.start, "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)
    end = datetime.strptime(args.end, "%Y-%m-%d %H:%M").replace(tzinfo=local_tz)

    uid = str(uuid.uuid4())
    now_utc = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    start_utc = start.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    end_utc = end.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//thunderbird-calendar-skill//EN",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{now_utc}",
        f"DTSTART:{start_utc}",
        f"DTEND:{end_utc}",
        f"SUMMARY:{args.title}",
    ]

    if args.location:
        lines.append(f"LOCATION:{args.location}")
    if args.description:
        lines.append(f"DESCRIPTION:{args.description}")

    lines += [
        "END:VEVENT",
        "END:VCALENDAR",
    ]

    ics_content = "\r\n".join(lines) + "\r\n"

    if args.output:
        output_path = os.path.expanduser(args.output)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(ics_content)
        print(f"ICS file written to: {output_path}")
    else:
        # Write to /tmp with a sensible name
        safe_title = "".join(c if c.isalnum() or c in " -_" else "" for c in args.title)
        safe_title = safe_title.strip().replace(" ", "_")[:50]
        output_path = os.path.expanduser(f"~/Desktop/{safe_title}.ics")
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(ics_content)
        print(f"ICS file written to: {output_path}")

    print("Import this file into Thunderbird or Google Calendar.")


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------


def main():
    parser = argparse.ArgumentParser(
        description="Read-only Thunderbird calendar viewer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            examples:
              cal.py today
              cal.py upcoming --days 14
              cal.py search "dentist"
              cal.py free --date 2026-03-01
              cal.py ics "Meeting" --start "2026-03-01 10:00" --end "2026-03-01 11:00"
              cal.py list-calendars
        """),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # today
    subparsers.add_parser("today", help="Show today's events")

    # tomorrow
    subparsers.add_parser("tomorrow", help="Show tomorrow's events")

    # week
    subparsers.add_parser("week", help="Show this week's events (Mon-Sun)")

    # upcoming
    p_upcoming = subparsers.add_parser("upcoming", help="Show upcoming events")
    p_upcoming.add_argument(
        "--days", type=int, default=7, help="Number of days ahead (default: 7)"
    )

    # range
    p_range = subparsers.add_parser("range", help="Show events in a date range")
    p_range.add_argument("--from", required=True, help="Start date (YYYY-MM-DD)")
    p_range.add_argument("--to", required=True, help="End date (YYYY-MM-DD)")

    # search
    p_search = subparsers.add_parser(
        "search", help="Search events by title/location/description"
    )
    p_search.add_argument("query", help="Search query")

    # free
    p_free = subparsers.add_parser("free", help="Find free slots on a day")
    p_free.add_argument("--date", required=True, help="Date (YYYY-MM-DD)")
    p_free.add_argument(
        "--start", default="09:00", help="Work day start (HH:MM, default: 09:00)"
    )
    p_free.add_argument(
        "--end", default="18:00", help="Work day end (HH:MM, default: 18:00)"
    )

    # list-calendars
    p_list = subparsers.add_parser(
        "list-calendars", help="List available calendars (setup helper)"
    )
    p_list.add_argument("--db", help="Path to cache.sqlite (auto-discovers if omitted)")

    # ics
    p_ics = subparsers.add_parser("ics", help="Generate an .ics file for import")
    p_ics.add_argument("title", help="Event title")
    p_ics.add_argument(
        "--start", required=True, help='Start datetime ("YYYY-MM-DD HH:MM")'
    )
    p_ics.add_argument("--end", required=True, help='End datetime ("YYYY-MM-DD HH:MM")')
    p_ics.add_argument("--location", help="Event location")
    p_ics.add_argument("--description", help="Event description")
    p_ics.add_argument(
        "--output", help="Output file path (default: ~/Desktop/<title>.ics)"
    )

    args = parser.parse_args()

    commands = {
        "today": cmd_today,
        "tomorrow": cmd_tomorrow,
        "week": cmd_week,
        "upcoming": cmd_upcoming,
        "range": cmd_range,
        "search": cmd_search,
        "free": cmd_free,
        "list-calendars": cmd_list_calendars,
        "ics": cmd_ics,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
