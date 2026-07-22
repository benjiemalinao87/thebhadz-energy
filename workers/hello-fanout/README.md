# hello-fanout — email forwarding worker

Forwards email sent to **hello@maccsyseng.com** and **main@maccsyseng.com** to a
list of verified inboxes. This is an [Email Routing](https://developers.cloudflare.com/email-routing/email-workers/)
"destination worker": it has no HTTP endpoint and only runs when a routing rule
for the domain hands it an incoming message.

The worker code is domain/address-agnostic — it only reads the destination list
and forwards. To point another address at it, just add another routing rule (see
below); no code change needed. Current rules on `maccsyseng.com`:

| Address                | Rule name              |
|------------------------|------------------------|
| hello@maccsyseng.com   | hello -> fanout worker |
| main@maccsyseng.com    | main -> fanout worker  |

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

## Verify / debug

Tail live logs while sending a test email:

```sh
npx wrangler tail hello-fanout
```

Failed forwards (e.g. an unverified destination) are logged as
`forward to <addr> failed:`.
