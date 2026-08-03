// Outreach profile + message templates, shared by popup.js and options.js.
//
// The profile lives in chrome.storage.sync (per founder, synced across that
// founder's own Chrome profiles) — NOT in D1. The parts that are the same for
// everyone (company name, address, website) ship as defaults here, so they stay
// consistent across founders through git rather than through four people typing
// the address four ways. Only the personal fields start blank.
//
// Honesty rules bind these templates (CLAUDE.md §1.6 / §7): no install counts we
// have not banked, no claim of certification or distributor status we do not hold,
// no volume commitment we have not earned. Every draft is editable in the popup
// before it goes anywhere, and NOTHING is ever auto-submitted.

const MACC_COMPANY = {
  company: 'MACC Systems & Engineering Inc.',
  website: 'https://macc-inc.com',
  address: 'Talustusan, Naval, Biliran',
  city: 'Naval',
  state: 'Biliran',
  country: 'Philippines',
  zip: '',
};

// Field order here is the order they render on the options page.
const MACC_PROFILE_FIELDS = [
  { key: 'firstName', label: 'First name', placeholder: 'Benjie' },
  { key: 'lastName', label: 'Last name', placeholder: 'Malinao' },
  { key: 'jobTitle', label: 'Job title', placeholder: 'Co-founder' },
  { key: 'email', label: 'Work email', placeholder: 'you@macc-inc.com' },
  { key: 'phone', label: 'Phone', placeholder: '+63 955 723 5093' },
  { key: 'company', label: 'Company', placeholder: MACC_COMPANY.company },
  { key: 'website', label: 'Website', placeholder: MACC_COMPANY.website },
  { key: 'address', label: 'Street address', placeholder: MACC_COMPANY.address },
  { key: 'city', label: 'City', placeholder: MACC_COMPANY.city },
  { key: 'state', label: 'Province / State', placeholder: MACC_COMPANY.state },
  { key: 'zip', label: 'Postal code', placeholder: 'leave blank if unsure' },
  { key: 'country', label: 'Country', placeholder: MACC_COMPANY.country },
];

const MACC_PROFILE_DEFAULTS = (() => {
  const out = {};
  for (const f of MACC_PROFILE_FIELDS) out[f.key] = MACC_COMPANY[f.key] || '';
  return out;
})();

// Two sign-offs: the full block for the long draft, and a two-line version for the
// short one, where every character is competing with a maxlength.
function maccShortSignature(p) {
  const who = [[p.firstName, p.lastName].filter(Boolean).join(' '), p.company || MACC_COMPANY.company]
    .filter(Boolean).join(' · ');
  const reach = [p.phone, p.email].filter(Boolean).join(' · ');
  return [who, reach].filter(Boolean).join('\n');
}

function maccSignature(p) {
  const who = [p.firstName, p.lastName].filter(Boolean).join(' ');
  const line2 = [p.jobTitle, p.company || MACC_COMPANY.company].filter(Boolean).join(' · ');
  const line3 = [p.phone, p.email].filter(Boolean).join(' · ');
  const line4 = [p.address, p.city, p.state, p.country].filter(Boolean).join(', ');
  return [who, line2, line3, line4].filter(Boolean).join('\n');
}

/**
 * Every template returns { subject, long, short, role, inquiry }.
 *
 * `short` is used when the target textarea has a maxlength the long draft would
 * blow past — brand contact forms cap at 500 characters surprisingly often.
 * `role`/`inquiry` steer the engine's <select> guesses ("Which best describes
 * you?", "Inquiry type") toward the right option for this kind of ask.
 */
const MACC_TEMPLATES = [
  {
    id: 'biliran-comarketing',
    label: 'Biliran co-marketing event',
    hint: 'Co-branded informational event in Naval — the partnership ask.',
    role: ['distributor', 'partner', 'installer', 'dealer'],
    inquiry: ['partner', 'cooperat', 'marketing', 'business', 'distribut', 'sales'],
    build(p, ctx) {
      const brand = ctx.brand || 'your team';
      const subject = `Co-marketing partnership — introducing ${brand} to Biliran province, Philippines`;
      const long = [
        `Hello ${brand} team,`,
        '',
        `I am ${[p.firstName, p.lastName].filter(Boolean).join(' ') || '[your name]'}${p.jobTitle ? ', ' + p.jobTitle : ''} at ${p.company || MACC_COMPANY.company} — a solar supply, fabrication and installation company based in ${MACC_COMPANY.address}, Philippines.`,
        '',
        'Biliran is an island province of 7 municipalities and 117 barangays served by a single electric cooperative (BILECO) at roughly PHP 12.95/kWh residential — among the highest rates in the region — with frequent brownouts. As far as we can confirm, there is no solar installer based on the island: homeowners buy from Tacloban or Cebu and pay freight on every panel and on every warranty claim.',
        '',
        `We are a newly incorporated company building that local capability, and we are choosing the inverter and battery brands we will standardise on. I would like to propose a co-marketing partnership around an in-person informational event in Naval:`,
        '',
        '- We organise and host it — venue, local promotion, and the homeowners and barangay officials in the room.',
        `- We would ask ${brand} for co-branding: product literature, a banner or booth kit, a demo or display unit if one can be made available, and ideally a technical speaker to present and take questions (in person or by video call).`,
        `- ${brand} gets first-mover visibility in a province where no brand is established yet, in front of an audience actively looking for an alternative to PHP 12.95/kWh.`,
        `- In return ${brand} becomes our preferred brand for the systems we design and install on the island, and your branding travels with those installations.`,
        '',
        'To be straightforward about where we are: we are pre-revenue and working on our first installations, so I will not quote you volumes we have not earned. What we can offer today is the ground presence, the event, and a market with no competing brand established in it.',
        '',
        'Could you point me to the right person for channel or marketing partnerships in the Philippines or Southeast Asia? I am glad to send our company profile and the event plan.',
        '',
        'Thank you,',
        maccSignature(p),
      ].join('\n');
      const short = [
        `Hello ${brand} team,`,
        '',
        `${p.company || MACC_COMPANY.company} installs solar on Biliran island, Philippines — one electric cooperative at ~PHP 12.95/kWh, frequent brownouts, and no installer based on the island.`,
        '',
        `We are hosting an informational event in Naval and would like ${brand} as co-marketing partner: literature, a banner or demo unit, and a technical speaker. In return you become our preferred brand for what we install here.`,
        '',
        'We are newly incorporated, so no volume claims — what we offer is ground presence in a province with no brand established in it. Who handles channel partnerships for the Philippines?',
        '',
        maccShortSignature(p),
      ].join('\n');
      return { subject, long, short };
    },
  },
  {
    id: 'distributor',
    label: 'Become a distributor',
    hint: 'Distribution / dealership enquiry for the Philippines.',
    role: ['distributor', 'dealer', 'partner', 'installer'],
    inquiry: ['distribut', 'dealer', 'partner', 'business', 'sales'],
    build(p, ctx) {
      const brand = ctx.brand || 'your team';
      const subject = `Distribution enquiry — Philippines (Biliran / Eastern Visayas)`;
      const long = [
        `Hello ${brand} team,`,
        '',
        `I am ${[p.firstName, p.lastName].filter(Boolean).join(' ') || '[your name]'}${p.jobTitle ? ', ' + p.jobTitle : ''} at ${p.company || MACC_COMPANY.company}, a solar supply, fabrication and installation company in ${MACC_COMPANY.address}, Philippines.`,
        '',
        `We are enquiring about distribution or dealer terms for ${brand} in the Philippines, with our own focus on Biliran and Eastern Visayas — an island market on a single electric cooperative at roughly PHP 12.95/kWh with no solar installer based locally.`,
        '',
        'What we would like to understand:',
        '- Your distributor and dealer tiers for the Philippines, and who currently holds them.',
        '- Minimum order quantity and indicative trade pricing for residential hybrid inverters and matching batteries.',
        '- Warranty terms and how a claim is actually serviced from the Philippines — turnaround, who holds stock, who pays freight.',
        '- Certification and grid-code compliance documents for Philippine net-metering approval.',
        '- Technical training and after-sales support available to a new partner.',
        '',
        'We are newly incorporated and building our first installations, so I will be straightforward: we are not going to open with volume commitments. We are looking for the brand we will standardise on as we build, and warranty service turnaround matters to us more than headline price.',
        '',
        'Thank you,',
        maccSignature(p),
      ].join('\n');
      const short = [
        `Hello ${brand} team,`,
        '',
        `${p.company || MACC_COMPANY.company} is a solar installation company in Biliran, Philippines. We would like to understand your Philippine distributor/dealer tiers, MOQ and indicative trade pricing for residential hybrid inverters and batteries, warranty service turnaround from within the Philippines, and the certification documents needed for local net-metering approval.`,
        '',
        'We are newly incorporated and building our first installations — no volume claims. We are choosing the brand we will standardise on, and service turnaround matters more to us than headline price.',
        '',
        maccShortSignature(p),
      ].join('\n');
      return { subject, long, short };
    },
  },
  {
    id: 'installer-account',
    label: 'Installer / dealer account',
    hint: 'Open a buying account and get trade pricing.',
    role: ['installer', 'epc', 'dealer', 'system integrator', 'partner'],
    inquiry: ['sales', 'product', 'partner', 'business', 'dealer'],
    build(p, ctx) {
      const brand = ctx.brand || 'your team';
      const subject = `Installer account request — ${p.company || MACC_COMPANY.company} (Philippines)`;
      const long = [
        `Hello ${brand} team,`,
        '',
        `${p.company || MACC_COMPANY.company} is a solar supply, fabrication and installation company in ${MACC_COMPANY.address}, Philippines. We install residential systems in the 3–8 kW range and are setting up our supply chain.`,
        '',
        `I would like to open an installer or dealer account with ${brand}, or be pointed to your authorised Philippine distributor if that is the correct route.`,
        '',
        'Specifically:',
        '- Trade pricing and MOQ on residential hybrid inverters and compatible batteries.',
        '- Lead time and landed shipping options to Eastern Visayas.',
        '- Warranty terms and the actual service path for a unit that fails in the Philippines.',
        '- Datasheets, certification and grid-code documents we can submit for net-metering approval.',
        '- Installer training or certification you offer.',
        '',
        'Thank you,',
        maccSignature(p),
      ].join('\n');
      const short = [
        `Hello ${brand} team,`,
        '',
        `${p.company || MACC_COMPANY.company} installs residential solar (3–8 kW) in Biliran, Philippines. We would like to open an installer/dealer account with ${brand} — or be pointed to your authorised Philippine distributor.`,
        '',
        'Please send trade pricing and MOQ on residential hybrid inverters and batteries, lead time to Eastern Visayas, warranty service path within the Philippines, and the certification documents needed for net-metering approval.',
        '',
        maccShortSignature(p),
      ].join('\n');
      return { subject, long, short };
    },
  },
  {
    id: 'tech-docs',
    label: 'Technical docs & compliance',
    hint: 'Datasheets, certificates, grid-code compliance for net-metering.',
    role: ['installer', 'epc', 'system integrator', 'partner'],
    inquiry: ['technical', 'support', 'product', 'service', 'sales'],
    build(p, ctx) {
      const brand = ctx.brand || 'your team';
      const subject = 'Technical documentation request — Philippine net-metering approval';
      const long = [
        `Hello ${brand} team,`,
        '',
        `I am ${[p.firstName, p.lastName].filter(Boolean).join(' ') || '[your name]'} at ${p.company || MACC_COMPANY.company}, a solar installation company in ${MACC_COMPANY.address}, Philippines.`,
        '',
        'For a residential hybrid installation we are submitting to our local electric cooperative for net-metering approval, could you send:',
        '- Full datasheet and installation manual for the model(s) in the 3–8 kW residential hybrid range.',
        '- Safety and grid-code certificates (IEC 62109, anti-islanding / grid protection).',
        '- Warranty statement, and the service path for a unit that fails while installed in the Philippines.',
        '- Confirmation of which battery models are compatible and supported.',
        '',
        'Thank you,',
        maccSignature(p),
      ].join('\n');
      const short = [
        `Hello ${brand} team,`,
        '',
        `${p.company || MACC_COMPANY.company} (solar installer, Biliran, Philippines) is preparing a net-metering submission to our local electric cooperative. Please send the datasheet and installation manual for your 3–8 kW residential hybrid models, safety and grid-code certificates (IEC 62109, anti-islanding), the warranty statement and Philippine service path, and the list of compatible battery models.`,
        '',
        maccShortSignature(p),
      ].join('\n');
      return { subject, long, short };
    },
  },
];

function maccTemplateById(id) {
  return MACC_TEMPLATES.find((t) => t.id === id) || MACC_TEMPLATES[0];
}
