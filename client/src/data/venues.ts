/**
 * The places inside each island.
 *
 * The map used to show ten numbered dots per island, which told the learner
 * nothing except how far along they were. Each island is now somewhere you
 * stand outside and then walk into, and the ten days are ten places within it:
 * the threshold, the courtyard, the prayer hall, the minaret stair.
 *
 * The order matters. Places run from the way in to the furthest point, so
 * moving through an island reads as moving through a building or a landscape
 * rather than counting off a list. Day 31 is the door; day 40 is the top of the
 * stair.
 *
 * This is deliberately only data. The art and the interface read from it, and
 * a missing or duplicated place fails a test here rather than rendering as a
 * blank waypoint.
 */

export type Venue = {
  phaseId: number;
  /** What the island is called when you are standing outside it. */
  exterior: string;
  /** One line for the outside view, shown before you go in. */
  approach: string;
  /** Ten places, in the order the days run. */
  places: string[];
};

export const venues: Venue[] = [
  {
    phaseId: 1,
    exterior: "Firstlight Cove",
    approach: "A shoreline at dawn, before anyone has decided what the day is for.",
    places: [
      "The Landing", "The Tide Line", "Driftwood Bench", "Wayfinding Post", "The Rockpools",
      "The Dunes", "Signal Fire", "The Sheltered Side", "First Path", "Cove Head",
    ],
  },
  {
    phaseId: 2,
    exterior: "Lantern Gardens",
    approach: "A walled garden lit one lamp at a time, so you only ever see the next few steps.",
    places: [
      "The Garden Gate", "Lantern Walk", "The Still Pond", "The Cloister", "Herb Beds",
      "The Long Hedge", "Stone Steps", "The Old Fig", "Night Terrace", "The Far Lamp",
    ],
  },
  {
    phaseId: 3,
    exterior: "Training Ridge",
    approach: "A rocky trail that goes up whichever way you look at it.",
    places: [
      "Base Camp", "First Switchback", "The Scree", "Stone Cairn", "Wind Gap",
      "The Ledge", "Rope Line", "The False Summit", "Shelter Hut", "Ridge Crest",
    ],
  },
  {
    phaseId: 4,
    exterior: "Sakina Point",
    approach: "A masjid at night, dome lit from within, the door already open.",
    places: [
      "The Threshold", "The Wudu Fountain", "The Courtyard", "The Prayer Hall", "The Mihrab",
      "The Minbar", "The Quiet Corner", "The Reading Room", "The Lamp Alcove", "The Minaret Stair",
    ],
  },
  {
    phaseId: 5,
    exterior: "Bridgehaven",
    approach: "A town built on both banks, joined by more bridges than it strictly needs.",
    places: [
      "The Near Bank", "The Toll House", "First Span", "The Meeting Stone", "Mid-Bridge",
      "The Lamp Post", "The Repair Yard", "The Far Bank", "The Guest House", "The Old Crossing",
    ],
  },
  {
    phaseId: 6,
    exterior: "Wildwood Valley",
    approach: "An open valley with room to breathe and shade when you need it.",
    places: [
      "The Valley Mouth", "The Spring", "The Orchard", "The Clearing", "The Long Meadow",
      "The Deep Wood", "The Fallen Oak", "The Quiet Bend", "The Hearth", "The Old Evergreen",
    ],
  },
  {
    phaseId: 7,
    exterior: "Maker’s Quay",
    approach: "A working harbour where nothing is finished and everything is in progress.",
    places: [
      "The Quayside", "The Workbench", "The Sail Loft", "The Drawing Table", "The Forge",
      "The Rope Walk", "The Slipway", "The Test Tank", "The Paint Shed", "The Launch",
    ],
  },
  {
    phaseId: 8,
    exterior: "Value Harbour",
    approach: "A sheltered harbour where things are brought ashore and put to use.",
    places: [
      "The Harbour Wall", "The Sounding Board", "The Bell Tower", "The Storyteller’s Step", "The Gatehouse",
      "The Wash House", "The Long Mirror", "The Practice Yard", "The Common Room", "The Signal Tower",
    ],
  },
  {
    phaseId: 9,
    exterior: "Common Ground",
    approach: "A hillside where the paths from every direction happen to meet.",
    places: [
      "The Gathering Stone", "The Watch Post", "The Council Ring", "The Well", "The Long Table",
      "The Repair Bench", "The Shared Field", "The Weighing Scales", "The Crossroads", "The Beacon",
    ],
  },
  {
    phaseId: 10,
    exterior: "The Summit",
    approach: "The last rise, with everything you walked through visible behind you.",
    places: [
      "The Final Approach", "The Boundary Stone", "The Long View", "The Shelter", "The Marker",
      "The Turning Point", "The Open Sky", "The Written Stone", "The Last Step", "The Summit Cairn",
    ],
  },
];

const DAYS_PER_ISLAND = 10;

export const venueFor = (phaseId: number) => venues.find((venue) => venue.phaseId === phaseId);

/**
 * The place a given day happens in. Falls back to a plain day label rather
 * than an empty string, so a missing venue degrades to something readable.
 */
export function placeFor(day: number): string {
  const venue = venueFor(Math.floor((day - 1) / DAYS_PER_ISLAND) + 1);
  return venue?.places[(day - 1) % DAYS_PER_ISLAND] ?? `Day ${day}`;
}

/** How far into the island a day sits, for the interface to show a route. */
export const placeIndex = (day: number) => (day - 1) % DAYS_PER_ISLAND;
