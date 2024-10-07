import { getProp, addProp } from "@/props";

type Calendar = GoogleAppsScript.Calendar.Schema.Calendar;
type Events = GoogleAppsScript.Calendar.Schema.Events;
type Event = GoogleAppsScript.Calendar.Schema.Event;

export function sync(trigger: { calendarId: string }) {
  const lock = LockService.getUserLock();
  lock.waitLock(3000);
  const calendarId = trigger.calendarId;
  const calendars = Calendar.CalendarList!.list().items!;
  const primaryId = calendars!.filter((v) => v.primary)[0]?.id;
  if (calendarId === primaryId) {
    const nextSyncTokens = getProp("nextSyncTokens") || {};
    const syncToken = nextSyncTokens[calendarId];
    if (!syncToken) {
      init();
    }
    const diffEvents = Calendar.Events!.list(calendarId, { syncToken });

    for (let diffEvent of diffEvents!.items!) {
      if (diffEvent.status === "cancelled") {
        diffEvent = Calendar.Events!.get(calendarId, diffEvent.id!);
      }
      console.log(`diffEvent: ${JSON.stringify(diffEvent)}`);
      for (const targetCalendar of calendars) {
        try {
          duplicateEvent(diffEvent, targetCalendar);
        } catch (err) {
          console.log(err);
        }
      }
    }

    addProp("nextSyncTokens", { [calendarId]: diffEvents.nextSyncToken });
  }
  lock.releaseLock();
}

function duplicateEvent(diffEvent: Event, targetCalendar: Calendar) {
  if (!checkSync(targetCalendar)) {
    return;
  }
  const eventIdMap = getProp("eventIdMap") || {};
  const targets = eventIdMap[diffEvent.id!] || {};
  const targetEventId = targets[targetCalendar.id!] as string | undefined;
  if (diffEvent.status === "cancelled") {
    if (targetEventId) {
      Calendar.Events!.remove(targetCalendar!.id!, targetEventId);
    }
  } else {
    // 公開範囲は更新しないようにする
    const updateKeys = [
      "summary",
      "start",
      "end",
      "description",
      "location",
      "transparency",
      "recurrence",
    ];
    if (targetEventId) {
      const event = Calendar.Events!.get(targetCalendar.id!, targetEventId);
      // デフォルト値（指定なし）に書き換えるケースがある
      const updated = updateEvent(event, diffEvent, updateKeys);
      Calendar.Events!.update(updated, targetCalendar.id!, targetEventId);
      console.log(`update: ${JSON.stringify(updated)}`);
    } else {
      updateKeys.push("visibility");
      const updated = updateEvent({}, diffEvent, updateKeys);
      const event = Calendar.Events!.insert(updated, targetCalendar.id!);
      addProp("eventIdMap", {
        [diffEvent.id!]: { ...targets, [targetCalendar.id!]: event.id! },
      });
      console.log(`insert: ${JSON.stringify(event)}`);
    }
  }
}

function updateEvent(base: Object, update: Object, keys: string[]): Object {
  const newEvent = { ...base };
  for (const key of keys) {
    delete newEvent[key];
    if (update[key] !== undefined) {
      newEvent[key] = update[key];
    }
  }
  return newEvent;
}

function checkSync(calendar: Calendar) {
  const description = calendar.description;
  return typeof description === "string" && description.startsWith("自動同期");
}

function processAllEvents(
  calendarId: string,
  f: (es: Events) => any,
  options: Object,
) {
  let pageToken = undefined;
  for (let i = 0; i < 1000; i++) {
    console.log(`page ${i + 1}`);
    const events = Calendar.Events!.list(calendarId, {
      ...options,
      pageToken,
    }) as Events;
    f(events);
    pageToken = events.nextPageToken;
    if (!pageToken) {
      return events.nextSyncToken || null;
    }
  }
  return null;
}
function cleanup(calendar: Calendar, options: Object) {
  if (!checkSync(calendar)) {
    return;
  }
  function f(events: Events) {
    for (const event of events.items!) {
      Calendar.Events!.remove(calendar.id!, event.id!);
      console.log(`deleted ${JSON.stringify(event)}`);
    }
  }
  processAllEvents(calendar.id!, f, options);
}
export function init() {
  const props = PropertiesService.getUserProperties();
  props.deleteAllProperties();

  const calendars = Calendar.CalendarList!.list().items!;
  const primaryId = calendars.filter((v) => v.primary)[0].id!;
  for (const targetCalendar of calendars) {
    cleanup(targetCalendar, {});
  }
  function f(events: Events) {
    const dateTimeFilter = new Date(
      new Date().getTime() - 60 * 60 * 24 * 100 * 1000,
    ).getTime();
    for (const event of events.items!) {
      if (
        event.start &&
        new Date(event.start.date! || event.start.dateTime!).getTime() <
          dateTimeFilter
      ) {
        continue;
      }
      for (const targetCalendar of calendars) {
        duplicateEvent(event, targetCalendar);
      }
    }
  }
  const nextSyncToken = processAllEvents(primaryId, f, {});
  if (nextSyncToken) {
    addProp("nextSyncTokens", { [primaryId]: nextSyncToken });
  }
}
