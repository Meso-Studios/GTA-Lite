// Story missions & high-action contracts across all of San Nova (14 multi-stage missions).
// Each mission is a deterministic state machine driven by Game.updateMissions.
import { DECK, RURAL_GAS_STATIONS, blockCenter, roadLine } from './config';
import type { Game } from './Game';
import type { Vehicle } from './vehicle';
import type { Ped } from './ped';

export type MissionCategory = 'driving' | 'combat' | 'heist' | 'aerial' | 'racing' | 'stealth';

export interface MissionDef {
  id: string;
  title: string;
  district: string;
  category: MissionCategory;
  summary: string;
  reward: number;
  giver: { x: number; z: number; name: string };
  briefing: string[];
  start(g: Game, s: any): void;
  update(g: Game, dt: number, s: any): void;
  cleanup?(g: Game, s: any): void;
}

const dist = (g: Game, x: number, z: number) => Math.hypot(g.playerX - x, g.playerZ - z);

function expandRoute(c: [number, number][]): [number, number][] {
  const out: [number, number][] = [c[0]];
  for (let i = 1; i < c.length; i++) {
    let [k, l] = out[out.length - 1];
    const [tk, tl] = c[i];
    while (k !== tk) { k += Math.sign(tk - k); out.push([k, l]); }
    while (l !== tl) { l += Math.sign(tl - l); out.push([k, l]); }
  }
  return out;
}

const parkCenter = { x: blockCenter(2), z: blockCenter(1) };

export const MISSIONS: MissionDef[] = [
  // ------------------------------------------------------------------ 1
  {
    id: 'm1',
    title: 'First Wheels',
    district: 'Downtown',
    category: 'driving',
    summary: 'Boost a tuned red Vortex GT and run a timed downtown test loop.',
    reward: 1500,
    giver: { x: -297.5, z: 22, name: 'Sal' },
    briefing: [
      'Listen up, rookie. San Nova runs on fast steel and I need a wheelman who does not flinch.',
      'That red Vortex GT across the avenue is yours for the afternoon. Hop in and tear through the checkpoints.',
      'Keep it clean and hit the handbrake on tight corners. Bring it back intact and I will double your cut.',
    ],
    start(g, s) {
      s.car = g.spawnVehicle('sports', -276, 22, 0, { paint: 0xc0392b, mission: true, mode: 'idle', tag: 'm1car' });
      s.stage = 0; s.cp = 0; s.out = 0; s.t2 = 135;
      s.pts = [
        [roadLine(2), roadLine(4)],
        [roadLine(4), roadLine(4)],
        [roadLine(4), roadLine(6)],
        [roadLine(2), roadLine(6)],
        [roadLine(2), roadLine(4) + 20],
      ];
      g.setObjective('Get in the red Vortex GT');
    },
    update(g, dt, s) {
      const car: Vehicle = s.car;
      if (car.mode === 'wreck') return g.failMission('The car was destroyed.');
      if (s.stage === 0) {
        g.setGoals([{ x: car.x, z: car.z, kind: 'vehicle', r: 2.5 }]);
        if (g.playerVehicle === car) {
          s.stage = 1;
          g.say('Sal', 'Sweet ride, huh? Tap SPACE for the handbrake on tight turns.', 4);
        }
        return;
      }
      s.t2 -= dt;
      g.setTimer(Math.max(0, s.t2), 'TEST RUN');
      if (s.t2 <= 0) return g.failMission('You ran out of time.');
      if (g.playerVehicle !== car) {
        s.out += dt;
        g.setObjective('Get back in the Vortex GT');
        g.setGoals([{ x: car.x, z: car.z, kind: 'vehicle', r: 2.5 }]);
        if (s.out > 30) g.failMission('You abandoned the car.');
        return;
      }
      s.out = 0;
      const pt = s.pts[s.cp];
      g.setObjective(`Drive through checkpoint ${s.cp + 1} of ${s.pts.length}`);
      g.setGoals([{ x: pt[0], z: pt[1], kind: 'goal', r: 12 }]);
      if (dist(g, pt[0], pt[1]) < 12) {
        s.cp++;
        g.audio.beep(1500, 0.16);
        if (s.cp === 3) g.say('Sal', 'Two checkpoints left — open up that throttle!', 3);
        if (s.cp >= s.pts.length) g.completeMission('Clean driving!');
      }
    },
  },

  // ------------------------------------------------------------------ 2
  {
    id: 'm2',
    title: 'Dock Delivery',
    district: 'East Harbor',
    category: 'driving',
    summary: 'Haul hot contraband across the city while dodging a rival gang ambush.',
    reward: 2500,
    giver: { x: 342, z: 411.5, name: 'Marco' },
    briefing: [
      'Marco. I move cargo through East Harbor — the kind customs never checks.',
      'A loaded Hauler Van is parked by the docks. Run it to the west-side drop before the syndicate spots us.',
      'Watch the intersections — word got out and rival crew might try to box you in.',
    ],
    start(g, s) {
      s.van = g.spawnVehicle('van', 342, 407.9, Math.PI / 2, { paint: 0xe8e8e8, mission: true, mode: 'idle', tag: 'm2van' });
      s.stage = 0; s.out = 0; s.ambushed = false; s.goons = [] as Ped[];
      s.dest = [roadLine(2), roadLine(6)];
      g.setObjective('Get in the Hauler Van');
    },
    update(g, dt, s) {
      const van: Vehicle = s.van;
      if (van.mode === 'wreck') return g.failMission('The cargo was destroyed.');
      if (s.stage === 0) {
        g.setGoals([{ x: van.x, z: van.z, kind: 'vehicle', r: 3 }]);
        if (g.playerVehicle === van) {
          s.stage = 1;
          s.t2 = 165;
          g.setTimer(165, 'DELIVERY');
          g.say('Marco', 'Keep the shiny side up. Every scratch comes out of your cut.', 3.5);
        }
        return;
      }
      s.t2 -= dt;
      g.setTimer(Math.max(0, s.t2), 'DELIVERY');
      if (s.t2 <= 0) return g.failMission('You ran out of time.');
      const hp = Math.round((van.hp / van.maxHp) * 100);
      if (g.playerVehicle !== van) {
        s.out += dt;
        g.setObjective('Get back in the Hauler Van');
        g.setGoals([{ x: van.x, z: van.z, kind: 'vehicle', r: 3 }]);
        if (s.out > 30) g.failMission('You abandoned the cargo.');
        return;
      }
      s.out = 0;
      if (!s.ambushed && dist(g, s.dest[0], s.dest[1]) < 240) {
        s.ambushed = true;
        g.say('Marco', 'Heads up! Rival hitters near the drop — plow through or drop them!', 4);
        s.goons.push(
          g.spawnEnemy('gang', s.dest[0] + 18, s.dest[1] - 12, { weapon: 'pistol', hp: 55, sight: 55, aggro: true, dmg: 4 }),
          g.spawnEnemy('gang', s.dest[0] - 16, s.dest[1] + 14, { weapon: 'smg', hp: 55, sight: 55, aggro: true, dmg: 4 }),
        );
      }
      g.setObjective(`Deliver the van to the west drop-off  ·  cargo ${hp}%`);
      g.setProgress(hp);
      g.setGoals([{ x: s.dest[0], z: s.dest[1], kind: 'goal', r: 12 }]);
      if (dist(g, s.dest[0], s.dest[1]) < 12) {
        if (hp >= 70) { g.player.money += 600; g.ev.onToast('Pristine Cargo Bonus +$600', 'cash'); }
        g.completeMission(hp >= 70 ? 'Pristine cargo bonus!' : 'Cargo delivered.');
      }
    },
  },

  // ------------------------------------------------------------------ 3
  {
    id: 'm3',
    title: 'Midnight Circuit',
    district: 'Midtown Strip',
    category: 'racing',
    summary: 'Beat three tuned Vortex GT street racers in a full-city underground lap.',
    reward: 4000,
    giver: { x: 114, z: -69.5, name: 'Nitro' },
    briefing: [
      'They call me Nitro. Underground racing is my business and tonight the stakes are double.',
      'Bring a fast set of wheels and line up with three of my top drivers downtown.',
      'Cross the finish line in 1st place and the $4,000 pot is yours. Second place gets dust.',
    ],
    start(g, s) {
      const route = expandRoute([[5, 4], [7, 4], [7, 2], [3, 2], [3, 6], [7, 6], [7, 4], [5, 4]]);
      s.route = route;
      s.cps = route
        .map((n, i) => ({ n, i }))
        .filter((q) => q.i > 0 && (q.i % 2 === 0 || q.i === route.length - 1))
        .map((q) => q.n);
      s.cp = 0; s.stage = 0; s.cd = 0;
      s.rivals = [] as Vehicle[];
      const mk = (paint: number, lane: number, before: number, cruise: number) => {
        const v = g.spawnVehicle('sports', 0, 0, 0, { paint, mission: true, mode: 'idle', driver: 'racer', tag: 'rival' });
        v.ai.route = route.map((n) => [n[0], n[1]] as [number, number]);
        v.ai.routeIdx = 0;
        v.ai.finished = false;
        v.placeOnRoad(g, 5, 4, 1, 0, lane, before);
        v.ai.cruise = cruise;
        v.ai.finishAfter = false;
        v.lightsOn = true;
        return v;
      };
      s.rivals.push(
        mk(0x1f77d4, 2.4, 20, 34),
        mk(0xf1c40f, 5.9, 28, 31.5),
        mk(0xff3888, 2.4, 34, 29.5),
      );
      g.setObjective('Drive any fast car to the starting grid downtown');
      s.startPt = [roadLine(5), roadLine(4)];
    },
    update(g, dt, s) {
      const start = s.startPt as number[];
      const rivals: Vehicle[] = s.rivals;
      if (s.stage === 0) {
        g.setGoals([{ x: start[0], z: start[1], kind: 'goal', r: 14 }]);
        if (g.playerVehicle && dist(g, start[0], start[1]) < 22) { s.stage = 1; s.cd = 4; }
        return;
      }
      if (s.stage === 1) {
        s.cd -= dt;
        const n = Math.ceil(s.cd);
        g.setObjective(n > 0 ? `Race starts in ${n}...` : 'GO!');
        g.setGoals([]);
        if (Math.ceil(s.cd + dt) !== n && n > 0) g.audio.beep(700, 0.18);
        if (s.cd <= 0) {
          g.audio.beep(1400, 0.3);
          rivals.forEach((r) => { r.mode = 'racer'; });
          s.stage = 2;
          s.time = 0;
        }
        return;
      }
      s.time += dt;
      if (!g.playerVehicle) {
        s.out = (s.out ?? 0) + dt;
        g.setObjective('Get back in a vehicle!');
        if (s.out > 25) return g.failMission('You dropped out of the race.');
      } else s.out = 0;
      const cp = s.cps[s.cp];
      const nxt = s.cps[s.cp + 1];
      const goals = [{ x: roadLine(cp[0]), z: roadLine(cp[1]), kind: 'goal' as const, r: 13 }];
      if (nxt) goals.push({ x: roadLine(nxt[0]), z: roadLine(nxt[1]), kind: 'goal' as const, r: 8 });
      g.setGoals(goals);
      const idx = s.route.findIndex((q: number[]) => q[0] === cp[0] && q[1] === cp[1]);
      const prog = idx - 1 + Math.max(0, 1 - dist(g, roadLine(cp[0]), roadLine(cp[1])) / 228);
      let place = 1;
      for (const r of rivals) if ((r.ai.finished ? 99 : r.ai.routeIdx) > prog + 0.2) place++;
      const ord = ['1st', '2nd', '3rd', '4th'][Math.min(3, place - 1)];
      g.setObjective(`Checkpoint ${s.cp + 1}/${s.cps.length}  ·  Position ${ord}`);
      for (const r of rivals) if (r.mode === 'wreck') { r.mode = 'idle'; }
      if (dist(g, roadLine(cp[0]), roadLine(cp[1])) < 13) {
        g.audio.beep(1500, 0.14);
        s.cp++;
        if (s.cp >= s.cps.length) {
          const rivalsFinished = rivals.filter((r) => r.ai.finished).length;
          if (rivalsFinished === 0) g.completeMission('King of the street!');
          else g.failMission(`You finished ${['2nd', '3rd', '4th'][Math.min(2, rivalsFinished - 1)]}.`);
          return;
        }
      }
      const done = rivals.filter((r) => r.ai.finished).length;
      if (done >= 1 && s.cp < s.cps.length - 1 && done === rivals.length) g.failMission('The rivals finished before you.');
      if (rivals.some((r) => r.ai.finished) && s.cp < s.cps.length) {
        s.lost = (s.lost ?? 0) + dt;
        if (s.lost > 14) g.failMission('A rival crossed the line first.');
      }
    },
  },

  // ------------------------------------------------------------------ 4
  {
    id: 'm4',
    title: 'Park Takedown',
    district: 'Central Park',
    category: 'combat',
    summary: 'Eliminate Vince and his cartel crew at the gazebo, then survive their backup wave.',
    reward: 5000,
    giver: { x: 0, z: -183.5, name: 'Big Mo' },
    briefing: [
      'Big Mo. A suit named Vince has been skimming half my collections for a month.',
      'He is holding court at the Central Park gazebo with his crew. White suit, fedora — cannot miss him.',
      'Wipe out Vince and watch the north path — his backup squad will rush in as soon as shots ring out.',
    ],
    start(g, s) {
      const cx = parkCenter.x + 22, cz = parkCenter.z + 22;
      s.cx = cx; s.cz = cz;
      s.enemies = [] as Ped[];
      s.target = g.spawnEnemy('target', cx, cz, { weapon: 'revolver', hp: 130, sight: 55, tag: 'target', dmg: 9 });
      s.enemies.push(s.target);
      const offs = [[-10, -8], [10, -8], [-10, 9], [10, 9]];
      offs.forEach(([ox, oz], i) =>
        s.enemies.push(g.spawnEnemy('gang', cx + ox, cz + oz, { weapon: i % 2 ? 'smg' : 'pistol', hp: 70, sight: 48, tag: 'goon', dmg: 5 })),
      );
      g.setObjective("Locate Vince's crew at the Central Park gazebo");
      s.stage = 0; s.wave2 = false;
    },
    update(g, _dt, s) {
      const alive = (s.enemies as Ped[]).filter((p) => !p.dead);
      if (s.stage === 0) {
        g.setGoals([{ x: s.cx, z: s.cz, kind: 'goal', r: 22, beam: true }]);
        if (dist(g, s.cx, s.cz) < 72) {
          s.stage = 1;
          g.say('Big Mo', 'There he is! Light them up and watch your flanks!', 3.5);
        }
        return;
      }
      if (!s.wave2 && (s.target.dead || alive.length <= 2)) {
        s.wave2 = true;
        g.say('Big Mo', 'Reinforcements incoming from the treeline — drop them all!', 4);
        const rOffs = [[-28, -22], [26, -24], [0, -30]];
        rOffs.forEach(([ox, oz], i) => {
          s.enemies.push(
            g.spawnEnemy('gang', s.cx + ox, s.cz + oz, {
              weapon: i === 2 ? 'shotgun' : 'rifle', hp: 75, sight: 65, aggro: true, dmg: 6,
            }),
          );
        });
        return;
      }
      g.setGoals(alive.map((p) => ({ x: p.x, z: p.z, kind: 'enemy' as const, r: 1 })));
      g.setObjective(
        s.target.dead
          ? `Clear remaining syndicate gunmen (${alive.length} left)`
          : `Eliminate Vince and his crew (${alive.length} left)`,
      );
      if (alive.length === 0) g.completeMission('Central Park is ours.');
    },
  },

  // ------------------------------------------------------------------ 5
  {
    id: 'm5',
    title: 'Hot Wheels',
    district: 'Midtown',
    category: 'driving',
    summary: 'Boost a gold prototype supercar under 3-star heat and respray it clean.',
    reward: 6500,
    giver: { x: -342, z: 69.5, name: 'Rico' },
    briefing: [
      'Rico here. A billionaire tech bro left his gold prototype Vortex GT idling downtown.',
      'Boost it and floor it — silent GPS alarm will put three stars on your tail immediately.',
      'Shake SNPD and roll it into the southeast Pay N Spray for a fresh coat.',
    ],
    start(g, s) {
      s.car = g.spawnVehicle('sports', 48.1, -114, 0, { paint: 0xe5b800, mission: true, mode: 'idle', tag: 'm5car' });
      s.stage = 0; s.out = 0;
      g.setObjective('Steal the gold Vortex GT parked downtown');
    },
    update(g, dt, s) {
      const car: Vehicle = s.car;
      if (car.mode === 'wreck') return g.failMission('The prototype was destroyed.');
      if (s.stage === 0) {
        g.setGoals([{ x: car.x, z: car.z, kind: 'vehicle', r: 2.5 }]);
        if (g.playerVehicle === car) {
          s.stage = 1;
          g.setWanted(3);
          g.say('Rico', 'Silent tracker tripped! Three stars — lose the cops before hitting Pay N Spray!', 4);
        }
        return;
      }
      const ps = g.city.places.payspray;
      if (g.playerVehicle !== car) {
        s.out += dt;
        g.setObjective('Get back in the gold Vortex GT');
        g.setGoals([{ x: car.x, z: car.z, kind: 'vehicle', r: 2.5 }]);
        if (s.out > 20) g.failMission('You lost the supercar.');
        return;
      }
      s.out = 0;
      g.setObjective(g.wanted > 0 ? "Lose the cops, then drive to Pay N' Spray" : "Drive to Pay N' Spray");
      g.setGoals([{ x: ps.x, z: ps.z, kind: 'goal', r: ps.r ?? 7 }]);
      if (dist(g, ps.x, ps.z) < (ps.r ?? 7) && g.wanted === 0) g.completeMission('Fresh paint, clean title.');
    },
  },

  // ------------------------------------------------------------------ 6
  {
    id: 'm6',
    title: 'The Big Score',
    district: 'Financial District',
    category: 'heist',
    summary: 'Raid First San Nova Bank, crack the vault under fire, and escape to the Ocean Pier.',
    reward: 15000,
    giver: { x: -100, z: 545, name: 'The Boss' },
    briefing: [
      'You proved yourself. Time for First San Nova Bank — vault is stacked with weekend cash.',
      'Grab the armored black Titan SUV near the plaza, neutralize the bank security, and crack the vault.',
      'The entire precinct will lock down downtown. Make it to the Ocean Pier end clean and we walk away rich.',
    ],
    start(g, s) {
      s.car = g.spawnVehicle('suv', 48.1, 8, 0, { paint: 0x15171a, mission: true, mode: 'idle', tag: 'm6car' });
      s.stage = 0; s.guards = [] as Ped[]; s.crack = 0;
      s.bank = g.city.places.bank;
      g.setObjective('Take the black Titan SUV near the plaza');
    },
    update(g, dt, s) {
      const bank = s.bank as { x: number; z: number };
      if (s.stage === 0) {
        g.setGoals([{ x: s.car.x, z: s.car.z, kind: 'vehicle', r: 3 }]);
        if (g.playerVehicle === s.car) s.stage = 1;
        return;
      }
      if (s.stage === 1) {
        g.setObjective('Drive to First San Nova Bank entrance');
        g.setGoals([{ x: bank.x, z: bank.z, kind: 'goal', r: 5 }]);
        if (dist(g, bank.x, bank.z) < 10) {
          s.stage = 2;
          g.setWanted(4);
          const offs = [[-16, 12], [16, 12], [-14, 32], [14, 32], [0, 38]];
          offs.forEach(([ox, oz], i) =>
            s.guards.push(
              g.spawnEnemy('guard', bank.x + ox, bank.z + oz, {
                weapon: i % 2 ? 'smg' : 'rifle', hp: 80, sight: 70, aggro: true, dmg: 6, acc: 1.05,
              }),
            ),
          );
          g.say('The Boss', 'Vault alarm tripped! Neutralize the security team!', 3.5);
        }
        return;
      }
      if (s.stage === 2) {
        const alive = (s.guards as Ped[]).filter((p) => !p.dead);
        g.setObjective(`Neutralize bank security (${alive.length} left)`);
        g.setGoals(alive.map((p) => ({ x: p.x, z: p.z, kind: 'enemy' as const, r: 1 })));
        if (g.wanted < 3) g.setWanted(3);
        if (alive.length === 0) { s.stage = 3; g.say('The Boss', 'Hold the vault door while the thermal drill cuts through!', 4); }
        return;
      }
      if (s.stage === 3) {
        g.setGoals([{ x: bank.x, z: bank.z, kind: 'goal', r: 4.5 }]);
        if (dist(g, bank.x, bank.z) < 5) {
          s.crack += dt;
          g.setObjective('Drilling the vault... hold your position');
          g.setProgress(Math.min(100, (s.crack / 6) * 100));
          if (s.crack >= 6) {
            s.stage = 4;
            g.setProgress(null);
            g.setWanted(5);
            g.player.money += 5000;
            g.ev.onToast('Vault Cash Bagged +$5,000', 'cash');
            g.say('The Boss', 'Bags are full! Break out to the end of Ocean Pier!', 4);
          }
        } else { g.setObjective('Return to the vault door'); s.crack = Math.max(0, s.crack - dt); g.setProgress(null); }
        return;
      }
      const px = -150, pz = 695;
      g.setGoals([{ x: px, z: pz, kind: 'goal', r: 9 }]);
      if (dist(g, px, pz) < 15) {
        if (g.wanted === 0) g.completeMission('Legendary bank score!');
        else g.setObjective('Lose the cops, then extract at the pier end');
      } else g.setObjective(g.wanted > 0 ? 'Escape to the end of Ocean Pier' : 'Head to the end of Ocean Pier');
    },
  },

  // ------------------------------------------------------------------ 7 (NEW)
  {
    id: 'm7',
    title: 'Skyline Smuggler',
    district: 'San Nova Airport',
    category: 'aerial',
    summary: 'Fly a Dodo Classic from San Nova Airport and hit 4 coastal drop beacons over Nova Keys.',
    reward: 9500,
    giver: { x: DECK.AIRPORT.x0 + 60, z: DECK.AIRPORT.runwayZ - 34, name: 'Capt. Reyes' },
    briefing: [
      'Captain Reyes. Radar is quiet over the bay for the next four minutes — perfect window for a drop.',
      'Take the Dodo Classic on the runway, climb off the tarmac, and buzz all four coastal beacons over Ocean Beach and Nova Keys.',
      'Hold W to throttle up, Space or Down Arrow to pull nose up. Fly clean and touch back down at the airport.',
    ],
    start(g, s) {
      const rx = DECK.AIRPORT.x0 + 115;
      const rz = DECK.AIRPORT.runwayZ;
      s.plane = g.spawnVehicle('prop_plane', rx, rz, Math.PI / 2, { paint: 0xf4f1e6, mission: true, mode: 'idle', tag: 'm7plane' });
      s.stage = 0; s.cp = 0; s.t2 = 240;
      s.pts = [
        [680, 320],
        [300, 1450],
        [DECK.ISLAND.cx, DECK.ISLAND.cz],
        [-150, 740],
        [DECK.AIRPORT.x0 + 380, DECK.AIRPORT.runwayZ],
      ];
      g.setObjective('Board the Dodo Classic on San Nova Airport runway');
    },
    update(g, dt, s) {
      const plane: Vehicle = s.plane;
      if (plane.mode === 'wreck') return g.failMission('The aircraft was destroyed.');
      if (s.stage === 0) {
        g.setGoals([{ x: plane.x, z: plane.z, kind: 'vehicle', r: 5 }]);
        if (g.playerVehicle === plane) {
          s.stage = 1;
          g.say('Capt. Reyes', 'Full throttle down the strip! Hit every coastal beacon and bring her home.', 4.5);
        }
        return;
      }
      s.t2 -= dt;
      g.setTimer(Math.max(0, s.t2), 'AIR DROP');
      if (s.t2 <= 0) return g.failMission('Radar window closed.');
      if (g.playerVehicle !== plane) {
        g.setObjective('Board the Dodo Classic');
        g.setGoals([{ x: plane.x, z: plane.z, kind: 'vehicle', r: 5 }]);
        return;
      }
      const pt = s.pts[s.cp];
      const isLast = s.cp === s.pts.length - 1;
      g.setObjective(isLast ? 'Return to San Nova Airport runway' : `Fly over drop beacon ${s.cp + 1} of ${s.pts.length - 1}`);
      g.setGoals([{ x: pt[0], z: pt[1], kind: 'goal', r: isLast ? 45 : 55, beam: true }]);
      if (dist(g, pt[0], pt[1]) < (isLast ? 52 : 62)) {
        s.cp++;
        g.audio.beep(1600, 0.2);
        if (!isLast) g.ev.onToast(`Drop ${s.cp}/${s.pts.length - 1} released!`, 'good');
        if (s.cp >= s.pts.length) g.completeMission('Smooth smuggling run!');
      }
    },
  },

  // ------------------------------------------------------------------ 8 (NEW)
  {
    id: 'm8',
    title: 'Armored Convoy Hijack',
    district: 'Beltway East',
    category: 'heist',
    summary: 'Ambush a syndicate cash convoy, drop its armed escort, and stash the armored van.',
    reward: 11000,
    giver: { x: roadLine(7) + 18, z: roadLine(4) - 14, name: 'Vesper' },
    briefing: [
      'Vesper. A cartel armored van loaded with untraceable bills is staging along the east avenue.',
      'Take out the escort guards, hijack the van intact, and stash it at the Northern Industrial Depot.',
      'Expect heavy return fire — aim sharp and do not blow up the payload.',
    ],
    start(g, s) {
      const vx = roadLine(7), vz = roadLine(2);
      s.van = g.spawnVehicle('van', vx, vz, 0, { paint: 0x222a36, mission: true, mode: 'idle', tag: 'm8van' });
      s.van.maxHp = 260; s.van.hp = 260;
      s.escort = g.spawnVehicle('suv', vx, vz - 14, 0, { paint: 0x111111, mission: true, mode: 'idle', tag: 'm8esc' });
      s.guards = [] as Ped[];
      const offs = [[-5, -4], [5, -4], [-6, 6], [6, 6], [0, -16]];
      offs.forEach(([ox, oz], i) => {
        s.guards.push(
          g.spawnEnemy('guard', vx + ox, vz + oz, {
            weapon: i % 2 ? 'rifle' : 'smg', hp: 85, sight: 65, dmg: 6,
          }),
        );
      });
      s.stage = 0; s.out = 0;
      s.drop = [roadLine(1), roadLine(1)];
      g.setObjective('Intercept the armored convoy on the east avenue');
    },
    update(g, dt, s) {
      const van: Vehicle = s.van;
      if (van.mode === 'wreck') return g.failMission('The armored van was destroyed.');
      const alive = (s.guards as Ped[]).filter((p) => !p.dead);
      if (s.stage === 0) {
        if (dist(g, van.x, van.z) > 65) {
          g.setGoals([{ x: van.x, z: van.z, kind: 'vehicle', r: 8, beam: true }]);
          return;
        }
        g.setObjective(`Eliminate convoy escort (${alive.length} left) or hijack the van`);
        g.setGoals([
          { x: van.x, z: van.z, kind: 'vehicle', r: 3.5 },
          ...alive.map((p) => ({ x: p.x, z: p.z, kind: 'enemy' as const, r: 1 })),
        ]);
        if (g.playerVehicle === van) {
          s.stage = 1;
          g.setWanted(2);
          g.say('Vesper', 'You got the truck! Floor it to the northwest depot!', 4);
        }
        return;
      }
      if (g.playerVehicle !== van) {
        s.out += dt;
        g.setObjective('Get back in the armored van');
        g.setGoals([{ x: van.x, z: van.z, kind: 'vehicle', r: 3.5 }]);
        if (s.out > 25) return g.failMission('You abandoned the cash van.');
        return;
      }
      s.out = 0;
      const hp = Math.round((van.hp / van.maxHp) * 100);
      g.setProgress(hp);
      g.setObjective(`Deliver the armored van to the northwest depot · armor ${hp}%`);
      g.setGoals([{ x: s.drop[0], z: s.drop[1], kind: 'goal', r: 13 }]);
      if (dist(g, s.drop[0], s.drop[1]) < 13) {
        g.completeMission('Convoy secured!');
      }
    },
  },

  // ------------------------------------------------------------------ 9 (NEW)
  {
    id: 'm9',
    title: 'Boardwalk Sniper',
    district: 'Ocean Beach',
    category: 'stealth',
    summary: 'Equip the Sniper Rifle and eliminate a cartel broker & lieutenants along Ocean Beach.',
    reward: 8500,
    giver: { x: -240, z: 486, name: 'Vesper' },
    briefing: [
      'A high-level cartel broker is trading encrypted ledger drives down by the Ocean Beach boardwalk.',
      'I stashed fresh Sniper Rifle rounds in your kit. Press G to toggle the scope and drop the broker plus his guards.',
      'Clear every target before the syndicate backup reaches the beach.',
    ],
    start(g, s) {
      g.player.owned.add('sniper');
      g.player.ammo.sniper = Math.max(g.player.ammo.sniper, 24);
      g.selectWeapon('sniper');
      g.ev.onToast('Sniper Rifle equipped (Press G to Scope)', 'info');
      const bx = -40, bz = 548;
      s.bx = bx; s.bz = bz;
      s.enemies = [] as Ped[];
      s.boss = g.spawnEnemy('target', bx, bz, { weapon: 'revolver', hp: 120, sight: 75, dmg: 8, tag: 'broker' });
      s.enemies.push(s.boss);
      const offs = [[-16, -6], [16, -6], [-24, 8], [24, 8], [0, -14], [12, 14]];
      offs.forEach(([ox, oz], i) => {
        s.enemies.push(
          g.spawnEnemy('gang', bx + ox, bz + oz, {
            weapon: i % 2 ? 'rifle' : 'smg', hp: 65, sight: 65, dmg: 5,
          }),
        );
      });
      s.stage = 0; s.t2 = 180;
      g.setObjective('Move into sniper range of the Ocean Beach boardwalk meet');
    },
    update(g, dt, s) {
      s.t2 -= dt;
      g.setTimer(Math.max(0, s.t2), 'CONTRACT');
      if (s.t2 <= 0) return g.failMission('The cartel broker slipped away.');
      const alive = (s.enemies as Ped[]).filter((p) => !p.dead);
      if (s.stage === 0) {
        g.setGoals([{ x: s.bx, z: s.bz, kind: 'goal', r: 30, beam: true }]);
        if (dist(g, s.bx, s.bz) < 115) {
          s.stage = 1;
          g.say('Vesper', 'Eyes on the broker in white. Press G for your scope and drop them.', 4);
        }
        return;
      }
      g.setGoals(alive.map((p) => ({ x: p.x, z: p.z, kind: 'enemy' as const, r: 1 })));
      g.setObjective(
        s.boss.dead
          ? `Eliminate remaining boardwalk guards (${alive.length} left)`
          : `Eliminate the Cartel Broker & guards (${alive.length} left)`,
      );
      if (alive.length === 0) g.completeMission('Clean boardwalk sweep.');
    },
  },

  // ------------------------------------------------------------------ 10 (NEW)
  {
    id: 'm10',
    title: 'Dunes Baja Blitz',
    district: 'Golden Dunes',
    category: 'racing',
    summary: 'Blast across 7 off-road checkpoints in the Western Golden Dunes in a lifted Bison Pickup.',
    reward: 9000,
    giver: { x: -720, z: -22, name: 'Rico' },
    briefing: [
      'Tired of paved avenues? Out west past the beltway is nothing but rolling Golden Dunes.',
      'I parked a lifted Bison Pickup on the west expressway edge. Run all seven desert rally beacons before sunset.',
      'Watch the loose sand drift — counter-steer smoothly and keep your momentum up the ridge climbs!',
    ],
    start(g, s) {
      s.truck = g.spawnVehicle('pickup', -745, 0, -Math.PI / 2, { paint: 0xf39c12, mission: true, mode: 'idle', tag: 'm10truck' });
      s.stage = 0; s.cp = 0; s.t2 = 195; s.out = 0;
      const westGas = RURAL_GAS_STATIONS.find((r) => r.id === 'gas_west_dunes') ?? { x: -1750, z: -76 };
      s.pts = [
        [-1060, -140],
        [-1420, -280],
        [westGas.x, westGas.z - 25],
        [-1980, 260],
        [-1620, 560],
        [-1180, 480],
        [-780, 120],
      ];
      g.setObjective('Get in the orange Bison Pickup on the West Expressway');
    },
    update(g, dt, s) {
      const truck: Vehicle = s.truck;
      if (truck.mode === 'wreck') return g.failMission('Your rally truck was wrecked.');
      if (s.stage === 0) {
        g.setGoals([{ x: truck.x, z: truck.z, kind: 'vehicle', r: 3.5 }]);
        if (g.playerVehicle === truck) {
          s.stage = 1;
          g.say('Rico', 'Dunes Baja clock is live! Tear up the sand!', 4);
        }
        return;
      }
      s.t2 -= dt;
      g.setTimer(Math.max(0, s.t2), 'BAJA RALLY');
      if (s.t2 <= 0) return g.failMission('Out of time on the Baja stage.');
      if (g.playerVehicle !== truck) {
        s.out += dt;
        g.setObjective('Get back in the Bison Pickup');
        g.setGoals([{ x: truck.x, z: truck.z, kind: 'vehicle', r: 3.5 }]);
        if (s.out > 25) return g.failMission('You abandoned the Baja truck.');
        return;
      }
      s.out = 0;
      const pt = s.pts[s.cp];
      g.setObjective(`Desert rally gate ${s.cp + 1} of ${s.pts.length}`);
      g.setGoals([{ x: pt[0], z: pt[1], kind: 'goal', r: 22, beam: true }]);
      if (dist(g, pt[0], pt[1]) < 24) {
        s.cp++;
        g.audio.beep(1550, 0.16);
        if (s.cp === 3) g.say('Rico', 'Halfway past the desert gas station — keep flying!', 3.5);
        if (s.cp >= s.pts.length) g.completeMission('Baja Champion!');
      }
    },
  },

  // ------------------------------------------------------------------ 11 (NEW)
  {
    id: 'm11',
    title: 'Wynwood Turf War',
    district: 'Midtown Plaza',
    category: 'combat',
    summary: 'Hold the plaza with heavy firepower against 3 escalating syndicate attack waves.',
    reward: 12500,
    giver: { x: blockCenter(5), z: blockCenter(5) - 18, name: 'Maya Vega' },
    briefing: [
      'Maya Vega! Rival syndicate crews are moving in to take over our Midtown block right now.',
      'Stand your ground in the plaza and repel all three waves. I dropped fresh armor and rifle ammo on your kit.',
      'Watch every corner — by wave three they bring heavy shotguns and assault rifles.',
    ],
    start(g, s) {
      s.cx = blockCenter(5);
      s.cz = blockCenter(5);
      g.player.armor = Math.max(g.player.armor, 80);
      g.player.ammo.rifle = Math.max(g.player.ammo.rifle, 180);
      g.player.ammo.shotgun = Math.max(g.player.ammo.shotgun, 32);
      g.ev.onToast('Armor +80 & Rifle Ammo resupplied!', 'good');
      s.wave = 0;
      s.enemies = [] as Ped[];
      s.stage = 0;
      g.setObjective('Head to the Midtown Plaza defense point');
    },
    update(g, _dt, s) {
      if (s.stage === 0) {
        g.setGoals([{ x: s.cx, z: s.cz, kind: 'goal', r: 16, beam: true }]);
        if (dist(g, s.cx, s.cz) < 28) {
          s.stage = 1;
          s.wave = 1;
          spawnTurfWave(g, s, 1);
        }
        return;
      }
      const alive = (s.enemies as Ped[]).filter((p) => !p.dead);
      if (alive.length === 0) {
        if (s.wave < 3) {
          s.wave++;
          g.player.hp = Math.min(100, g.player.hp + 25);
          g.player.armor = Math.min(100, g.player.armor + 35);
          g.ev.onToast(`Wave ${s.wave - 1} Cleared! +25 HP / +35 Armor`, 'good');
          spawnTurfWave(g, s, s.wave);
          return;
        }
        g.completeMission('The block belongs to you!');
        return;
      }
      g.setGoals(alive.map((p) => ({ x: p.x, z: p.z, kind: 'enemy' as const, r: 1 })));
      g.setObjective(`Wave ${s.wave}/3 — Eliminate attackers (${alive.length} left)`);
    },
  },

  // ------------------------------------------------------------------ 12 (NEW)
  {
    id: 'm12',
    title: 'VIP Extraction',
    district: 'North Palms',
    category: 'combat',
    summary: 'Storm a suburban safehouse, eliminate cartel kidnappers, and escort the VIP to Ocean Beach.',
    reward: 14000,
    giver: { x: 0, z: -760, name: 'Maya Vega' },
    briefing: [
      'Cartel hitters grabbed our accountant Carlos and locked him in a North Palms suburban compound.',
      'Roll north, clear every kidnapper guarding the getaway sedan, and drive Carlos straight to Ocean Beach.',
      'Do not let the getaway car blow up — Carlos is riding in the back seat.',
    ],
    start(g, s) {
      const cx = 140, cz = -960;
      s.cx = cx; s.cz = cz;
      s.car = g.spawnVehicle('sedan', cx, cz, Math.PI, { paint: 0xf4f6f9, mission: true, mode: 'idle', tag: 'm12vip' });
      s.car.maxHp = 190; s.car.hp = 190;
      s.enemies = [] as Ped[];
      const offs = [[-12, -8], [12, -8], [-14, 10], [14, 10], [0, 16], [0, -18]];
      offs.forEach(([ox, oz], i) => {
        s.enemies.push(
          g.spawnEnemy('gang', cx + ox, cz + oz, {
            weapon: i % 2 ? 'rifle' : 'smg', hp: 80, sight: 60, dmg: 6,
          }),
        );
      });
      s.stage = 0; s.out = 0;
      s.safe = [-180, 500];
      g.setObjective('Drive to the North Palms suburban compound');
    },
    update(g, dt, s) {
      const car: Vehicle = s.car;
      if (car.mode === 'wreck') return g.failMission('The extraction sedan was destroyed.');
      const alive = (s.enemies as Ped[]).filter((p) => !p.dead);
      if (s.stage === 0) {
        if (dist(g, s.cx, s.cz) > 78) {
          g.setGoals([{ x: s.cx, z: s.cz, kind: 'goal', r: 18, beam: true }]);
          return;
        }
        g.setObjective(`Clear cartel kidnappers (${alive.length} left)`);
        g.setGoals(alive.map((p) => ({ x: p.x, z: p.z, kind: 'enemy' as const, r: 1 })));
        if (alive.length === 0) {
          s.stage = 1;
          g.say('Carlos', 'Thank God! Hop in the white sedan and get me to Ocean Beach!', 4);
        }
        return;
      }
      if (s.stage === 1) {
        g.setObjective('Get in the white extraction sedan with Carlos');
        g.setGoals([{ x: car.x, z: car.z, kind: 'vehicle', r: 3 }]);
        if (g.playerVehicle === car) {
          s.stage = 2;
          g.setWanted(2);
          g.say('Maya Vega', 'Heat is on your tail — sprint south to the Ocean Beach hotel!', 4);
        }
        return;
      }
      if (g.playerVehicle !== car) {
        s.out += dt;
        g.setObjective('Get back in the extraction sedan');
        g.setGoals([{ x: car.x, z: car.z, kind: 'vehicle', r: 3 }]);
        if (s.out > 25) return g.failMission('You left Carlos behind.');
        return;
      }
      s.out = 0;
      g.setObjective('Escort Carlos to Ocean Beach safe house');
      g.setGoals([{ x: s.safe[0], z: s.safe[1], kind: 'goal', r: 14 }]);
      if (dist(g, s.safe[0], s.safe[1]) < 15) {
        g.completeMission('VIP extracted safely!');
      }
    },
  },

  // ------------------------------------------------------------------ 13 (NEW)
  {
    id: 'm13',
    title: 'Viper Jet Strike',
    district: 'San Nova Airport',
    category: 'aerial',
    summary: 'Scramble the supersonic Viper Strike Jet through 6 aerial skyline & island rings.',
    reward: 18000,
    giver: { x: DECK.AIRPORT.x0 + 240, z: DECK.AIRPORT.runwayZ + 38, name: 'Capt. Reyes' },
    briefing: [
      'We have a supersonic Viper Strike Jet fueled and armed on Runway 09.',
      'Scramble into the sky, punch afterburners through all six high-speed skyline and Nova Keys rings, and buzz East Harbor.',
      'Hold W for full afterburner. Pull smooth banked turns — this bird hits 450 km/h fast!',
    ],
    start(g, s) {
      const rx = DECK.AIRPORT.x0 + 270;
      const rz = DECK.AIRPORT.runwayZ;
      s.jet = g.spawnVehicle('jet', rx, rz, Math.PI / 2, { paint: 0x3b4450, mission: true, mode: 'idle', tag: 'm13jet' });
      s.stage = 0; s.cp = 0; s.t2 = 220;
      s.pts = [
        [720, -240],
        [0, -180],
        [-380, 260],
        [300, 1750],
        [DECK.ISLAND.cx, DECK.ISLAND.cz],
        [DECK.AIRPORT.x0 + 460, DECK.AIRPORT.runwayZ],
      ];
      g.setObjective('Board the Viper Strike Jet on San Nova Airport runway');
    },
    update(g, dt, s) {
      const jet: Vehicle = s.jet;
      if (jet.mode === 'wreck') return g.failMission('The Viper Jet was lost.');
      if (s.stage === 0) {
        g.setGoals([{ x: jet.x, z: jet.z, kind: 'vehicle', r: 6 }]);
        if (g.playerVehicle === jet) {
          s.stage = 1;
          g.say('Capt. Reyes', 'Afterburners hot! Climb over Downtown and nail all 6 aerial gates!', 4.5);
        }
        return;
      }
      s.t2 -= dt;
      g.setTimer(Math.max(0, s.t2), 'JET SORTIE');
      if (s.t2 <= 0) return g.failMission('Sortie timer expired.');
      if (g.playerVehicle !== jet) {
        g.setObjective('Board the Viper Strike Jet');
        g.setGoals([{ x: jet.x, z: jet.z, kind: 'vehicle', r: 6 }]);
        return;
      }
      const pt = s.pts[s.cp];
      const isLast = s.cp === s.pts.length - 1;
      g.setObjective(isLast ? 'Final pass over San Nova Airport runway' : `Fly through aerial gate ${s.cp + 1} of ${s.pts.length - 1}`);
      g.setGoals([{ x: pt[0], z: pt[1], kind: 'goal', r: 65, beam: true }]);
      if (dist(g, pt[0], pt[1]) < 78) {
        s.cp++;
        g.audio.beep(1750, 0.22);
        if (!isLast) g.ev.onToast(`Aerial Gate ${s.cp}/${s.pts.length - 1} Cleared!`, 'good');
        if (s.cp >= s.pts.length) g.completeMission('Top Gun of San Nova!');
      }
    },
  },

  // ------------------------------------------------------------------ 14 (NEW)
  {
    id: 'm14',
    title: 'Syndicate Finale',
    district: 'Downtown HQ',
    category: 'heist',
    summary: 'Storm the Syndicate HQ, defeat the Kingpin & elite guards, and escape to Nova Keys Island.',
    reward: 35000,
    giver: { x: roadLine(4) - 20, z: roadLine(4) + 18, name: 'Marco & Maya' },
    briefing: [
      'This is it. The Syndicate Kingpin put a bounty on our entire crew and fortified Downtown Plaza.',
      'We loaded your armor, rifle, and RPG. Storm the plaza, take out the Kingpin and his elite guard.',
      'Once he drops, grab the black getaway Vortex GT, break through a 4-star lockdown, and cross the Causeway Bridge to Nova Keys Resort!',
    ],
    start(g, s) {
      g.player.hp = 100;
      g.player.armor = 100;
      g.player.ammo.rifle = Math.max(g.player.ammo.rifle, 240);
      g.player.ammo.rpg = Math.max(g.player.ammo.rpg, 5);
      g.ev.onToast('Full Armor, Rifle & RPG equipped for the Finale!', 'good');
      const hx = roadLine(4), hz = roadLine(3);
      s.hx = hx; s.hz = hz;
      s.car = g.spawnVehicle('sports', hx + 22, hz + 14, Math.PI, { paint: 0x0f1116, mission: true, mode: 'idle', tag: 'm14gt' });
      s.car.maxHp = 220; s.car.hp = 220;
      s.enemies = [] as Ped[];
      s.kingpin = g.spawnEnemy('target', hx, hz, { weapon: 'rifle', hp: 220, sight: 80, dmg: 9, acc: 1.05, tag: 'kingpin' });
      s.enemies.push(s.kingpin);
      const offs = [[-14, -10], [14, -10], [-16, 12], [16, 12], [-8, -20], [8, -20], [0, 18]];
      offs.forEach(([ox, oz], i) => {
        s.enemies.push(
          g.spawnEnemy('guard', hx + ox, hz + oz, {
            weapon: i % 3 === 0 ? 'shotgun' : 'rifle', hp: 95, sight: 72, dmg: 7,
          }),
        );
      });
      s.stage = 0; s.out = 0;
      g.setObjective('Storm Syndicate HQ in Downtown Plaza');
    },
    update(g, dt, s) {
      const alive = (s.enemies as Ped[]).filter((p) => !p.dead);
      if (s.stage === 0) {
        if (dist(g, s.hx, s.hz) > 88) {
          g.setGoals([{ x: s.hx, z: s.hz, kind: 'goal', r: 24, beam: true }]);
          return;
        }
        g.setGoals(alive.map((p) => ({ x: p.x, z: p.z, kind: 'enemy' as const, r: 1 })));
        g.setObjective(
          s.kingpin.dead
            ? `Eliminate remaining Syndicate Elite (${alive.length} left)`
            : `Defeat the Syndicate Kingpin & guards (${alive.length} left)`,
        );
        if (alive.length === 0) {
          s.stage = 1;
          g.setWanted(4);
          g.say('Maya Vega', 'Kingpin is down! Grab the black Vortex GT and bolt south across the bridge to Nova Keys!', 5);
        }
        return;
      }
      const car: Vehicle = s.car;
      if (s.stage === 1) {
        g.setObjective('Get in the black getaway Vortex GT (or any fast car)');
        g.setGoals([{ x: car.x, z: car.z, kind: 'vehicle', r: 3 }]);
        if (g.playerVehicle) {
          s.stage = 2;
          g.say('Marco', 'Head south over Ocean Causeway Bridge to Nova Keys Resort!', 4.5);
        }
        return;
      }
      const rx = DECK.ISLAND.cx, rz = DECK.ISLAND.cz;
      g.setGoals([{ x: rx, z: rz, kind: 'goal', r: 32, beam: true }]);
      g.setObjective(
        g.wanted > 0
          ? 'Outrun SNPD and reach Nova Keys Island Resort'
          : 'Drive to Nova Keys Island Resort to claim San Nova',
      );
      if (dist(g, rx, rz) < 42) {
        g.setWanted(0);
        g.completeMission('San Nova is yours — $35,000 Syndicate Jackpot!');
      }
      void dt;
    },
  },
];

function spawnTurfWave(g: Game, s: any, wave: number) {
  const count = 3 + wave * 2;
  const radius = 34 + wave * 4;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + wave * 0.6;
    const ex = s.cx + Math.cos(a) * radius;
    const ez = s.cz + Math.sin(a) * radius;
    const weapon = wave === 3 && i % 2 === 0 ? 'shotgun' : wave >= 2 ? 'rifle' : i % 2 ? 'smg' : 'pistol';
    s.enemies.push(
      g.spawnEnemy('gang', ex, ez, {
        weapon, hp: 58 + wave * 14, sight: 75, aggro: true, dmg: 4.5 + wave * 0.9,
      }),
    );
  }
  g.say(
    'Maya Vega',
    wave === 1
      ? 'Wave 1 moving in from the street! Hold the plaza!'
      : wave === 2
        ? 'Wave 2 — heavier rifles coming in hot!'
        : 'Final wave! Drop their enforcers and this district is ours!',
    3.8,
  );
}
