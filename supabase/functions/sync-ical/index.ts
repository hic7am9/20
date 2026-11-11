import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SyncConflict {
  apartment_id: string;
  apartment_name: string;
  airbnb_check_in: string;
  airbnb_check_out: string;
  manual_guest_name: string;
  manual_check_in: string;
  manual_check_out: string;
}

interface SyncResult {
  apartment_id: string;
  apartment_name: string;
  imported: number;
  updated: number;
  removed: number;
  conflicts: SyncConflict[];
  error?: string;
}

interface ICalEvent {
  uid: string;
  summary: string;
  start: string;
  end: string;
  description: string;
}

function parseICal(text: string): ICalEvent[] {
  // Unfold iCal line continuations (lines starting with space/tab are continuations)
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const events: ICalEvent[] = [];
  const lines = unfolded.split(/\r?\n/);
  let current: Partial<ICalEvent> | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT") {
      if (current?.uid && current?.start && current?.end) {
        events.push(current as ICalEvent);
      }
      current = null;
    } else if (current) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).split(";")[0].toUpperCase();
      const value = line.slice(colonIdx + 1);

      if (key === "UID") current.uid = value;
      else if (key === "SUMMARY") current.summary = value;
      else if (key === "DESCRIPTION") current.description = value;
      else if (key === "DTSTART") current.start = parseICalDate(value);
      else if (key === "DTEND") current.end = parseICalDate(value);
    }
  }
  return events;
}

function parseICalDate(value: string): string {
  // Handle both basic (20260101) and extended (2026-01-01) formats
  const match = value.match(/(\d{4})(\d{2})(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  // Already ISO-ish
  return value.split("T")[0];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Get all apartments with an iCal URL
    const { data: apartments, error: aptError } = await supabase
      .from("apartments")
      .select("id, name, ical_url")
      .not("ical_url", "is", null);

    if (aptError) throw new Error(`Failed to fetch apartments: ${aptError.message}`);

    const results: SyncResult[] = [];

    for (const apt of apartments ?? []) {
      const result: SyncResult = {
        apartment_id: apt.id,
        apartment_name: apt.name,
        imported: 0,
        updated: 0,
        removed: 0,
        conflicts: [],
      };

      try {
        if (!apt.ical_url) {
          results.push(result);
          continue;
        }

        const response = await fetch(apt.ical_url, {
          headers: { "User-Agent": "PropertyManagementSync/1.0" },
        });

        if (!response.ok) {
          result.error = `HTTP ${response.status} from Airbnb`;
          results.push(result);
          continue;
        }

        const icalText = await response.text();
        const events = parseICal(icalText);

        // Get ALL existing bookings for this apartment (synced + manual) to detect overlaps
        const { data: allBookings, error: allErr } = await supabase
          .from("bookings")
          .select("id, external_uid, check_in, check_out, archived, guest_name")
          .eq("apartment_id", apt.id);

        if (allErr) throw new Error(`Failed to fetch existing bookings: ${allErr.message}`);

        const existingMap = new Map<string, { id: string; check_in: string; check_out: string; archived: boolean }>();
        for (const b of allBookings ?? []) {
          if (b.external_uid) existingMap.set(b.external_uid, b);
        }

        // Build a list of date ranges for non-archived manual bookings (no external_uid)
        const manualRanges = (allBookings ?? [])
          .filter((b) => !b.external_uid && !b.archived)
          .map((b) => ({ check_in: b.check_in, check_out: b.check_out, guest_name: b.guest_name }));

        const seenUids = new Set<string>();
        const today = new Date().toISOString().split("T")[0];

        for (const event of events) {
          seenUids.add(event.uid);
          const existingBooking = existingMap.get(event.uid);

          if (existingBooking) {
            // Update if dates changed
            if (existingBooking.check_in !== event.start || existingBooking.check_out !== event.end) {
              const { error: updateErr } = await supabase
                .from("bookings")
                .update({
                  check_in: event.start,
                  check_out: event.end,
                })
                .eq("id", existingBooking.id);
              if (updateErr) {
                console.error(`Update failed for ${event.uid}:`, updateErr.message);
              } else {
                result.updated++;
              }
            }

            // Check for conflict with manual bookings even if already imported
            // This catches the case where a manual booking was added that overlaps
            // with an archived Airbnb booking
            if (existingBooking.archived) {
              const conflictRange = manualRanges.find(
                (r) => event.start < r.check_out && event.end > r.check_in
              );
              if (conflictRange) {
                result.conflicts.push({
                  apartment_id: apt.id,
                  apartment_name: apt.name,
                  airbnb_check_in: event.start,
                  airbnb_check_out: event.end,
                  manual_guest_name: conflictRange.guest_name,
                  manual_check_in: conflictRange.check_in,
                  manual_check_out: conflictRange.check_out,
                });
              }
            }
          } else {
            // Only import future or active bookings (check_out >= today)
            if (event.end < today) continue;

            // Check for overlap with existing manual bookings — record conflict and skip
            const conflictRange = manualRanges.find(
              (r) => event.start < r.check_out && event.end > r.check_in
            );
            if (conflictRange) {
              result.conflicts.push({
                apartment_id: apt.id,
                apartment_name: apt.name,
                airbnb_check_in: event.start,
                airbnb_check_out: event.end,
                manual_guest_name: conflictRange.guest_name,
                manual_check_in: conflictRange.check_in,
                manual_check_out: conflictRange.check_out,
              });
              continue;
            }

            // Airbnb SUMMARY is typically just "Reserved" or "Airbnb (Not available)"
            // Guest name is not available in iCal; use reservation code from DESCRIPTION if present
            const summary = event.summary || "";
            let guestName = "Airbnb";
            let guestNotes: string | null = null;

            if (/Not available|Blocked|Unavailable/i.test(summary)) {
              guestName = "محجوز - Airbnb";
            } else if (/Reserved/i.test(summary)) {
              // Try to extract reservation code from DESCRIPTION
              const desc = event.description || "";
              const codeMatch = desc.match(/reservations\/details\/([A-Z0-9]+)/i);
              if (codeMatch) {
                guestName = `Airbnb (${codeMatch[1]})`;
              }
              // Extract last 4 digits of phone number
              const phoneMatch = desc.match(/Phone Number \(Last 4 Digits\):\s*(\d+)/i);
              if (phoneMatch) {
                guestNotes = `آخر 4 أرقام: ${phoneMatch[1]}`;
              }
            }

            const { error: insertErr } = await supabase
              .from("bookings")
              .insert({
                apartment_id: apt.id,
                guest_name: guestName,
                guest_phone: null,
                guest_email: null,
                source: "airbnb",
                check_in: event.start,
                check_out: event.end,
                total_price: null,
                balance: 0,
                paid: false,
                payment_method: null,
                notes: guestNotes,
                archived: false,
                external_uid: event.uid,
                sync_source: "airbnb_ical",
              });

            if (insertErr) {
              console.error(`Insert failed for ${event.uid}:`, insertErr.message);
            } else {
              result.imported++;
            }
          }
        }

        // Remove bookings that are no longer in the iCal feed (cancelled on Airbnb)
        // Only remove future unarchived bookings, never touch past/archived ones
        for (const [uid, booking] of existingMap) {
          if (!seenUids.has(uid) && !booking.archived && booking.check_out >= today) {
            const { error: delErr } = await supabase
              .from("bookings")
              .delete()
              .eq("id", booking.id);
            if (delErr) {
              console.error(`Delete failed for ${uid}:`, delErr.message);
            } else {
              result.removed++;
            }
          }
        }

        // Update ical_sync last_synced timestamp
        await supabase
          .from("ical_sync")
          .upsert({
            apartment_id: apt.id,
            url: apt.ical_url,
            direction: "import",
            last_synced: new Date().toISOString(),
          }, { onConflict: "apartment_id,url" });

        // After sync, update apartment statuses: set 'occupied' if a booking covers today
        await updateApartmentStatus(supabase, apt.id, today);
      } catch (err) {
        result.error = err instanceof Error ? err.message : "Unknown error";
      }
      results.push(result);
    }

    const totalImported = results.reduce((s, r) => s + r.imported, 0);
    const totalUpdated = results.reduce((s, r) => s + r.updated, 0);
    const totalRemoved = results.reduce((s, r) => s + r.removed, 0);
    const allConflicts = results.flatMap((r) => r.conflicts);
    const errors = results.filter((r) => r.error);

    let message = `تمت المزامنة بنجاح: ${totalImported} حجز جديد، ${totalUpdated} تحديث، ${totalRemoved} ملغي`;
    if (allConflicts.length > 0) {
      message += `، ${allConflicts.length} تعارض`;
    }
    if (errors.length > 0) {
      message = `تمت المزامنة مع ${errors.length} خطأ`;
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        synced: results.length,
        imported: totalImported,
        updated: totalUpdated,
        removed: totalRemoved,
        conflicts: allConflicts,
        results,
        message,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function updateApartmentStatus(
  supabase: ReturnType<typeof createClient>,
  apartmentId: string,
  today: string
): Promise<void> {
  // Find if there's an active booking covering today
  const { data: activeBooking } = await supabase
    .from("bookings")
    .select("id")
    .eq("apartment_id", apartmentId)
    .eq("archived", false)
    .lte("check_in", today)
    .gte("check_out", today)
    .maybeSingle();

  if (activeBooking) {
    await supabase
      .from("apartments")
      .update({ status: "occupied", current_booking_id: activeBooking.id })
      .eq("id", apartmentId);
  } else {
    // Find the next upcoming booking
    const { data: nextBooking } = await supabase
      .from("bookings")
      .select("id")
      .eq("apartment_id", apartmentId)
      .eq("archived", false)
      .gt("check_in", today)
      .order("check_in", { ascending: true })
      .limit(1)
      .maybeSingle();

    // Only set to ready if currently occupied (don't override maintenance/not_ready set manually)
    const { data: apt } = await supabase
      .from("apartments")
      .select("status")
      .eq("id", apartmentId)
      .maybeSingle();

    if (apt?.status === "occupied") {
      await supabase
        .from("apartments")
        .update({ status: "ready", current_booking_id: null })
        .eq("id", apartmentId);
    }
  }
}
