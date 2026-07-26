# hello-fanout — email forwarding worker

Forwards email sent to the company addresses to a list of verified inboxes, and
archives a copy to D1 so the Command Center shared mailbox (`/internal/mail.html`)
can show them. This is an [Email Routing](https://developers.cloudflare.com/email-routing/email-workers/)
"destination worker": it has no HTTP endpoint and only runs when a routing rule
for the domain hands it an incoming message.

The worker code is domain/address-agnostic — it only reads the destination list
and forwards. To point another address at it (even on a different domain), just
add another routing rule (see below); no code change needed. One worker serves
every zone in the account. Current rules:

| Address                  | Zone            | Rule name                  |
|--------------------------|-----------------|----------------------------|
| hello@maccsyseng.com     | maccsyseng.com  | hello -> fanout worker     |
| main@maccsyseng.com      | maccsyseng.com  | main -> fanout worker      |
| official@macc-inc.com    | macc-inc.com    | official -> fanout worker  |
| alternate@macc-inc.com   | macc-inc.com    | alternate -> fanout worker |

All of them fan out to the same four inboxes below and land in the same shared
mailbox — the worker doesn't care which domain the mail came in on.

## Current destinations

Set in `wrangler.toml` under `[vars] FORWARD_TO` (comma-separated):

- androidjeth@gmail.com
- aver.corpin@gmail.com
- benjiemalinao87@gmail.com
- engr.juncab@gmail.com

To add/remove a recipient, edit `FORWARD_TO` and re-run `deploy`. **Every
address must be a Verified Destination Address on the account first**
(Cloudflare dashboard → Email Routing → Destination Addresses). Forwarding to a
Pending/unverified address fails silently — the mail just never arrives.

## Deploy

From this directory (`workers/hello-fanout/`):

```sh
npx wrangler deploy
```

That uploads the script as a Worker named `hello-fanout`. Account is selected by
your `wrangler login` (currently benjiemalinao87@gmail.com's account, which holds
the maccsyseng.com zone).

## One-time wiring: the routing rule

The rule connecting `hello@maccsyseng.com` to this worker is separate from the
deploy. Do it once (Email Routing must be Enabled on the domain first — it is).

### Via CLI (needs the `email_routing:write` OAuth scope)

If `npx wrangler email routing rules list maccsyseng.com` errors about missing
scopes, refresh the token first with `npx wrangler login`, then:

```sh
# Repeat per address (hello@, main@, ...), changing --name and --match-value.
npx wrangler email routing rules create maccsyseng.com \
  --name "hello -> fanout worker" \
  --match-type literal --match-field to --match-value hello@maccsyseng.com \
  --action-type worker --action-value hello-fanout
```

### Via dashboard (equivalent)

1. Cloudflare dashboard → **maccsyseng.com** → **Email** → **Email Routing** →
   **Routing rules** → **Create routing rule**.
2. Custom address: `hello@maccsyseng.com`.
3. Action: **Send to a Worker** → select **hello-fanout**.
4. Save. Send a test email to `hello@` and confirm the inboxes receive it.

After that, redeploys via `npx wrangler deploy` take effect immediately with no
further dashboard steps — the rule stays pointed at the worker by name.

## Adding a new domain (e.g. macc-inc.com)

A brand-new zone has no Email Routing yet, so there are extra one-time steps
before the rule can be created. **The worker and the four destination inboxes are
already in place — nothing here changes the code or `FORWARD_TO`.** Assumes the
new domain lives in the *same* Cloudflare account as the `hello-fanout` worker; if
it's a different account, deploy a copy of this worker there first (the worker must
be in the same account as the zone to be selectable as a rule action).

1. **Enable Email Routing** on the zone: dashboard → **macc-inc.com** → **Email** →
   **Email Routing** → **Get started / Enable**. This publishes the required MX +
   SPF (TXT) records automatically. Wait for it to report *Enabled* (usually a
   minute or two; the domain's nameservers must already be on Cloudflare).
2. **Destination addresses** — the four inboxes (`androidjeth@`, `aver.corpin@`,
   `benjiemalinao87@`, `engr.juncab@` at gmail.com) are verified account-wide, so
   if macc-inc.com is in the same account they're already usable. Confirm none show
   *Pending* under **Destination Addresses** (a Pending address silently drops mail).
3. **Create the two routing rules** — one per address, both pointed at the
   `hello-fanout` worker:
   - Custom address `official@macc-inc.com`  → **Send to a Worker** → `hello-fanout`
   - Custom address `alternate@macc-inc.com` → **Send to a Worker** → `hello-fanout`
4. **Test**: email `official@macc-inc.com` from an outside inbox. Within a few
   seconds it should (a) land in all four Gmails and (b) appear in the Command
   Center mailbox at `/internal/mail`. `npx wrangler tail hello-fanout` shows the
   run live.

CLI equivalent for step 3 (needs a login on the macc-inc.com account with the
`email_routing:write` scope — `npx wrangler login`):

```sh
npx wrangler email routing rules create macc-inc.com \
  --name "official -> fanout worker" \
  --match-type literal --match-field to --match-value official@macc-inc.com \
  --action-type worker --action-value hello-fanout

npx wrangler email routing rules create macc-inc.com \
  --name "alternate -> fanout worker" \
  --match-type literal --match-field to --match-value alternate@macc-inc.com \
  --action-type worker --action-value hello-fanout
```

**Not covered by this:** *sending as* official@/alternate@macc-inc.com from the
app. Replies from the Command Center still go out as `main@maccsyseng.com` (the
only verified senders). To send as the macc-inc.com addresses, enable **Email
Sending** on the macc-inc.com zone, then add them to `SENDERS` in
`funnel/functions/api/mail.js`. Receiving + forwarding + shared-mailbox display all
work without that.

## Verify / debug

Tail live logs while sending a test email:

```sh
npx wrangler tail hello-fanout
```

Failed forwards (e.g. an unverified destination) are logged as
`forward to <addr> failed:`.
