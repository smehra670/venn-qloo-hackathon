import { BUSINESS_TYPE_LABELS } from "@shared/constants";
import type { Brief, BusinessInput, Partner, PartnerKind, RunResult } from "@shared/types";

interface VariantCopy {
  format: string;
  title: string;
  concept: string;
  firstStep: string;
}

const VARIANTS: Record<PartnerKind, [VariantCopy, VariantCopy, VariantCopy]> = {
  music: [
    {
      format: "Listening night",
      title: "Listening night with {partner}",
      concept:
        "Once a month, {business} hosts a low-key evening built around {partner}: a guest selector plays records, a short menu fits the mood, and anyone who shows a stamp from either side gets a shared perk. It borrows their crowd's habit of {tag1} and gives it a calm home in {city}. The first night stays small on purpose, so both teams can see who actually walks through the door.",
      firstStep: "Send a two-line note to {partner} proposing one pilot night in the next three weeks.",
    },
    {
      format: "Co-branded playlist plus loyalty perk",
      title: "A shared playlist with {partner}",
      concept:
        "{business} and {partner} put one playlist in the room and on the counter, built around {tag1} and {tag2}. People who mention it, or show a recent receipt from the other side, get a small perk for a month. There is no app and no shared customer list, just a code on a card. It is a light way to see whether the two crowds already overlap.",
      firstStep: "Draft a 20-track playlist and a one-line perk, then ask {partner} which five tracks they would swap.",
    },
    {
      format: "In-store live session",
      title: "A short live session with {partner}",
      concept:
        "For one hour, {partner} brings a performer or a selector into {business}. The set stays acoustic or low-volume, the offer stays short, and the room is capped. People come for {tag1}, and they leave having spent time in your place rather than only at a venue. Treat the hour as a test of the crowd, not a launch.",
      firstStep: "Ask {partner} for one midweek hour in the next month when their crowd is already out.",
    },
  ],
  fitness: [
    {
      format: "Post-session perk",
      title: "A post-session perk with {partner}",
      concept:
        "After a session at {partner}, their crowd can walk to {business} and trade a same-day stamp for a small perk. The offer is specific, not a blanket discount, and it runs for two weeks. It meets people when they are already out for {tag1} and gives them one reason to cross the street. You learn quickly whether their regulars are also yours.",
      firstStep: "Agree a same-day stamp and a perk cheap enough to honour without a meeting.",
    },
    {
      format: "Run or class meetup",
      title: "A meetup with {partner}",
      concept:
        "{business} becomes the start or the finish of one {partner} meetup. The route or the class stays theirs. You provide water, a short menu, or a place to gather that fits {tag1}. Caps keep it friendly. Afterwards both sides write down who came, in general terms, without collecting anyone's details.",
      firstStep: "Pick one weekend morning and offer {partner} the room or the pavement outside for a single meetup.",
    },
    {
      format: "Class plus brunch bundle",
      title: "Class and a slow meal with {partner}",
      concept:
        "One ticket covers a class with {partner} and something unhurried at {business}. The bundle is limited, named around {tag1} and {tag2}, and sold by both sides at the counter. It is a way to see whether their crowd wants a longer morning, not just the session. Keep the food or the format simple so the test is about people, not logistics.",
      firstStep: "Price a bundle that neither side loses money on, and send {partner} two possible Sundays.",
    },
  ],
  wellness: [
    {
      format: "Slow morning bundle",
      title: "A slow morning with {partner}",
      concept:
        "Before the day gets loud, {business} and {partner} share a two-hour window. Their crowd arrives for {tag1}, and yours offers the part of the morning you already do well. Numbers stay low. The point is a calmer overlap, not a packed launch, and the first run is explicitly a test.",
      firstStep: "Offer {partner} one Tuesday morning in the next fortnight, with a cap written in the note.",
    },
    {
      format: "Workshop and tasting",
      title: "A workshop and tasting with {partner}",
      concept:
        "A 45-minute workshop from {partner} sits beside a short tasting at {business}, tied to {tag1} and {tag2}. People book a seat rather than wandering in, so you can tell whether the idea holds. No one shares a mailing list. Sign-up is a name on a paper list at whichever counter they choose, used only for that event.",
      firstStep: "Sketch the 45 minutes and ask {partner} what they would need in the room.",
    },
    {
      format: "Guest session",
      title: "A guest session with {partner}",
      concept:
        "Someone from {partner} hosts a single session at {business}, or you host a small table at their place. The session leans on {tag1} and stays inside an hour. It is a visit, not a residency. Both teams watch who shows up and decide afterwards whether a second date is worth it.",
      firstStep: "Invite {partner} to host one session and offer two times that are already quiet for you.",
    },
  ],
  fashion: [
    {
      format: "Capsule pop-up",
      title: "A capsule pop-up with {partner}",
      concept:
        "For one weekend, {partner} hangs a short rail inside {business}. The edit is small, built around {tag1} and {tag2}, and it leaves on Sunday night. You are not becoming a shop and they are not taking over the room. The weekend shows whether their crowd will cross into yours when the ask is simple.",
      firstStep: "Measure one wall or rail and send {partner} a photo with two possible weekends.",
    },
    {
      format: "Window takeover",
      title: "A window with {partner}",
      concept:
        "{partner} dresses one window at {business} for a week. The story in the glass is {tag1}, and the note in the window says where to find them and where to find you. It is visible without a party. You learn from footfall and from what staff overhear, not from a campaign.",
      firstStep: "Offer {partner} a single window and a Monday install, and ask what they would want taken down by Sunday.",
    },
    {
      format: "Limited collab merch",
      title: "A small merch run with {partner}",
      concept:
        "One shared item, made in a short run, sits at both {business} and {partner}. The design references {tag1} without shouting. When it sells through, you stop. The question is whether people who already like one of you will carry something that names both. Treat leftovers as a lesson, not a failure.",
      firstStep: "Propose one object, a quantity under fifty, and who pays for the first batch.",
    },
  ],
  retail: [
    {
      format: "Co-branded bundle",
      title: "A shared bundle with {partner}",
      concept:
        "{business} and {partner} put two things in one parcel or one bag, priced once, limited to a count you can both fulfil. The link is {tag1} and {tag2}, explained in a sentence on the tag. It is a product test of the overlap: if the people who buy it were already customers of both, you have a real thread to pull.",
      firstStep: "Choose one item from each side and send {partner} a price that leaves both a margin.",
    },
    {
      format: "In-store sampling corner",
      title: "A sampling corner with {partner}",
      concept:
        "A small table at {business} lets {partner} offer a taste, a sample, or a try-on for a few hours. Nothing is remodelled. Staff from both sides stay, and the conversation is about {tag1}. You are watching whether their crowd feels at home in your room, and whether yours stops at the table.",
      firstStep: "Offer {partner} a two-hour corner on a day you already have steady footfall.",
    },
    {
      format: "Shared giveaway",
      title: "A counter giveaway with {partner}",
      concept:
        "One prize, drawn from names written at the counter of {business} or {partner}. No emails change hands and no lists are merged. The card mentions {tag1} and the date of the draw. It is a light reason for each crowd to visit the other once. Afterwards you throw the paper away.",
      firstStep: "Write the prize and the rule on one card, then ask {partner} to put the same card on their counter.",
    },
  ],
  culture: [
    {
      format: "Zine or print night",
      title: "A print night with {partner}",
      concept:
        "{business} hosts an evening where {partner} helps people make something small: a page, a print, a short zine. The theme is {tag1}, the tools stay simple, and the room is capped. People leave with an object and a reason to remember both names. The night is a test of whether their making crowd and your regulars are the same people.",
      firstStep: "Ask {partner} what they can teach in ninety minutes with the tables you already have.",
    },
    {
      format: "Exhibition wall",
      title: "A wall with {partner}",
      concept:
        "For two weeks, one wall at {business} shows work chosen with {partner}. Labels stay short and mention {tag1} and {tag2} only if they are true. There is no private view unless you both want a quiet hour before opening. The wall tells you whether their audience will come to your address for something other than the usual offer.",
      firstStep: "Send {partner} a photo of the wall and the dates it could be empty.",
    },
    {
      format: "Hands-on workshop",
      title: "A workshop with {partner}",
      concept:
        "A booked workshop, led with {partner}, sits inside {business} for one evening. Seats are capped, the materials are decided in advance, and the subject is {tag1}. Payment can be taken at either counter. You are not building a course, just checking whether a shared hour draws a mixed room.",
      firstStep: "Propose one evening, a seat cap, and a price, and ask {partner} what they would change.",
    },
  ],
  venue: [
    {
      format: "Pre-show offer",
      title: "A pre-show hour with {partner}",
      concept:
        "On nights {partner} has a show, {business} offers something specific in the hour before doors. The note is on the ticket or the door list, not a blast to a database. People already out for {tag1} get one reason to start at your place. After three shows you will know if the habit sticks.",
      firstStep: "Ask {partner} for the next three show dates and offer a pre-show perk on one of them.",
    },
    {
      format: "Pop-up bar takeover",
      title: "One night at {partner}",
      concept:
        "{business} takes a corner of {partner} for a single night, or they take a corner of yours. The offer is short and tied to {tag1} and {tag2}. Staffing is agreed in writing so nobody is guessing at 9pm. One night is enough to see the crowd. A second night is a decision, not a default.",
      firstStep: "Suggest one night and a one-page split of who brings what, who staffs, and when it ends.",
    },
    {
      format: "Ticket-and-treat bundle",
      title: "A ticket bundle with {partner}",
      concept:
        "A ticket to {partner} includes something small from {business}, or the other way round. The bundle is limited and explained in one sentence about {tag1}. You are testing whether their audience will accept you as part of the night out, and whether yours will buy a ticket they would not have bought alone.",
      firstStep: "Price ten bundles and ask {partner} which upcoming night can carry them.",
    },
  ],
  food: [
    {
      format: "Menu collab",
      title: "A short menu with {partner}",
      concept:
        "For two weeks, {business} and {partner} put one shared dish, pastry or plate on the menu. It is named plainly, built around {tag1}, and taken off when the trial ends. Staff can say why it is there in a sentence. The collab is a test of taste overlap, not a new identity for either kitchen.",
      firstStep: "Propose one item you can make without new equipment and ask {partner} what they would add.",
    },
    {
      format: "Supper club",
      title: "A supper club with {partner}",
      concept:
        "One table, one night, a capped list. {partner} and {business} cook or host together around {tag1} and {tag2}. Seats are sold at the counter, not through a shared mailing list. The room will tell you, faster than a month of posts, whether the two crowds enjoy sitting together.",
      firstStep: "Offer {partner} a single date and a seat count you can serve without hiring.",
    },
    {
      format: "Tasting flight",
      title: "A tasting flight with {partner}",
      concept:
        "Three small tastes, one sitting, a clear theme of {tag1}. {business} and {partner} each contribute something, and the card explains the link in a line. It is easy to run on a quiet afternoon. If people book a second flight, you have a reason to talk about a longer run.",
      firstStep: "Write the three tastes on a card and ask {partner} which one should be theirs.",
    },
  ],
  drink: [
    {
      format: "Pairing night",
      title: "A pairing night with {partner}",
      concept:
        "Three pairings, a short menu, one evening. {partner} brings the drinks and {business} brings the food, or the reverse, held together by {tag1} and {tag2}. The room is booked, not walk-in only, so you can feel the size of the overlap. Notes stay on paper. Nobody's preferences are stored.",
      firstStep: "Send {partner} three pairing ideas and two evenings in the next month.",
    },
    {
      format: "Signature drink collab",
      title: "A signature drink with {partner}",
      concept:
        "One drink goes on the menu at {business} for a month under both names, or {partner} pours something that points back to you. The recipe is simple enough to repeat on a busy night, and the story is {tag1}. At the end of the month you look at sales and at whether new faces mentioned the other name.",
      firstStep: "Propose one recipe and a month-long run, and ask {partner} who trains the staff.",
    },
    {
      format: "Happy-hour handoff",
      title: "A handoff with {partner}",
      concept:
        "In the last hour at {partner}, a small card points people to {business}, and you do the same on one of your busier evenings. The perk is modest and tied to {tag1}. You are not discounting the house. You are checking whether a warm handoff moves a crowd a few streets, once, without a campaign.",
      firstStep: "Print a small card and ask {partner} to keep it by the till for five nights.",
    },
  ],
};

export function formatsFor(kind: PartnerKind): string[] {
  return VARIANTS[kind].map((variant) => variant.format);
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

export const LIMITS_TEXT =
  "Match scores describe group-level taste patterns, not individual customers. This brief is a starting point, not a guarantee.";

export function businessLabel(input: BusinessInput): string {
  if (input.businessName) return input.businessName;
  if (input.businessType === "other" && input.businessTypeCustom) return input.businessTypeCustom;
  return `your ${BUSINESS_TYPE_LABELS[input.businessType]}`;
}

function signoff(input: BusinessInput, business: string): string {
  return input.businessName ? input.businessName : `The team at ${business}`;
}

export function renderBrief(result: RunResult, partner: Partner, variant: number): Brief {
  const index = ((variant % 3) + 3) % 3;
  const copy = VARIANTS[partner.kind][index] ?? VARIANTS[partner.kind][0];
  const tag1 = partner.sharedTags[0] ?? "a shared taste";
  const tag2 = partner.sharedTags[1] ?? tag1;
  const city = result.city?.name ?? result.input.city;
  const neighbourhood = partner.locationLabel?.split(",")[0]?.trim() || city;
  const business = businessLabel(result.input);
  const values = {
    business,
    partner: partner.name,
    tag1,
    tag2,
    city,
    neighbourhood,
  };
  const toThem = Math.round(partner.signals.affinityToPartner * 100);
  const fromThem = Math.round(partner.signals.affinityFromPartner * 100);
  const whyItFits = [
    {
      text: `Both crowds lean ${tag1}${partner.sharedTags[1] ? ` and ${tag2}` : ""}. That is the taste the format is built on.`,
      evidence: ["Shared tags"],
    },
    {
      text: `From your side the taste fit is ${toThem}%, and from theirs it is ${fromThem}%, relative to this search.`,
      evidence: ["Taste fit you -> them", "Taste fit them -> you"],
    },
    partner.local
      ? {
          text: `They are in ${neighbourhood}. Local popularity in this search is ${Math.round(partner.signals.localPopularity * 100)}%.`,
          evidence: ["Local popularity"],
        }
      : {
          text: `The trend read is ${partner.evidence.find((item) => item.label === "Trend")?.value ?? "Steady"}, so the timing is part of the case.`,
          evidence: ["Trend"],
        },
  ];
  const subject = `${copy.format} — an idea for ${partner.name}`;
  const body = [
    "Hello,",
    "",
    `I run ${business} in ${city}. A lot of our regulars care about ${tag1} and ${tag2}, and that lines up with the crowd around ${partner.name}.`,
    "",
    `I would like to try one ${copy.format.toLowerCase()} together, kept small on purpose. We would host what we already do well, you would bring the part only you can, and we would judge the night as a test rather than a launch.`,
    "",
    "If you are open to it, I can send two possible dates in the next three weeks. No customer lists, just a conversation.",
    "",
    signoff(result.input, business),
  ].join("\n");

  return {
    runId: result.runId,
    partnerId: partner.id,
    partnerName: partner.name,
    variant: index,
    variantCount: 3,
    title: fill(copy.title, values),
    format: copy.format,
    concept: fill(copy.concept, values),
    whyItFits,
    firstStep: fill(copy.firstStep, values),
    plan: [
      { when: "Days 1-2", action: `Send the note to ${partner.name} and agree the one constraint that keeps a first ${copy.format.toLowerCase()} easy.` },
      { when: "Days 3-5", action: `Pick a date, a capacity, and what ${business} and ${partner.name} each bring.` },
      { when: "Days 6-8", action: `Write a short announcement in both voices and decide the shared perk around ${tag1}.` },
      { when: "Days 9-11", action: "Brief the team, prepare the room, and confirm who is hosting on the day." },
      { when: "Day 14", action: `Run the ${copy.format.toLowerCase()} once. Keep it small and write down, in general terms, who showed up.` },
      { when: "After", action: "Compare notes while it is fresh. Continue only if both crowds actually came." },
    ],
    measure: [
      "How many people used the shared perk",
      "Whether staff noticed new faces mentioning the partner",
      "Repeat visits in the two weeks after",
      "A short note on what to change before any second date",
    ],
    risks: [
      "Overlap is a group-level pattern, not a promise about any person, so treat the first run as a test.",
      "If the room is thin, change the night or the format before you decide the partner was wrong.",
    ],
    outreach: { subject, body },
    limits: LIMITS_TEXT,
    generatedBy: "template",
    model: "template",
  };
}
