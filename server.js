import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import { createDAVClient, DAVNamespace } from 'tsdav';
import { fetch as undiciFetch } from 'undici';

const app = express();
app.use(morgan('tiny'));
app.use(express.json());

const PORT = process.env.PORT || 8787;
const API_KEY = process.env.BRIDGE_API_KEY;
const USERNAME = process.env.ICLOUD_USERNAME;
const PASSWORD = process.env.ICLOUD_APP_PASSWORD;
const SERVER_URL = process.env.ICLOUD_CALDAV_SERVER || 'https://caldav.icloud.com';

if (!API_KEY || !USERNAME || !PASSWORD) {
  console.error('Missing env: BRIDGE_API_KEY, ICLOUD_USERNAME, ICLOUD_APP_PASSWORD');
  process.exit(1);
}

async function getClient() {
  const client = await createDAVClient({
    serverUrl: SERVER_URL,
    credentials: { username: USERNAME, password: PASSWORD },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
    fetch: undiciFetch,
    headers: { 'User-Agent': 'icloud-caldav-bridge/1.0' },
  });
  await client.login();
  return client;
}

async function chooseCalendar(client) {
  const calendars = await client.fetchCalendars({
    props: [
      { name: 'displayname', namespace: DAVNamespace.DAV },
      { name: 'calendar-color' },
    ],
  });
  if (!Array.isArray(calendars) || calendars.length === 0) {
    throw new Error('No calendars found on iCloud account');
  }
  const primary =
    calendars.find(c => /home|default|icloud|calendar/i.test(c.displayName || '')) ||
    calendars[0];
  return primary;
}

// Build minimal iCalendar VEVENT (UTC times)
function vevent({ summary, description, location, start, end }) {
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) {
    throw new Error('Invalid start or end datetime; must be ISO8601');
  }
  const toUTC = d =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); // YYYYMMDDTHHMMSSZ

  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@icloud-caldav-bridge`;
  const dtStamp = toUTC(new Date());
  const dtStart = toUTC(s);
  const dtEnd = toUTC(e);

  const esc = (x = '') =>
    String(x).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => `\\${m}`);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//icloud-caldav-bridge//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${esc(summary)}`,
    description ? `DESCRIPTION:${esc(description)}` : null,
    location ? `LOCATION:${esc(location)}` : null,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\n');
}

// header auth
app.use((req, res, next) => {
  if (req.get('x-bridge-key') !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// health
app.get('/health', (_req, res) => res.json({ ok: true }));

// create event
app.post('/events', async (req, res) => {
  try {
    const { summary, description, location, start, end } = req.body || {};
    if (!summary || !start || !end) {
      return res.status(400).json({ error: 'summary, start, end are required (ISO8601)' });
    }
    const client = await getClient();
    const calendar = await chooseCalendar(client);
    const iCalString = vevent({ summary, description, location, start, end });
    const filename = `gpt-${Date.now()}.ics`;

    await client.createCalendarObject({
      calendar,
      filename,
      iCalString,
    });

    return res.status(201).json({ ok: true, filename });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ error: 'CalDAV error', detail: String(err?.message || err) });
  }
});

app.listen(PORT, () => {
  console.log(`iCloud CalDAV Bridge running on :${PORT}`);
});
