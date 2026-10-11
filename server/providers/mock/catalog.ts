import type { EntityType, PartnerKind } from "@shared/types";
import { type TagId, isTag } from "./taxonomy.js";

export interface CatalogEntry {
  id: string;
  name: string;
  aliases?: string[];
  kind: PartnerKind;
  entityType: EntityType;
  city?: string;
  neighbourhood?: string;
  blurb: string;
  tags: Record<string, number>;
  audienceTags: string[];
  popularity: number;
  trend: number;
}

const WEIGHTS = [1, 0.9, 0.8, 0.7, 0.6, 0.5] as const;

function tags(ids: TagId[]): Record<string, number> {
  const out: Record<string, number> = {};
  ids.forEach((id, index) => {
    const weight = WEIGHTS[index];
    if (weight !== undefined) out[id] = weight;
  });
  return out;
}

function entry(
  id: string,
  name: string,
  kind: PartnerKind,
  entityType: EntityType,
  tagIds: TagId[],
  audienceTags: TagId[],
  popularity: number,
  trend: number,
  blurb: string,
  extra?: { city?: string; neighbourhood?: string; aliases?: string[] },
): CatalogEntry {
  for (const tag of [...tagIds, ...audienceTags]) {
    if (!isTag(tag)) throw new Error(`Unknown tag ${tag} on ${id}`);
  }
  return {
    id,
    name,
    kind,
    entityType,
    tags: tags(tagIds),
    audienceTags,
    popularity,
    trend,
    blurb,
    ...extra,
  };
}

export const CATALOG: CatalogEntry[] = [
  entry("aesop", "Aesop", "retail", "brand", ["minimalist", "skincare", "design", "slow_living", "premium"], ["bookish", "specialty_coffee", "art_house_film"], 0.9, 0.1, "A skincare and home brand known for quiet stores and plain packaging.", { aliases: ["aesop"] }),
  entry("patagonia", "Patagonia", "fashion", "brand", ["outdoors", "eco_conscious", "sustainable_fashion", "climbing", "community"], ["running", "specialty_coffee", "travel"], 0.9, 0.2, "Outdoor clothing with a long-running repair and environmental stance.", { aliases: ["patagonia"] }),
  entry("adidas-originals", "Adidas Originals", "fashion", "brand", ["sneakers", "streetwear", "hip_hop", "vintage", "nightlife"], ["indie_music", "electronic", "hip_hop"], 0.95, 0, "The archive side of Adidas, built around trainers and streetwear.", { aliases: ["adidas", "adidas originals"] }),
  entry("carhartt-wip", "Carhartt WIP", "fashion", "brand", ["streetwear", "vintage", "craft", "indie_music", "design"], ["vinyl", "specialty_coffee", "design"], 0.8, 0.15, "Workwear cut for cities, often stocked beside records and coffee.", { aliases: ["carhartt"] }),
  entry("vans", "Vans", "fashion", "brand", ["sneakers", "streetwear", "indie_music", "vintage", "nightlife"], ["craft_beer", "street_food", "gaming"], 0.9, 0, "Canvas trainers tied to skate shops, gigs and casual wear.", { aliases: ["vans"] }),
  entry("allbirds", "Allbirds", "fashion", "brand", ["sustainable_fashion", "minimalist", "eco_conscious", "running", "tech"], ["startup", "specialty_coffee", "travel"], 0.7, -0.15, "Simple wool shoes that had a long run in tech offices.", { aliases: ["allbirds"] }),
  entry("bandcamp", "Bandcamp", "music", "brand", ["indie_music", "vinyl", "community", "craft", "electronic"], ["specialty_coffee", "art_house_film", "bookish"], 0.75, 0.2, "A shop where listeners pay artists directly for music and merch.", { aliases: ["bandcamp"] }),
  entry("spotify", "Spotify", "music", "brand", ["indie_music", "hip_hop", "electronic", "podcasts", "tech"], ["travel", "gaming", "nightlife"], 0.98, 0, "The default streaming app for music and podcasts.", { aliases: ["spotify"] }),
  entry("ninja-tune", "Ninja Tune", "music", "brand", ["electronic", "indie_music", "vinyl", "jazz", "nightlife"], ["design", "art_house_film", "specialty_coffee"], 0.55, 0.15, "An independent label spanning electronic music, jazz and left-field pop.", { aliases: ["ninja tune"] }),
  entry("fender", "Fender", "music", "brand", ["live_music", "craft", "vintage", "jazz", "indie_music"], ["craft_beer", "vinyl", "streetwear"], 0.85, -0.05, "The guitar brand most people picture when a band plugs in.", { aliases: ["fender"] }),
  entry("radiohead", "Radiohead", "music", "artist", ["indie_music", "electronic", "art_house_film", "design", "vinyl"], ["specialty_coffee", "bookish", "minimalist"], 0.9, -0.05, "A band whose records still sit at the centre of a lot of indie taste.", { aliases: ["radiohead"] }),
  entry("fred-again", "Fred again..", "music", "artist", ["electronic", "nightlife", "live_music", "community", "indie_music"], ["running", "streetwear", "craft_beer"], 0.85, 0.3, "Electronic sets built from voice notes, clubs and everyday samples.", { aliases: ["fred again", "fred again.."] }),
  entry("little-simz", "Little Simz", "music", "artist", ["hip_hop", "live_music", "theatre", "design", "community"], ["streetwear", "specialty_coffee", "art_house_film"], 0.75, 0.25, "A London rapper whose shows draw a crowd that also follows theatre and design.", { aliases: ["little simz"] }),
  entry("glossier", "Glossier", "retail", "brand", ["skincare", "minimalist", "wellness", "community", "premium"], ["pilates", "brunch", "specialty_coffee"], 0.8, -0.1, "A skincare brand that grew through word of mouth and plain pink packaging.", { aliases: ["glossier"] }),
  entry("teenage-engineering", "Teenage Engineering", "retail", "brand", ["design", "electronic", "tech", "craft", "minimalist"], ["vinyl", "indie_music", "specialty_coffee"], 0.6, 0.2, "Small electronic instruments and speakers designed like objects.", { aliases: ["teenage engineering"] }),
  entry("oatly", "Oatly", "food", "brand", ["plant_based", "eco_conscious", "specialty_coffee", "design", "community"], ["yoga", "running", "indie_music"], 0.85, -0.05, "Oat drink that became the default in a lot of coffee shops.", { aliases: ["oatly"] }),
  entry("tonys-chocolonely", "Tony's Chocolonely", "food", "brand", ["community", "eco_conscious", "design", "brunch", "local_pride"], ["family", "travel", "bookish"], 0.6, 0.1, "Chunky chocolate bars sold with a loud fair-trade message.", { aliases: ["tony's", "tonys", "tony chocolonely"] }),
  entry("brewdog", "BrewDog", "drink", "brand", ["craft_beer", "nightlife", "community", "street_food", "live_music"], ["streetwear", "gaming", "sneakers"], 0.85, -0.1, "A beer brand with bars, loud cans and a punk-leaning crowd.", { aliases: ["brewdog"] }),
  entry("pukka-herbs", "Pukka Herbs", "wellness", "brand", ["tea", "wellness", "eco_conscious", "yoga", "slow_living"], ["pilates", "bookish", "plant_based"], 0.6, 0, "Herbal teas stacked beside yoga mats and whole foods.", { aliases: ["pukka"] }),
  entry("headspace", "Headspace", "wellness", "brand", ["wellness", "slow_living", "tech", "podcasts", "yoga"], ["specialty_coffee", "bookish", "travel"], 0.8, -0.1, "A meditation app people open between meetings and on trains.", { aliases: ["headspace"] }),
  entry("lululemon", "Lululemon", "fitness", "brand", ["yoga", "pilates", "running", "wellness", "premium"], ["specialty_coffee", "brunch", "travel"], 0.9, 0.05, "Stretch clothing that moved from yoga studios into everyday wear.", { aliases: ["lululemon"] }),
  entry("strava", "Strava", "fitness", "brand", ["running", "community", "tech", "outdoors", "strength"], ["specialty_coffee", "craft_beer", "travel"], 0.85, 0.1, "The app runners and cyclists use to log routes and clubs.", { aliases: ["strava"] }),
  entry("on-running", "On Running", "fitness", "brand", ["running", "design", "minimalist", "premium", "outdoors"], ["specialty_coffee", "travel", "design"], 0.75, 0.3, "Swiss running shoes with a cloud sole, now common on city pavements.", { aliases: ["on running", "on cloud"] }),
  entry("peloton", "Peloton", "fitness", "brand", ["strength", "tech", "wellness", "community", "premium"], ["startup", "podcasts", "tech"], 0.8, -0.2, "At-home bikes and classes that peaked and then settled into a smaller crowd.", { aliases: ["peloton"] }),
  entry("polaroid", "Polaroid", "culture", "brand", ["photography", "vintage", "design", "craft", "art_house_film"], ["indie_music", "vinyl", "specialty_coffee"], 0.75, 0.1, "Instant cameras that never quite left parties, studios and zines.", { aliases: ["polaroid"] }),
  entry("moleskine", "Moleskine", "culture", "brand", ["bookish", "design", "craft", "travel", "minimalist"], ["specialty_coffee", "art_house_film", "tea"], 0.8, -0.1, "Pocket notebooks carried by people who still write things down.", { aliases: ["moleskine"] }),
  entry("kinfolk", "Kinfolk", "culture", "brand", ["design", "slow_living", "bookish", "minimalist", "photography"], ["specialty_coffee", "natural_wine", "tea"], 0.55, -0.05, "A magazine of quiet rooms, long tables and slow weekends.", { aliases: ["kinfolk"] }),
  entry("fever-tree", "Fever-Tree", "drink", "brand", ["cocktails", "premium", "design", "nightlife", "craft"], ["natural_wine", "nightlife", "specialty_coffee"], 0.72, 0.05, "Mixers poured in bars that care what the tonic tastes like.", { aliases: ["fever tree", "fever-tree"] }),
  entry("ace-hotel", "Ace Hotel", "venue", "brand", ["travel", "design", "nightlife", "specialty_coffee", "indie_music"], ["vinyl", "brunch", "photography"], 0.75, 0.05, "Hotels with lobbies that double as coffee shops and gig rooms.", { aliases: ["ace hotel"] }),
  entry("dice", "Dice", "venue", "brand", ["live_music", "nightlife", "indie_music", "electronic", "community"], ["streetwear", "craft_beer", "vinyl"], 0.72, 0.2, "A ticketing app people use when they actually plan to show up.", { aliases: ["dice.fm", "dice fm"] }),
  entry("rapha", "Rapha", "fitness", "brand", ["outdoors", "running", "design", "premium", "community"], ["specialty_coffee", "travel", "slow_living"], 0.68, 0.12, "Cycling kit sold from clubhouses that also pour coffee.", { aliases: ["rapha"] }),
  entry("cos", "COS", "fashion", "brand", ["minimalist", "designer", "design", "premium", "slow_living"], ["art_house_film", "specialty_coffee", "bookish"], 0.78, 0.04, "Tailored basics in muted colours, closer to a gallery shop than a high street pile.", { aliases: ["cos"] }),
  entry("the-ordinary", "The Ordinary", "retail", "brand", ["skincare", "minimalist", "wellness", "budget_friendly", "design"], ["specialty_coffee", "yoga", "tech"], 0.84, 0.08, "Clinical skincare in dropper bottles, priced so people actually repurchase.", { aliases: ["the ordinary"] }),
  entry("monocle", "Monocle", "culture", "brand", ["design", "travel", "premium", "bookish", "local_pride"], ["specialty_coffee", "brunch", "jazz"], 0.58, -0.04, "A magazine and shop for people who notice cities, paper and cafés.", { aliases: ["monocle"] }),

  entry("dalston-record-club", "Dalston Record Club", "music", "place", ["vinyl", "indie_music", "community", "nightlife", "craft_beer"], ["specialty_coffee", "design", "art_house_film"], 0.72, 0.18, "A listening bar where selectors play records and people stay for one more.", { city: "London", neighbourhood: "Dalston" }),
  entry("kiln-climbing", "Kiln Climbing", "fitness", "place", ["climbing", "community", "strength", "outdoors", "craft_beer"], ["specialty_coffee", "vinyl", "travel"], 0.7, 0.22, "A climbing gym with a small bar and a crowd that lingers after the session.", { city: "London", neighbourhood: "Hackney Wick" }),
  entry("the-lantern-room", "The Lantern Room", "venue", "place", ["live_music", "jazz", "nightlife", "cocktails", "craft"], ["natural_wine", "design", "theatre"], 0.68, 0.12, "A small room for jazz and quiet bands, with cocktails rather than a full menu.", { city: "London", neighbourhood: "Soho" }),
  entry("slow-studio-pilates", "Slow Studio Pilates", "wellness", "place", ["pilates", "yoga", "wellness", "slow_living", "minimalist"], ["specialty_coffee", "brunch", "skincare"], 0.74, 0.2, "A pilates studio that keeps the lights low and the playlists even lower.", { city: "London", neighbourhood: "Clapton" }),
  entry("thread-and-needle", "Thread & Needle", "fashion", "place", ["vintage", "sustainable_fashion", "streetwear", "craft", "indie_music"], ["vinyl", "specialty_coffee", "photography"], 0.66, 0.16, "A rail of repaired vintage and small labels, a few doors from the market.", { city: "London", neighbourhood: "Shoreditch" }),
  entry("peckham-print-shop", "Peckham Print Shop", "culture", "place", ["design", "craft", "photography", "art_house_film", "community"], ["indie_music", "specialty_coffee", "bookish"], 0.63, 0.14, "A print studio that runs short zine nights and rents the press by the hour.", { city: "London", neighbourhood: "Peckham" }),
  entry("grain-and-gather", "Grain & Gather Bakery", "food", "place", ["bakery", "brunch", "plant_based", "community", "slow_living"], ["specialty_coffee", "family", "local_pride"], 0.77, 0.1, "A neighbourhood bakery with a short brunch menu and a queue on Saturdays.", { city: "London", neighbourhood: "Clapton" }),
  entry("orchard-natural-wine", "Orchard Natural Wine", "drink", "place", ["natural_wine", "community", "nightlife", "design", "street_food"], ["indie_music", "vinyl", "art_house_film"], 0.71, 0.24, "A wine bar pouring small producers, with snacks and a late last sitting.", { city: "London", neighbourhood: "Dalston" }),
  entry("the-page-turner", "The Page Turner", "culture", "place", ["bookish", "design", "community", "slow_living", "tea"], ["specialty_coffee", "art_house_film", "family"], 0.69, 0.06, "An independent bookshop with a back room for readings and a pot of tea.", { city: "London", neighbourhood: "Islington" }),
  entry("hackney-run-social", "Hackney Run Social", "fitness", "place", ["running", "community", "craft_beer", "outdoors", "strength"], ["specialty_coffee", "streetwear", "travel"], 0.73, 0.28, "A running club that meets by the marshes and ends at a single pub.", { city: "London", neighbourhood: "Hackney Wick" }),
  entry("shoreditch-object-shop", "Shoreditch Object Shop", "retail", "place", ["design", "craft", "minimalist", "local_pride", "specialty_coffee"], ["bookish", "indie_music", "photography"], 0.64, 0.11, "A shop of home objects from local makers, with a coffee hatch at the front.", { city: "London", neighbourhood: "Shoreditch" }),
  entry("marylebone-tea-atelier", "Marylebone Tea Atelier", "drink", "place", ["tea", "wellness", "premium", "slow_living", "design"], ["bookish", "skincare", "brunch"], 0.67, 0.05, "A narrow tea room that takes the leaves as seriously as a wine bar takes bottles.", { city: "London", neighbourhood: "Marylebone" }),
  entry("brixton-sunday-table", "Brixton Sunday Table", "food", "place", ["street_food", "community", "brunch", "local_pride", "family"], ["live_music", "hip_hop", "specialty_coffee"], 0.7, 0.15, "A weekend table of shared plates that grew out of the market stalls.", { city: "London", neighbourhood: "Brixton" }),
  entry("battersea-reformer", "Battersea Reformer", "wellness", "place", ["pilates", "wellness", "running", "premium", "minimalist"], ["brunch", "specialty_coffee", "skincare"], 0.76, 0.19, "A reformer studio beside the park, booked solid before work.", { city: "London", neighbourhood: "Battersea" }),

  entry("northern-quarter-vinyl", "Northern Quarter Vinyl", "music", "place", ["vinyl", "indie_music", "community", "nightlife", "vintage"], ["specialty_coffee", "craft_beer", "streetwear"], 0.74, 0.16, "A record shop that stays open late when there is a listening session upstairs.", { city: "Manchester", neighbourhood: "Northern Quarter" }),
  entry("the-foundry-gigs", "The Foundry Gigs", "venue", "place", ["live_music", "indie_music", "nightlife", "craft_beer", "community"], ["vinyl", "streetwear", "street_food"], 0.71, 0.2, "A small room for touring bands, with beer in plastic cups and a low ceiling.", { city: "Manchester", neighbourhood: "Ancoats" }),
  entry("ancoats-climbing-yard", "Ancoats Climbing Yard", "fitness", "place", ["climbing", "strength", "community", "outdoors", "craft_beer"], ["specialty_coffee", "running", "travel"], 0.69, 0.26, "An indoor yard that fills up after work and empties into the street outside.", { city: "Manchester", neighbourhood: "Ancoats" }),
  entry("brick-and-bean", "Brick & Bean Roasters", "food", "place", ["specialty_coffee", "bakery", "community", "brunch", "local_pride"], ["indie_music", "design", "bookish"], 0.8, 0.12, "A roastery with a short pastry case and seats that go first to regulars.", { city: "Manchester", neighbourhood: "Ancoats" }),
  entry("salford-sound-collective", "Salford Sound Collective", "music", "place", ["electronic", "indie_music", "nightlife", "community", "craft"], ["streetwear", "craft_beer", "vinyl"], 0.62, 0.3, "A collective that puts on electronic nights and lends the booth to local DJs.", { city: "Manchester", neighbourhood: "Salford Quays" }),
  entry("castlefield-print-co", "Castlefield Print Co.", "culture", "place", ["design", "craft", "photography", "community", "bookish"], ["specialty_coffee", "indie_music", "tea"], 0.6, 0.08, "A print cooperative that sells small runs and hosts one public night a month.", { city: "Manchester", neighbourhood: "Castlefield" }),
  entry("chorlton-cellar", "Chorlton Cellar", "drink", "place", ["natural_wine", "community", "slow_living", "street_food", "indie_music"], ["bakery", "vinyl", "bookish"], 0.66, 0.18, "A cellar bar with a short wine list and snacks from the bakery next door.", { city: "Manchester", neighbourhood: "Chorlton" }),
  entry("didsbury-flow", "Didsbury Flow", "wellness", "place", ["yoga", "pilates", "wellness", "slow_living", "community"], ["brunch", "specialty_coffee", "family"], 0.73, 0.14, "A neighbourhood studio for yoga and pilates, with a Saturday family class.", { city: "Manchester", neighbourhood: "Didsbury" }),
  entry("spinningfields-cloth", "Spinningfields Cloth", "fashion", "place", ["designer", "minimalist", "premium", "design", "sustainable_fashion"], ["specialty_coffee", "art_house_film", "travel"], 0.64, 0.06, "A quiet clothing shop of small labels, more appointment than footfall.", { city: "Manchester", neighbourhood: "Spinningfields" }),
  entry("ancoats-general-store", "Ancoats General Store", "retail", "place", ["design", "craft", "local_pride", "minimalist", "community"], ["specialty_coffee", "bookish", "bakery"], 0.67, 0.1, "A general store of ceramics, paper and pantry goods from nearby makers.", { city: "Manchester", neighbourhood: "Ancoats" }),
  entry("levenshulme-oven", "Levenshulme Oven", "food", "place", ["bakery", "street_food", "community", "family", "local_pride"], ["specialty_coffee", "brunch", "indie_music"], 0.75, 0.2, "A bakery that sells out of morning buns and keeps a table for neighbours.", { city: "Manchester", neighbourhood: "Levenshulme" }),
  entry("hulme-run-club", "Hulme Run Club", "fitness", "place", ["running", "community", "outdoors", "strength", "local_pride"], ["craft_beer", "street_food", "specialty_coffee"], 0.68, 0.22, "A free weekly run that starts under the flyover and ends with a drink.", { city: "Manchester", neighbourhood: "Hulme" }),

  entry("bushwick-vinyl-exchange", "Bushwick Vinyl Exchange", "music", "place", ["vinyl", "indie_music", "electronic", "nightlife", "community"], ["specialty_coffee", "streetwear", "craft_beer"], 0.73, 0.2, "A shop that buys, sells and plays records, with a listening night on Thursdays.", { city: "New York", neighbourhood: "Bushwick" }),
  entry("blue-door-jazz", "The Blue Door Jazz Room", "venue", "place", ["jazz", "live_music", "cocktails", "nightlife", "craft"], ["natural_wine", "theatre", "design"], 0.7, 0.08, "A narrow jazz room with two sets a night and a short cocktail list.", { city: "New York", neighbourhood: "West Village" }),
  entry("greenpoint-flow", "Greenpoint Flow Studio", "wellness", "place", ["yoga", "pilates", "wellness", "slow_living", "minimalist"], ["specialty_coffee", "plant_based", "skincare"], 0.76, 0.16, "A studio for slow classes, with mats stored in the same calm as the playlists.", { city: "New York", neighbourhood: "Greenpoint" }),
  entry("lower-east-print", "Lower East Print Co.", "culture", "place", ["design", "craft", "photography", "community", "bookish"], ["indie_music", "specialty_coffee", "art_house_film"], 0.65, 0.12, "A print shop that still takes walk-in risograph jobs and hangs local posters.", { city: "New York", neighbourhood: "Lower East Side" }),
  entry("brooklyn-bookbar", "Brooklyn Bookbar", "culture", "place", ["bookish", "natural_wine", "community", "slow_living", "design"], ["specialty_coffee", "art_house_film", "tea"], 0.72, 0.18, "A bookshop with a wine licence and chairs that encourage staying.", { city: "New York", neighbourhood: "Fort Greene" }),
  entry("red-hook-run-crew", "Red Hook Run Crew", "fitness", "place", ["running", "community", "outdoors", "craft_beer", "strength"], ["specialty_coffee", "streetwear", "travel"], 0.69, 0.24, "A waterfront running crew that treats the pier as a meeting point.", { city: "New York", neighbourhood: "Red Hook" }),
  entry("soho-thread-vintage", "SoHo Thread Vintage", "fashion", "place", ["vintage", "streetwear", "sustainable_fashion", "craft", "designer"], ["indie_music", "photography", "specialty_coffee"], 0.78, 0.1, "Edited vintage on a SoHo side street, heavier on denim than costume.", { city: "New York", neighbourhood: "SoHo" }),
  entry("fort-greene-wine", "Fort Greene Natural Wine", "drink", "place", ["natural_wine", "community", "design", "nightlife", "street_food"], ["vinyl", "indie_music", "bookish"], 0.74, 0.22, "A corner wine bar with a chalkboard list and snacks from one kitchen.", { city: "New York", neighbourhood: "Fort Greene" }),
  entry("williamsburg-batch", "Williamsburg Batch", "food", "place", ["bakery", "brunch", "specialty_coffee", "community", "design"], ["indie_music", "vinyl", "slow_living"], 0.77, 0.14, "A bakery-cafe with a short brunch and a line that starts before the shutters are fully up.", { city: "New York", neighbourhood: "Williamsburg" }),
  entry("west-village-general", "West Village General Store", "retail", "place", ["design", "craft", "bookish", "minimalist", "local_pride"], ["natural_wine", "specialty_coffee", "slow_living"], 0.66, 0.09, "A shop of paper, ceramics and pantry goods chosen for the block rather than the algorithm.", { city: "New York", neighbourhood: "West Village" }),
  entry("park-slope-clay", "Park Slope Clay Room", "culture", "place", ["craft", "design", "community", "slow_living", "family"], ["bookish", "specialty_coffee", "photography"], 0.63, 0.17, "An evening clay studio with wheels in the window and a cap on class size.", { city: "New York", neighbourhood: "Park Slope" }),
  entry("astoria-evening-bar", "Astoria Evening Bar", "drink", "place", ["cocktails", "nightlife", "community", "street_food", "local_pride"], ["live_music", "family", "craft_beer"], 0.68, 0.11, "A neighbourhood bar that takes the drinks seriously and the room casually.", { city: "New York", neighbourhood: "Astoria" }),
  entry("east-village-stillness", "East Village Stillness", "wellness", "place", ["yoga", "wellness", "slow_living", "minimalist", "community"], ["vinyl", "specialty_coffee", "skincare"], 0.64, 0.13, "A small yoga room above a record shop, booked mostly by people who live nearby.", { city: "New York", neighbourhood: "East Village" }),
  entry("harlem-soundcheck", "Harlem Soundcheck", "music", "place", ["jazz", "live_music", "hip_hop", "community", "nightlife"], ["theatre", "street_food", "local_pride"], 0.71, 0.21, "A rehearsal room that opens to the public for one listening set a week.", { city: "New York", neighbourhood: "Harlem" }),
];
