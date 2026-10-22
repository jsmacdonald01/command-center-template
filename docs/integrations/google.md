# Google Calendar and Gmail

**What it gives you:** your calendar on the Home page (and in the morning
brief), crossing off today's events, an email box, and — if you allow it —
the agent can add calendar events and write email drafts (never send).

**What it shares:** nothing leaves your computer except the normal
conversation between the app and Google. The sign-in is saved on your PC,
encrypted by Windows.

**Time:** about 20 minutes, once. This is the longest add-on, because Google
makes each app owner register their own "app" with them. You are making a
private one that only you will use.

---

## Part 1 — Make your Google "app" (in the Google Cloud website)

1. Go to **console.cloud.google.com** and sign in with the Google account
   whose calendar you want.
2. If asked, agree to the terms. At the top, click the project picker
   (it may say "Select a project") → **New project**. Name it
   `Command Center` → **Create**. Make sure it is selected at the top.
3. Turn on the two services. In the search bar at the top, type
   **Google Calendar API**, open it, click **Enable**. Do the same for
   **Gmail API**.
4. Set up the sign-in screen. Search **OAuth consent screen** (it may be
   called "Google Auth Platform"). Click **Get started**.
   - App name: `Command Center`. Support email: your email.
   - Audience: **External**.
   - Contact email: your email. Agree, then **Create**.
5. Add yourself as a tester. Find **Audience** → **Test users** →
   **Add users** → type your own Gmail address → **Save**.
6. Make the key. Go to **Clients** (or "Credentials") → **Create client**.
   - Application type: **Desktop app**. Name: `Command Center`.
   - Click **Create**, then **Download JSON**.

## Part 2 — Give the key to the app

1. Rename the downloaded file to exactly `google-oauth-client.json`.
2. Move it into this project's folder at
   `electron\services\google-oauth-client.json`.
   (It is already listed in `.gitignore`, so it will never be uploaded to
   GitHub. Keep it private — it is your app's key.)
3. Rebuild: `npm start` (or `npm run dist` and reinstall if you use the
   installed app).

## Part 3 — Connect

1. In the app, go to **Settings** → **Google**.
2. Click **Connect** next to Calendar. Your browser opens.
3. Choose your account. Google will warn **"Google hasn't verified this
   app"** — that is expected, because it is your own private app. Click
   **Advanced** → **Go to Command Center (unsafe)** → tick the boxes →
   **Continue**.
4. You should see "Connected" in Settings. Do the same for **Gmail**.

## Good to know

- **The sign-in expires every 7 days while the app is in "Testing".** To
  stop that, go back to the consent screen → **Audience** → **Publish app**.
  Google may ask for a home page and privacy policy link; a simple public
  page that says what the app does and that data stays on your PC is enough.
  You don't need Google's verification, because you are the only user.
- If the calendar box says "Nothing scheduled" but you have events, check
  Settings — "Not connected" means the sign-in expired. Click Connect again.
