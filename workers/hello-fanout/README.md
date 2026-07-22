# hello-fanout — email forwarding worker

Forwards every email sent to **hello@maccsystemsandengineering.com** to a list
of verified inboxes. This is an [Email Routing](https://developers.cloudflare.com/email-routing/email-workers/)
"destination worker": it has no HTTP endpoint and only runs when a routing rule
for the domain hands it an incoming message.

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
the maccsystemsandengineering.com zone).

## One-time wiring (dashboard)

Wrangler cannot create the Email Routing *rule* that connects the address to
this worker — do this once after the first deploy:

1. Cloudflare dashboard → **maccsystemsandengineering.com** → **Email** →
   **Email Routing** → **Routing rules**.
2. **Create address** (custom address): `hello@maccsystemsandengineering.com`.
3. Action: **Send to a Worker** → select **hello-fanout**.
4. Save. Send a test email to `hello@` and confirm all four inboxes receive it.

After that, redeploys via `npx wrangler deploy` take effect immediately with no
further dashboard steps — the rule stays pointed at the worker by name.

## Verify / debug

Tail live logs while sending a test email:

```sh
npx wrangler tail hello-fanout
```

Failed forwards (e.g. an unverified destination) are logged as
`forward to <addr> failed:`.
