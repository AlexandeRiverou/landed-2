// Pilot progression: your score is XP. Each level gives a new rank and a permanent perk for the
// rest of the flight, and your best run is remembered between visits.
const RANKS = [
  'Cadet Who Means Well', 'Sky Intern', 'Junior Wingperson', 'Cloud Botherer', 'Hoop Enthusiast',
  'Ace-ish', 'Loop Lord', 'Captain Of The Clouds', 'Air Marshal Of Nonsense', 'Sky Legend',
  'Mythical Birdperson', 'Supreme Commander Of Up',
];

const PERKS = [
  { text: 'Boost recharges 25% faster', apply: (G) => { G.player.stats.boostRegen *= 1.25; } },
  { text: 'Hull +20', apply: (G) => { G.player.maxHealth += 20; G.player.health += 20; } },
  { text: 'Fire rate +15%', apply: (G) => { G.player.stats.fireRate *= 1.15; } },
  { text: 'Power-ups last 25% longer', apply: (G) => { G.progress.durationMul *= 1.25; } },
  { text: 'Hull repairs twice as fast', apply: (G) => { G.player.stats.regen *= 2; } },
  { text: 'Bullets hit twice as hard', apply: (G) => { G.player.stats.damage = 2; } },
  { text: 'Power-ups show up more often', apply: (G) => { G.progress.spawnMul *= 0.8; } },
  { text: 'Boost tank lasts 30% longer', apply: (G) => { G.player.stats.boostDrain *= 0.7; } },
  { text: 'Hull +20', apply: (G) => { G.player.maxHealth += 20; G.player.health += 20; } },
  { text: 'Power-up grab radius +50%', apply: (G) => { G.progress.pickupMul *= 1.5; } },
];
const LATER_PERK = { text: 'Hull +10', apply: (G) => { G.player.maxHealth += 10; G.player.health += 10; } };

const STORE_KEY = 'landed-best';
const OLD_STORE_KEY = 'loop-de-whoops-best'; // the game's old name: best runs saved under it still count
// Points needed to reach `level`: 250, 750, 1500, 2500, 3750, ... (each level a bit further).
export const xpForLevel = (level) => 125 * (level - 1) * level;

export class Progress {
  constructor(G) {
    this.G = G;
    this.level = 1;
    this.durationMul = 1;
    this.spawnMul = 1;
    this.pickupMul = 1;
    this.perks = [];
    this.best = load();
    this.saveTimer = 0;
    this.el = {
      level: document.getElementById('level'),
      rank: document.getElementById('rank'),
      fill: document.getElementById('xp-fill'),
      next: document.getElementById('xp-next'),
      best: document.getElementById('best'),
    };
    if (this.best.score > 0) {
      this.el.best.textContent = `Your best: ${this.best.score} points · Level ${this.best.level} (${rankFor(this.best.level)})`;
    }
  }

  get rank() { return rankFor(this.level); }

  update(dt) {
    const G = this.G;
    while (G.score >= xpForLevel(this.level + 1)) this.levelUp();
    const lo = xpForLevel(this.level), hi = xpForLevel(this.level + 1);
    this.el.level.textContent = `LVL ${this.level}`;
    this.el.rank.textContent = this.rank;
    this.el.fill.style.width = `${Math.min(100, ((G.score - lo) / (hi - lo)) * 100)}%`;
    this.el.next.textContent = `${hi - G.score} pts to next rank`;
    this.saveTimer -= dt;
    if (this.saveTimer <= 0) { this.saveTimer = 5; this.save(); }
  }

  levelUp() {
    const G = this.G;
    this.level++;
    const perk = PERKS[this.level - 2] || LATER_PERK;
    perk.apply(G);
    this.perks.push(perk.text);
    G.ui.notify(`⭐ Promoted to Level ${this.level}: ${this.rank}! Perk: ${perk.text}.`, 'good', 5, 2);
    G.audio.success();
    G.fx.firework(G.player.pos.clone().addScaledVector(G.player.up, 40).addScaledVector(G.player.right, 60));
    const panel = document.getElementById('topleft');
    panel.classList.remove('levelup');
    void panel.offsetWidth;
    panel.classList.add('levelup');
    this.save();
  }

  save() {
    const G = this.G;
    if (G.score <= this.best.score && this.level <= this.best.level) return;
    this.best = { score: Math.max(G.score, this.best.score), level: Math.max(this.level, this.best.level) };
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.best)); } catch { /* private mode: no record, no problem */ }
  }
}

function rankFor(level) { return RANKS[Math.min(level, RANKS.length) - 1]; }

function load() {
  try {
    const b = JSON.parse(localStorage.getItem(STORE_KEY) || localStorage.getItem(OLD_STORE_KEY) || 'null');
    if (b && Number.isFinite(b.score) && Number.isFinite(b.level)) return b;
  } catch { /* storage unavailable */ }
  return { score: 0, level: 1 };
}
