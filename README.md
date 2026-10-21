# Live Golf Scoring

A web app for club competitions and golf days. Players score on their own phones from a personal link, and scores appear straight away on the live leaderboard and the clubhouse TV. It is built for multiple clubs, with an archive of past events.

- **Club admin:** club details, courses, list of events, archive, and inviting event admins.
- **Event admin:**
  - tournament name, logos and sponsors, format and rules
  - loading players (upload or by hand)
  - personal player links and QR codes
  - committee tools for disputes and official scores
- **Players:** open their personal link or QR code. They don't sign up or use a password. They enter their own score and mark the rest of their group, then sign their card.
- **Everyone:** live leaderboard, scorecards, and the clubhouse TV display.

Formats: Medal (net or gross), Individual Stableford, Betterball Stableford, 4-ball Alliance (1, 2, 3 or all scores count, with par-based or per-hole rules), American Scramble, and Scramble drive then own ball.

The app also handles:
- A/B/C divisions
- open, men, ladies, juniors or seniors fields
- countback: back 9, then odd stroke-index or odd-numbered holes, then lowest handicap

---

## How scores are checked

Every hole can hold three entries: the **player's**, the **marker's** (anyone else in the group), and the **committee's**.

| Entries | Shown as | Leaderboard uses |
|---|---|---|
| Player and marker agree | ✓ verified | that score |
| Only one of them | provisional | that score |
| They disagree | ! disputed, flagged on both phones and in Committee | the higher score, or nothing (your choice per event) |
| Committee score set | ★ official | the committee score |

Entries are stored separately and never overwrite each other. Every change is logged with who made it and when (Committee → Recent changes).

A player signs his card when all 18 holes are in and nothing is disputed. His marker then attests it. Both steps lock the card for players, and only an event admin can reopen it.

The database enforces who can write what, not just the app: a phone can only enter scores for its own player and that player's group, and only while the event is live.

---

## Set it up (about 30 minutes, once)

You need three free accounts: **GitHub** (where this code lives), **Supabase** (database) and **Netlify** (website).

### 1. Supabase: the database

1. Go to supabase.com and create a project. Pick the region closest to your players (e.g. *South Africa / Cape Town*, if offered, or *Frankfurt*). Save the database password somewhere safe.
2. Open **SQL Editor → New query**, paste the whole of `supabase/schema.sql` from this repo, and press **Run**. It should finish with "Success".
3. **Authentication → Sign In / Providers**:
   - Turn on **Allow anonymous sign-ins**. This is how players' phones sign in from their personal link.
   - Keep **Email** on. Organisers sign in with a link sent to their email.
   - Under **Authentication → Rate Limits**, raise the limit for **anonymous sign-ins** (default 30 per hour per IP address) to at least **500**. Many players on the clubhouse Wi-Fi share one IP address, and the default would lock most of them out.
4. **Authentication → URL Configuration**: set **Site URL** to your website address from step 2 (e.g. `https://seasons-scoring.netlify.app`). Add the same address followed by `/**` under **Redirect URLs**.
5. **Project Settings → API**: copy the **Project URL** and the **anon public** key. You'll need them in step 2.

> Plan: the free plan allows 200 phones connected live at once and pauses after a week of no use. For a 300-player day, upgrade the project to **Pro** (500 live connections included). You can downgrade again later.

### 2. Netlify: the website

1. Go to netlify.com → **Add new site → Import an existing project → GitHub**, and choose this repository.
2. The build settings are read from `netlify.toml` (build: `npm run build`, publish: `dist`).
3. Before deploying, open **Site configuration → Environment variables** and add:
   - `VITE_SUPABASE_URL`: the Project URL from Supabase
   - `VITE_SUPABASE_ANON_KEY`: the anon public key
4. Deploy. Optional: under **Domain management**, add your own address, such as `scores.seasonsgolf.co.za`. Then update the Site URL in Supabase to match.

Every change pushed to GitHub redeploys the site automatically.

### 3. First use

1. Open your site → **Organiser sign in** → enter your email → open the link you receive.
2. **Create your club** (e.g. Seasons Golf Club).
3. **Courses → Add Seasons Golf Course card.** Check the pars, stroke indexes, ratings and slopes against the club's current card and correct anything that's changed.
4. **Events → New event**: name it (e.g. *BMW Championship*), pick the date, course and format.
5. In the event:
   - **Setup:** check the rules, divisions, field and registration options.
   - **Logos & sponsors:** upload the company and sponsor logos.
   - **Players:** add players one by one, or import an Excel/CSV file. Use **Download template** to get the right columns.
   - **Links & QR:** send each player's personal link by WhatsApp or email, or download the QR sheet, print it, and hand each player their code.
6. On the day: **Setup → Open scoring (go live)**. Put the **Clubhouse TV display** link on the TV.
7. Afterwards: **Close scoring and finalise**, check **Committee**, export the leaderboard PDF, and **Move to archive**.

### Inviting helpers

**Club → Admins & invites** creates an invite link. An **event admin** can run one event (players, uploads, logos, links, scores). A **club admin** can run everything. Send the link by WhatsApp or email. They open it, sign in with their email, and they're in.

---

## Selling it: self-service sign-up and payment

The home page (`/`) is the public website. Organisers click **Set up your event**, sign in with their email, create their organisation and event, and pay. Paying unlocks scoring straight away, with no manual steps.

**Price.** Each event day costs the amount set on the owner dashboard (the default is $50). Multi-day events pay once per day. Setting up is free; scoring can be opened from the day before the event until the day after its last day.

**One-time setup**
1. Supabase → SQL editor: run `supabase/migrations/002_commercial.sql`.
2. Make yourself the owner (use your own email):
   `insert into platform_admins (user_id) select id from auth.users where email = 'you@example.com';`
3. Netlify → Site configuration → Environment variables:
   - `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project settings → API keys → service_role)
   - `STRIPE_SECRET_KEY` (start with the `sk_test_` key)
   - `STRIPE_WEBHOOK_SECRET` (from step 4)
   - optional: `PAYSTACK_SECRET_KEY`, which offers Paystack in ZAR to South African organisers
4. Stripe → Developers → Webhooks → Add endpoint:
   `https://YOUR-SITE/.netlify/functions/stripe-webhook`, with the events `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `charge.refunded`.
5. Redeploy on Netlify. Pay for a test event with card `4242 4242 4242 4242`, then switch to the live keys.
6. Supabase → Authentication → SMTP: add a real email sender. The built-in sender only allows a couple of emails an hour.
7. Fill in your company details in `src/lib/brand.js`, and have a lawyer check `/terms`, `/privacy` and `/refunds`.

**Owner dashboard (`/platform`):** revenue and payments, every event (with **Make free**), organisations (set one to Free), the shared course library, the price, and free mode.

**Refunds:** issue them in Stripe. The webhook records the refund automatically.

## Run it on your own computer (optional)

```bash
npm install
cp .env.example .env.local   # fill in the two Supabase values
npm run dev                  # http://localhost:5173
npm test                     # scoring engine tests
```

## Project layout

```
supabase/schema.sql     tables, security rules, score functions, live updates, logo storage
src/lib/engine.js       formats, handicaps, divisions, verification, ranking, countback
src/lib/render.js       scorecards
src/lib/useEvent.js     loading an event and live updates
src/lib/importer.js     Excel/CSV/paste import
src/lib/exporter.js     leaderboard PDF/PNG, QR sheets, posters, link lists
src/pages/              admin portals, player app, public leaderboard, TV, registration
tests/                  scoring engine tests
```

## Scale

The app is built for about 300 players at once:
- Each phone listens only to its own group's scores while scoring, and to the whole event only on the leaderboard tab.
- The TV and leaderboard pages listen to the whole event.
- If the live connection drops, every screen catches up when it reconnects, when the phone wakes, and every 5 minutes anyway.

Before your first big event, do a test round with 10–20 phones and watch the TV.

## Data and privacy

- Player mobile numbers, emails and personal link codes are visible only to that event's admins.
- Leaderboards show names, handicaps and scores, and only once an event is live.
- Draft events are private.
- Logos are stored in a public Supabase storage bucket.
- If a player's link is shared by mistake, use **Links & QR → New link** for that player. The old link stops working.
