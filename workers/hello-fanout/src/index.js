/**
 * Email Routing fan-out worker for hello@maccsystemsandengineering.com.
 *
 * Cloudflare's message.forward() forwards to ONE recipient per call, so to
 * copy an incoming email to several inboxes we call it once per address and
 * await them together.
 *
 * Destinations come from the FORWARD_TO var (see wrangler.toml) as a
 * comma-separated list. Every address MUST be a *verified* Destination Address
 * on the account — forwarding to a Pending/unverified address fails silently
 * and that recipient just never gets the mail.
 */
export default {
  async email(message, env, ctx) {
    const destinations = (env.FORWARD_TO || "")
      .split(",")
      .map((addr) => addr.trim())
      .filter(Boolean);

    if (destinations.length === 0) {
      // Nothing to forward to — reject so the sender gets a bounce rather than
      // the mail vanishing silently (a handler that returns without acting
      // drops the message).
      message.setReject("No forwarding destinations configured");
      return;
    }

    // Fan out. Promise.allSettled so one bad/unverified address can't stop the
    // others from receiving the mail; we log any that fail for the tail.
    const results = await Promise.allSettled(
      destinations.map((addr) => message.forward(addr)),
    );

    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(`forward to ${destinations[i]} failed:`, result.reason);
      }
    });
  },
};
