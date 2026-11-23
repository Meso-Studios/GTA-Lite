// Story missions. Each mission is a small state machine driven by Game.updateMissions.
import { blockCenter, roadLine } from './config';
import type { Game } from './Game';
import type { Vehicle } from './vehicle';
import type { Ped } from './ped';

export interface MissionDef {
  id: string;
  title: string;
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
    id: 'm1', title: 'First Wheels', reward: 750, giver: { x: -297.5, z: 22, name: 'Sal' },
    briefing: [
      'Listen up, rookie. San Nova runs on wheels and I need a driver who can handle one.',
      'That red Vortex GT across the street is yours for the afternoon. Hop in and hit the checkpoints.',
      'Try not to scratch the paint. Cops hate speeders, but they hate a wrecked car even more.',
    ],
    start(g, s) {
      s.car = g.spawnVehicle('sports', -276, 22, 0, { paint: 0xc0392b, mission: true, mode: 'idle', tag: 'm1car' });
      s.stage = 0; s.cp = 0; s.out = 0;
      s.pts = [[roadLine(2), roadLine(4)], [roadLine(4), roadLine(4)], [roadLine(4), roadLine(6)], [roadLine(2), roadLine(6)], [roadLine(2), roadLine(4) + 20]];
      g.setObjective('Get in the red Vortex GT');
    },
    update(g, dt, s) {
      const car: Vehicle = s.car;
      if (car.mode === 'wreck') return g.failMission('The car was destroyed.');
      if (s.stage === 0) {
        g.setGoals([{ x: car.x, z: car.z, kind: 'vehicle', r: 2.5 }]);
        if (g.playerVehicle === car) { s.stage = 1; g.say('Sal', 'Sweet ride, huh? Tap SPACE for the handbrake on tight corners.', 4); }
        return;
      }
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
        if (s.cp >= s.pts.length) g.completeMission('Nice driving!');
      }
    },
  },
  // ------------------------------------------------------------------ 2
  {
    id: 'm2', title: 'Dock Delivery', reward: 1500, giver: { x: 342, z: 411.5, name: 'Marco' },
    briefing: [
      'Marco. I run freight through the port. The kind of freight customs does not ask about.',
      'There is a Hauler Van loaded and waiting by the road. Deliver it to the junction on the west side of the city.',
      'Clock is ticking. Bring it in one piece for a bonus.',
    ],
    start(g, s) {
      s.van = g.spawnVehicle('van', 342, 407.9, Math.PI / 2, { paint: 0xe8e8e8, mission: true, mode: 'idle', tag: 'm2van' });
      s.stage = 0; s.out = 0;
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
          g.setTimer(160, 'DELIVERY');
          g.say('Marco', 'Drive carefully. Every dent costs me money.', 3.5);
        }
        return;
      }
      s.t2 = (s.t2 ?? 160) - dt;
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
      g.setObjective(`Deliver the van to the drop-off  ·  cargo ${hp}%`);
      g.setProgress(hp);
      g.setGoals([{ x: s.dest[0], z: s.dest[1], kind: 'goal', r: 11 }]);
      if (dist(g, s.dest[0], s.dest[1]) < 11) {
        if (hp >= 70) { g.player.money += 500; g.ev.onToast('Cargo bonus +$500', 'cash'); }
        g.completeMission(hp >= 70 ? 'Cargo bonus!' : '');
      }
    },
  },
  // ------------------------------------------------------------------ 3
  {
    id: 'm3', title: 'Street Race', reward: 3000, giver: { x: 114, z: -69.5, name: 'Nitro' },
    briefing: [
      'They call me Nitro. Underground racing is my business and business is good.',
      'Grab any set of wheels and meet two of my drivers on the starting line downtown.',
      'Win the lap around the city and the prize pot is yours. Come second and you get nothing.',
    ],
    start(g, s) {
      const route = expandRoute([[5, 4], [7, 4], [7, 2], [3, 2], [3, 6], [7, 6], [7, 4], [5, 4]]);
      s.route = route;
      s.cps = route.map((n, i) => ({ n, i })).filter((q) => q.i > 0 && (q.i % 2 === 0 || q.i === route.length - 1)).map((q) => q.n);
      s.cp = 0; s.stage = 0; s.cd = 0;
      s.rivals = [];
      const mk = (type: 'sports' | 'sedan', paint: number, lane: number, before: number, cruise: number) => {
        const v = g.spawnVehicle(type, 0, 0, 0, { paint, mission: true, mode: 'idle', driver: 'racer', tag: 'rival' });
        v.ai.route = route.map((n) => [n[0], n[1]] as [number, number]);
        v.ai.routeIdx = 0;
        v.ai.finished = false;
        v.placeOnRoad(g, 5, 4, 1, 0, lane, before);
        v.ai.cruise = cruise;
        v.ai.finishAfter = false;
        v.lightsOn = true;
        return v;
      };
      s.rivals.push(mk('sports', 0x1f77d4, 2.4, 22, 33), mk('sports', 0xf1c40f, 5.9, 30, 30));
      g.setObjective('Get a car and drive to the starting line');
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
      const ord = ['1st', '2nd', '3rd'][place - 1];
      g.setObjective(`Checkpoint ${s.cp + 1}/${s.cps.length}  ·  Position ${ord}`);
      for (const r of rivals) if (r.mode === 'wreck') { r.mode = 'idle'; }
      if (dist(g, roadLine(cp[0]), roadLine(cp[1])) < 13) {
        g.audio.beep(1500, 0.14);
        s.cp++;
        if (s.cp >= s.cps.length) {
          const rivalsFinished = rivals.filter((r) => r.ai.finished).length;
          if (rivalsFinished === 0) g.completeMission('You won the race!');
          else g.failMission(`You finished ${rivalsFinished + 1 === 2 ? '2nd' : '3rd'}.`);
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
    id: 'm4', title: 'Hit List', reward: 2500, giver: { x: 0, z: -183.5, name: 'Big Mo' },
    briefing: [
      'Big Mo. A man named Vince has been skimming from my operation.',
      'He is hiding out at the gazebo in the park with his crew. White suit, you cannot miss him.',
      'Take care of Vince and his guys. Bring a gun. Bring a lot of bullets.',
    ],
    start(g, s) {
      const cx = parkCenter.x + 22, cz = parkCenter.z + 22;
      s.enemies = [] as Ped[];
      s.target = g.spawnEnemy('target', cx, cz, { weapon: 'pistol', hp: 110, sight: 50, tag: 'target', dmg: 8 });
      s.enemies.push(s.target);
      const offs = [[-9, -7], [9, -7], [-9, 8], [9, 8]];
      offs.forEach(([ox, oz], i) => s.enemies.push(g.spawnEnemy('gang', cx + ox, cz + oz, { weapon: i % 2 ? 'smg' : 'pistol', hp: 65, sight: 45, tag: 'goon', dmg: 5 })));
      g.setObjective("Find Vince's hideout at the park gazebo");
      s.stage = 0;
    },
    update(g, _dt, s) {
      const alive = (s.enemies as Ped[]).filter((p) => !p.dead);
      if (g.player.ammo.pistol + g.player.ammo.smg + g.player.ammo.shotgun + g.player.ammo.rifle < 5 && s.stage < 2) {
        g.setObjective('Out of ammo! Visit the Ammu-Nation or find a weapon');
      }
      if (s.stage === 0) {
        g.setGoals([{ x: parkCenter.x + 22, z: parkCenter.z + 22, kind: 'goal', r: 22, beam: true }]);
        if (dist(g, parkCenter.x + 22, parkCenter.z + 22) < 70) { s.stage = 1; g.say('Big Mo', 'That is the place. Light them up!', 3); }
        return;
      }
      g.setGoals(alive.map((p) => ({ x: p.x, z: p.z, kind: 'enemy' as const, r: 1 })));
      g.setObjective(s.target.dead ? `Finish off the crew (${alive.length} left)` : `Eliminate Vince and his crew (${alive.length} left)`);
      if (alive.length === 0) g.completeMission('The crew is gone.');
    },
  },
  // ------------------------------------------------------------------ 5
  {
    id: 'm5', title: 'Hot Wheels', reward: 3500, giver: { x: -342, z: 69.5, name: 'Rico' },
    briefing: [
      'Rico here. A rich guy parked his prototype Vortex downtown with the keys in the cup holder.',
      'Take it. The cops will notice. Lose them, then get it painted at the Pay N Spray in the south-east.',
      'Do not wreck it. A scratched supercar is worth nothing.',
    ],
    start(g, s) {
      s.car = g.spawnVehicle('sports', 48.1, -114, 0, { paint: 0xe5b800, mission: true, mode: 'idle', tag: 'm5car' });
      s.stage = 0; s.out = 0;
      g.setObjective('Steal the gold Vortex GT parked downtown');
    },
    update(g, dt, s) {
      const car: Vehicle = s.car;
      if (car.mode === 'wreck') return g.failMission('The supercar was destroyed.');
      if (s.stage === 0) {
        g.setGoals([{ x: car.x, z: car.z, kind: 'vehicle', r: 2.5 }]);
        if (g.playerVehicle === car) {
          s.stage = 1;
          g.setWanted(3);
          g.say('Rico', 'Alarm is blaring, you have three stars on you! Lose them!', 4);
        }
        return;
      }
      const ps = g.city.places.payspray;
      if (g.playerVehicle !== car) {
        s.out += dt;
        g.setObjective('Get back in the gold Vortex GT');
        g.setGoals([{ x: car.x, z: car.z, kind: 'vehicle', r: 2.5 }]);
        if (s.out > 20) g.failMission('You lost the car.');
        return;
      }
      s.out = 0;
      g.setObjective(g.wanted > 0 ? "Lose the cops, then drive to the Pay N' Spray" : "Drive to the Pay N' Spray");
      g.setGoals([{ x: ps.x, z: ps.z, kind: 'goal', r: ps.r ?? 7 }]);
      if (dist(g, ps.x, ps.z) < (ps.r ?? 7) && g.wanted === 0) g.completeMission('Fresh paint, clean record.');
    },
  },
  // ------------------------------------------------------------------ 6
  {
    id: 'm6', title: 'The Big Score', reward: 15000, giver: { x: -100, z: 545, name: 'The Boss' },
    briefing: [
      'You have done well. Now the real job. The First San Nova Bank, downtown, vault full of cash.',
      'A black Titan SUV is waiting near the plaza. Drive to the bank, deal with the guards and crack the vault.',
      'The whole force will come down on us. Make it to the end of the pier alive and we are rich.',
    ],
    start(g, s) {
      s.car = g.spawnVehicle('suv', 48.1, 8, 0, { paint: 0x15171a, mission: true, mode: 'idle', tag: 'm6car' });
      s.stage = 0; s.guards = [] as Ped[]; s.crack = 0;
      s.bank = g.city.places.bank;
      g.setObjective('Take the black Titan SUV near the bank');
    },
    update(g, dt, s) {
      const bank = s.bank as { x: number; z: number };
      if (s.stage === 0) {
        g.setGoals([{ x: s.car.x, z: s.car.z, kind: 'vehicle', r: 3 }]);
        if (g.playerVehicle === s.car) s.stage = 1;
        return;
      }
      if (s.stage === 1) {
        g.setObjective('Drive to the bank entrance');
        g.setGoals([{ x: bank.x, z: bank.z, kind: 'goal', r: 4 }]);
        if (dist(g, bank.x, bank.z) < 9) {
          s.stage = 2;
          g.setWanted(4);
          const offs = [[-16, 12], [16, 12], [-14, 32], [14, 32], [0, 38]];
          offs.forEach(([ox, oz], i) => s.guards.push(g.spawnEnemy('guard', bank.x + ox, bank.z + oz, { weapon: i % 2 ? 'smg' : 'rifle', hp: 75, sight: 70, aggro: true, dmg: 6, acc: 1.05 })));
          g.say('The Boss', 'Alarms are going off! Take out the guards!', 3.5);
        }
        return;
      }
      if (s.stage === 2) {
        const alive = (s.guards as Ped[]).filter((p) => !p.dead);
        g.setObjective(`Neutralise the bank guards (${alive.length} left)`);
        g.setGoals(alive.map((p) => ({ x: p.x, z: p.z, kind: 'enemy' as const, r: 1 })));
        if (g.wanted < 3) g.setWanted(3);
        if (alive.length === 0) { s.stage = 3; g.say('The Boss', 'Get to the vault door and hold your position while it cracks!', 4); }
        return;
      }
      if (s.stage === 3) {
        g.setGoals([{ x: bank.x, z: bank.z, kind: 'goal', r: 4 }]);
        if (dist(g, bank.x, bank.z) < 4.5) {
          s.crack += dt;
          g.setObjective('Cracking the vault... hold the position');
          g.setProgress(Math.min(100, (s.crack / 6) * 100));
          if (s.crack >= 6) {
            s.stage = 4;
            g.setProgress(null);
            g.setWanted(5);
            g.player.money += 5000;
            g.ev.onToast('Vault looted +$5,000', 'cash');
            g.say('The Boss', 'The cops are swarming! Get to the end of the pier!', 4);
          }
        } else { g.setObjective('Return to the vault door'); s.crack = Math.max(0, s.crack - dt); g.setProgress(null); }
        return;
      }
      const px = -150, pz = 695;
      g.setGoals([{ x: px, z: pz, kind: 'goal', r: 8 }]);
      if (dist(g, px, pz) < 14) {
        if (g.wanted === 0) g.completeMission('You are rich.');
        else g.setObjective('Lose the cops! Then wait at the pier end');
      } else g.setObjective(g.wanted > 0 ? 'Escape to the end of the pier' : 'Head to the end of the pier');
    },
  },
];
