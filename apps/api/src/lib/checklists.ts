/**
 * The companion's checklists. Steps point to official sources or to verified Karibu listings; they never state
 * rules from memory. Where a rule matters (visas, health), the step sends people to the official site.
 */
export type Step = { key: string; group: string; title: string; why: string; action?: { label: string; href: string; external?: boolean } };

const explore = (category: string, subtype?: string) => `/explore?category=${category}${subtype ? `&subtype=${encodeURIComponent(subtype)}` : ''}`;

export const BEFORE_YOU_GO: Step[] = [
  { key: 'go.entry', group: 'Before you fly', title: 'Check if you need an eTA, and apply only on the official site', why: 'Look-alike sites charge extra fees. Rules depend on your passport.', action: { label: 'Official eTA site', href: 'https://www.etakenya.go.ke', external: true } },
  { key: 'go.health', group: 'Before you fly', title: 'Check vaccinations and malaria advice', why: 'Ask a travel clinic a few weeks before, and check the official guidance.', action: { label: 'Health in Travel smart', href: '/safety#health' } },
  { key: 'go.insurance', group: 'Before you fly', title: 'Get travel insurance that covers medical evacuation', why: 'Parks and camps can be far from hospitals.' },
  { key: 'go.money', group: 'Before you fly', title: 'Plan how you’ll pay: M-Pesa, cards and some cash', why: 'Many small businesses take M-Pesa only.', action: { label: 'Money and M-Pesa', href: '/safety#money' } },
  { key: 'go.share', group: 'Before you fly', title: 'Share your trip plan with someone at home', why: 'One link shows where you’ll be each day.', action: { label: 'Open my trips', href: '/trips' } },
  { key: 'land.taxi', group: 'When you land', title: 'Know the fair airport taxi price before you’re quoted', why: 'Airport taxis are the most reported overcharge.', action: { label: 'Fair prices', href: '/safety/prices' } },
  { key: 'land.sim', group: 'When you land', title: 'Get a local SIM or eSIM', why: 'You’ll need data for maps and M-Pesa.', action: { label: 'SIM and data', href: '/safety#sim' } },
  { key: 'land.emergency', group: 'When you land', title: 'Save the emergency card for use offline', why: '999 and 112 work on any network; the card also lists your embassy.', action: { label: 'Emergency card', href: '/safety/emergency' } },
  { key: 'land.check', group: 'When you land', title: 'Check any operator before you pay a deposit', why: 'Deposits to personal numbers are the most common scam.', action: { label: 'Check an operator', href: '/safety/check' } },
];

/** A first month in Kenya, for people moving home or staying long. */
export const SETTLE_IN: Step[] = [
  { key: 'settle.sim', group: 'Week 1: get connected', title: 'Get a SIM and set up M-Pesa', why: 'Rent, bills and most shops use M-Pesa.', action: { label: 'Mobile networks', href: explore('utilities', 'mobile network') } },
  { key: 'settle.base', group: 'Week 1: get connected', title: 'Book a short stay while you look for a home', why: 'Seeing homes in person avoids most rental scams.', action: { label: 'Stays', href: explore('stay', 'apartment') } },
  { key: 'settle.ecitizen', group: 'Week 1: get connected', title: 'Set up eCitizen for government services', why: 'Most government payments and applications start here.', action: { label: 'eCitizen', href: 'https://www.ecitizen.go.ke', external: true } },
  { key: 'settle.bank', group: 'Week 1: get connected', title: 'Open a bank account', why: 'Useful for rent deposits and salaries. Banks list the documents they need.' },
  { key: 'settle.home', group: 'Week 2: find a home', title: 'Find a verified home or letting agent', why: 'Every home on Karibu had its documents checked.', action: { label: 'Long-stay homes', href: explore('home') } },
  { key: 'settle.lease', group: 'Week 2: find a home', title: 'Read the lease and pay the deposit to a company account', why: 'Never pay a deposit to a personal number before you’ve seen the home.', action: { label: 'Check an operator', href: '/safety/check' } },
  { key: 'settle.movers', group: 'Week 2: find a home', title: 'Book movers', why: 'Agree the price and what’s included in writing.', action: { label: 'Movers', href: explore('home_services', 'movers') } },
  { key: 'settle.internet', group: 'Week 3: set up the home', title: 'Get home internet', why: 'Installation can take a few days, so ask early.', action: { label: 'Home internet', href: explore('utilities', 'home internet') } },
  { key: 'settle.power', group: 'Week 3: set up the home', title: 'Sort electricity tokens, water and cooking gas', why: 'Prepaid meters need tokens; ask the landlord how water is billed.', action: { label: 'Utilities', href: explore('utilities') } },
  { key: 'settle.furniture', group: 'Week 3: set up the home', title: 'Furnish: stores, workshops and second-hand', why: 'Local workshops make furniture to measure.', action: { label: 'Furniture and home', href: explore('furniture') } },
  { key: 'settle.help', group: 'Week 4: settle in', title: 'Find cleaning or a house help agency', why: 'Agencies check references; agree pay and days off in writing.', action: { label: 'Cleaning and house help', href: explore('home_services', 'cleaning') } },
  { key: 'settle.security', group: 'Week 4: settle in', title: 'Check security: locks, lights, CCTV if needed', why: 'Ask neighbours and the caretaker what works in your area.', action: { label: 'Security', href: explore('home_services', 'security and CCTV') } },
  { key: 'settle.grooming', group: 'Week 4: settle in', title: 'Find your barber or salon', why: 'Small, but it makes a new place feel like home.', action: { label: 'Hair and grooming', href: explore('grooming') } },
  { key: 'settle.prices', group: 'Week 4: settle in', title: 'Share what you paid for rent, internet and services', why: 'Your prices help the next person moving home.', action: { label: 'I paid this much', href: '/safety/prices/add' } },
];

export const ALL_STEPS = [...BEFORE_YOU_GO, ...SETTLE_IN];
