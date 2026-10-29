// All the jokes live here. Mission control has a lot of feelings.

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmt = (s, noun = 'the objective') => s.replace(/\{noun\}/g, noun).replace(/\{Noun\}/g, cap(noun));

export function weightedPick(items, weightOf) {
  let total = 0;
  for (const it of items) total += weightOf(it);
  let r = Math.random() * total;
  for (const it of items) { r -= weightOf(it); if (r <= 0) return it; }
  return items[items.length - 1];
}

export const T = {
  intro: [
    "Welcome, pilot! Your license was approved mostly by accident.",
    "Flight school called. They want their plane back. Let's go anyway.",
    "Reminder: the ground is undefeated. Please avoid it.",
    "Today's forecast: 100% chance of objectives.",
  ],
  newObjective: [
    "New objective just dropped!",
    "Fresh objective, still warm.",
    "Objective delivered. Please sign here.",
    "Mission control has a new request. They said please.",
  ],
  nag: [
    "Hey. Hey you. {Noun} is waiting.",
    "Just a gentle reminder that {noun} exists.",
    "Are you sightseeing? We're on a schedule here.",
    "{Noun} misses you. It told us. Unprompted.",
    "Our analytics show you are NOT near {noun}.",
    "Pilot, please confirm you remember {noun}.",
    "Mission control is tapping its fingers. Loudly.",
    "Pssst. {Noun}. Remember? Shiny? Important?",
    "Scenic route detected. Scenic route not approved.",
    "We're not mad. We're just disappointed. Mostly mad.",
  ],
  guilt: [
    "{Noun} has started writing sad poetry about you.",
    "{Noun} set the table for two. You never came.",
    "{Noun} is fine. Totally fine. Not crying. YOU'RE crying.",
    "We told {noun} you were stuck in traffic. In the sky.",
    "{Noun}'s mom called. She's disappointed.",
    "{Noun} just changed its relationship status to 'complicated'.",
  ],
  wrongWay: [
    "WRONG WAY! Unless you're planning a really big loop around the planet.",
    "Bold strategy, flying AWAY from the objective. Let's see if it pays off.",
    "You're going the wrong way. {Noun} is behind you. Crying.",
    "U-turn recommended. Strongly. With feeling.",
    "Our GPS just said 'lol'.",
    "The objective is in the OTHER direction. All of the other directions, really.",
  ],
  close: [
    "Ooh, you're getting warmer!",
    "Close! Don't mess it up now!",
    "{Noun} can see you! It's waving!",
    "Almost there. Breathe. Steer. Win.",
  ],
  nearMiss: [
    "SO CLOSE. The hoop felt the breeze.",
    "Missed by a hair. A big, plane-sized hair.",
    "Almost! The hoop flinched.",
    "That was... adjacent to success.",
  ],
  successTitle: [
    "NAILED IT!", "LOOP-TASTIC!", "SKY LEGEND!", "OBJECTIVE OBLITERATED!", "WOW, ACTUAL SKILL!",
    "CERTIFIED PILOT MOMENT!", "THE CROWD GOES MILD!", "MAGNIFICENT!", "BIG PLANE ENERGY!", "AERODYNAMIC GENIUS!",
  ],
  worldChange: [
    "Reality reorganizes itself in your honor:",
    "The world reacts to your greatness:",
    "Patch notes for the universe:",
    "Meanwhile, in the environment department:",
  ],
  crashGround: [
    "You have successfully located the ground.",
    "Terrain: 1, You: 0.",
    "That mountain came out of nowhere. (It's been there for 40 million years.)",
    "Landing score: 0/10. Enthusiasm: 10/10.",
    "Lithobraking is not an approved maneuver.",
    "The ground says hi. Very firmly.",
  ],
  crashWater: [
    "Splash! The fish are filing a complaint.",
    "Planes are not submarines. Noted for next time.",
    "You're a boat now. A bad boat.",
    "Water landing! Minus the landing part.",
  ],
  crashEnemy: [
    "Shot down. Your pride took most of the damage.",
    "Your plane has been politely disassembled.",
    "Defeated by enemies who don't even have a backstory.",
  ],
  respawn: [
    "New plane, who dis?",
    "Insurance covered it. Somehow.",
    "Respawned. The plane factory is getting suspicious.",
    "Back in the air! Nobody saw that. Probably.",
  ],
  kill: [
    "Bonk!",
    "Enemy converted to confetti.",
    "That one had a family. Of other drones.",
    "Pew pew! Very successful pew.",
    "Target neutralized. And slightly embarrassed.",
  ],
  hurt: ["Ouch!", "Hull says ow.", "That'll leave a dent.", "Rude!", "Hey! That's a rental!"],
  trophy: [
    "PARTICIPATION TROPHY! We completed the objective for you. Mom is proud.",
    "Objective auto-completed out of pity. You still get points! A few.",
    "Fine. FINE. We'll count it. Nobody tell the other pilots.",
  ],
  goose: ["HONK.", "HONK HONK. (catch me if you can)", "The goose is laughing at you.", "HONK!!! (that was rude)", "The goose filed a restraining order."],
  ceiling: ["Space is closed today. Please turn around.", "Too high! The air up here is mostly opinions."],
  fail: [
    "Time's up! The hoop got bored and left.",
    "Too slow! The objective has moved on with its life.",
  ],
  pause: [
    "The sky will wait. It has nowhere else to be.",
    "Paused. The enemies are also taking a snack break.",
    "Even pilots need a juice box.",
  ],
};
