import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import { createDAVClient, DAVNamespace } from 'tsdav';
import { fetch as undiciFetch } from 'undici';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tz from 'dayjs/plugin/timezone.js';
dayjs.extend(utc); dayjs.extend(tz);

const app = express();
app.use(morgan('tiny'));
app.use(express.json());

const PORT = process.env.PORT || 8787;
const API_KEY = process.env.BRIDGE_API_KEY;
const USERNAME = process.env.ICLOUD_USERNAME;
const PASSWORD = process.env.ICLOUD_APP_PASSWORD;
const SERVER_URL = process.env.ICLOUD_CALDAV_SERVER || 'https://caldav.icloud.com';
const DEFAULT_TZ = process.env.DEFAULT_TZ || 'America/New_York';

if (!API_KEY || !USERNAME || !PASSWORD) {
  console.error('Missing required env vars: BRIDGE_API_KEY, ICLOUD_USERNAME, ICLOUD_APP_PASSWORD');
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

async function ensureCalendarHome(client) {
  const calendars = await client.fetchCalendars({
    props: [
      { name: 'displayname', namespace: DAVNamespace.DAV },
      { name: 'calendar-color' },
    ],
  });
  if (!calendars?.length) throw new Error('No calendars found on iCloud account');
  const primary = calendars.find(c => /home|default|icloud/i.test(c.displayName)) || calendars[0];
  return primary;
}

function vevent({ summary, description, location, start, end, timezone }) {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@icloud-caldav-bridge`;
  const dtStart = dayjs(start).tz(timezone || DEFAULT_TZ).format('YYYYMMDD[T]HHmmss');
  const dtEnd = day
