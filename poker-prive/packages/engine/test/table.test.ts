import { describe, expect, it } from 'vitest';
import { PokerTable, PokerError, type HandEvent } from '../src/table.js';
import { computeHandStats } from '../src/stats.js';
import { makeTable, rigDeck, stacksOf } from './helpers.js';

const actions = (evts: HandEvent[]) => evts.filter((e) => e.type === 'action');

describe('Blinds et positions', () => {
  it('3 joueurs : bouton, SB, BB et premier à parler', () => {
    const t = makeTable([1000, 1000, 1000]);
    const h = t.startHand();
    expect(h.buttonSeat).toBe(0);
    expect(h.sbSeat).toBe(1);
    expect(h.bbSeat).toBe(2);
    expect(t.currentPlayerId()).toBe('p0'); // UTG = bouton à 3 joueurs
    expect(h.players.find((p) => p.seat === 1)!.streetBet).toBe(50);
    expect(h.players.find((p) => p.seat === 2)!.streetBet).toBe(100);
    expect(h.players.every((p) => p.hole.length === 2)).toBe(true);
  });

  it('heads-up : le bouton est SB et parle en premier préflop, en dernier après', () => {
    const t = makeTable([1000, 1000]);
    const h = t.startHand();
    expect(h.buttonSeat).toBe(0);
    expect(h.sbSeat).toBe(0);
    expect(h.bbSeat).toBe(1);
    expect(t.currentPlayerId()).toBe('p0');
    t.act('p0', { type: 'call' });
    expect(t.currentPlayerId()).toBe('p1'); // option de la BB
    t.act('p1', { type: 'check' });
    expect(h.street).toBe('flop');
    expect(t.currentPlayerId()).toBe('p1'); // BB parle en premier après le flop
  });

  it('le bouton tourne entre les mains', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    t.act('p0', { type: 'fold' });
    t.act('p1', { type: 'fold' });
    expect(t.hand!.finished).toBe(true);
    const h2 = t.startHand();
    expect(h2.buttonSeat).toBe(1);
    expect(h2.sbSeat).toBe(2);
    expect(h2.bbSeat).toBe(0);
  });

  it('les joueurs sans jetons ou absents sont ignorés', () => {
    const t = makeTable([1000, 0, 1000, 1000]);
    t.setSittingOut('p3', true);
    const h = t.startHand();
    expect(h.players.map((p) => p.playerId)).toEqual(['p0', 'p2']);
  });

  it('antes : argent mort hors mise du tour', () => {
    const t = makeTable([1000, 1000, 1000], { ante: 25 });
    const h = t.startHand();
    expect(h.players.find((p) => p.seat === 0)!.totalBet).toBe(25);
    expect(h.players.find((p) => p.seat === 2)!.totalBet).toBe(125);
    expect(h.players.find((p) => p.seat === 2)!.streetBet).toBe(100);
    t.act('p0', { type: 'fold' });
    t.act('p1', { type: 'fold' });
    // BB récupère : antes 75 + SB 50 + sa BB 100 (rendue en « uncalled » 50 puis gagne)
    expect(stacksOf(t)).toEqual({ p0: 975, p1: 925, p2: 1100 });
  });

  it('BB à court : le montant à suivre reste la BB', () => {
    const t = makeTable([1000, 1000, 60]);
    t.startHand();
    const legal = t.legalActions('p0')!;
    expect(legal.callAmount).toBe(100);
    t.act('p0', { type: 'call' });
    t.act('p1', { type: 'call' });
    // p2 all-in 60 : main pot 180, side pot 80 entre p0 et p1
    expect(t.hand!.street).toBe('flop');
    expect(t.currentPots().map((p) => p.amount)).toEqual([180, 80]);
  });
});

describe('Validation des actions', () => {
  it("refuse d'agir hors de son tour", () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    expect(() => t.act('p1', { type: 'fold' })).toThrow(PokerError);
  });
  it('refuse le check face à une mise', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    expect(() => t.act('p0', { type: 'check' })).toThrow(/checker/);
  });
  it('refuse une mise supérieure au tapis', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    expect(() => t.act('p0', { type: 'raise', amount: 5000 })).toThrow(/tapis/);
  });
  it('refuse une relance sous le minimum', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    expect(() => t.act('p0', { type: 'raise', amount: 150 })).toThrow(/minimum/);
    t.act('p0', { type: 'raise', amount: 300 }); // relance de 200
    const legal = t.legalActions('p1')!;
    expect(legal.minTo).toBe(500); // 300 + 200
    expect(() => t.act('p1', { type: 'raise', amount: 450 })).toThrow(/minimum/);
    t.act('p1', { type: 'raise', amount: 500 });
  });
  it('refuse un bet quand une mise existe (il faut raise) et vice-versa', () => {
    const t = makeTable([1000, 1000]);
    t.startHand();
    expect(() => t.act('p0', { type: 'bet', amount: 300 })).toThrow(PokerError);
    t.act('p0', { type: 'call' });
    t.act('p1', { type: 'check' });
    expect(() => t.act('p1', { type: 'raise', amount: 300 })).toThrow(PokerError);
    expect(() => t.act('p1', { type: 'bet', amount: 50 })).toThrow(/minimum/);
    t.act('p1', { type: 'bet', amount: 100 });
  });
  it('montants non entiers refusés', () => {
    const t = makeTable([1000, 1000]);
    t.startHand();
    expect(() => t.act('p0', { type: 'raise', amount: 250.5 })).toThrow(PokerError);
  });
  it('un joueur all-in ne parle plus ; un joueur couché non plus', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    t.act('p0', { type: 'allin' });
    t.act('p1', { type: 'fold' });
    expect(t.currentPlayerId()).toBe('p2');
    t.act('p2', { type: 'call' });
    expect(t.hand!.finished).toBe(true); // board déroulé automatiquement
    expect(t.hand!.board).toHaveLength(5);
  });
});

describe('Tours d’enchères', () => {
  it('préflop complet puis postflop jusqu’au showdown', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand(undefined, rigDeck(t, { 0: 'As Ah', 1: 'Kd Kc', 2: '7c 2d' }, '3s 8h 9c Jd 4s'));
    t.act('p0', { type: 'raise', amount: 300 });
    t.act('p1', { type: 'call' });
    t.act('p2', { type: 'fold' });
    expect(t.hand!.street).toBe('flop');
    expect(t.currentPlayerId()).toBe('p1'); // premier actif après le bouton
    t.act('p1', { type: 'check' });
    t.act('p0', { type: 'bet', amount: 200 });
    t.act('p1', { type: 'call' });
    expect(t.hand!.street).toBe('turn');
    t.act('p1', { type: 'check' });
    t.act('p0', { type: 'check' });
    t.act('p1', { type: 'check' });
    t.act('p0', { type: 'check' });
    expect(t.hand!.finished).toBe(true);
    expect(stacksOf(t)).toEqual({ p0: 1600, p1: 500, p2: 900 });
  });

  it('la BB a une option et peut relancer après des limps', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    t.act('p0', { type: 'call' });
    t.act('p1', { type: 'call' });
    const legal = t.legalActions('p2')!;
    expect(legal.canCheck).toBe(true);
    expect(legal.canRaise).toBe(true);
    expect(legal.minTo).toBe(200);
    t.act('p2', { type: 'raise', amount: 400 });
    expect(t.currentPlayerId()).toBe('p0');
  });

  it('all-in inférieur à une relance complète ne rouvre pas les enchères', () => {
    const t = makeTable([2000, 2000, 450]);
    t.startHand();
    // p0 relance à 300 (relance de 200), p1 suit, p2 (BB) all-in 450 (+150 < 200)
    t.act('p0', { type: 'raise', amount: 300 });
    t.act('p1', { type: 'call' });
    t.act('p2', { type: 'allin' });
    const legal = t.legalActions('p0')!;
    expect(legal.canCall).toBe(true);
    expect(legal.callAmount).toBe(150);
    expect(legal.canRaise).toBe(false);
    expect(() => t.act('p0', { type: 'raise', amount: 900 })).toThrow(/Relance impossible/);
    t.act('p0', { type: 'call' });
    expect(t.legalActions('p1')!.canRaise).toBe(false);
  });

  it('un all-in complet rouvre les enchères', () => {
    const t = makeTable([2000, 2000, 600]);
    t.startHand();
    t.act('p0', { type: 'raise', amount: 300 });
    t.act('p1', { type: 'call' });
    t.act('p2', { type: 'allin' }); // 600 : relance de 300 ≥ 200
    expect(t.legalActions('p0')!.canRaise).toBe(true);
    expect(t.legalActions('p0')!.minTo).toBe(900);
  });

  it('all-ins incomplets cumulés rouvrent les enchères (règle TDA)', () => {
    const t = makeTable([5000, 5000, 1300, 1050]);
    t.startHand(); // bouton 0, SB 1, BB 2, UTG 3
    t.act('p3', { type: 'call' });
    t.act('p0', { type: 'raise', amount: 1000 }); // relance de 900
    t.act('p1', { type: 'call' });
    t.act('p2', { type: 'allin' }); // 1300 : +300 incomplet
    t.act('p3', { type: 'allin' }); // 1050 : sous le montant à suivre (all-in pour suivre partiellement)
    // p0 a parlé à 1000 ; 1300 - 1000 = 300 < 900 → pas de relance
    expect(t.legalActions('p0')!.canRaise).toBe(false);
  });

  it('relance interdite si tous les adversaires sont all-in', () => {
    const t = makeTable([5000, 300, 5000]);
    t.startHand();
    t.act('p0', { type: 'fold' });
    t.act('p1', { type: 'allin' });
    const legal = t.legalActions('p2')!;
    expect(legal.canRaise).toBe(false);
    expect(legal.canCall).toBe(true);
  });

  it('mise non suivie restituée', () => {
    const t = makeTable([1000, 5000]);
    t.startHand();
    t.act('p0', { type: 'call' });
    t.act('p1', { type: 'raise', amount: 3000 });
    t.act('p0', { type: 'allin' });
    // p0 n'a que 1000 : p1 récupère 2000
    const ev = t.hand!.events.find((e) => e.type === 'uncalled');
    expect(ev).toEqual({ type: 'uncalled', playerId: 'p1', amount: 2000 });
    expect(t.hand!.finished).toBe(true);
    const total = Object.values(stacksOf(t)).reduce((a, b) => a + b, 0);
    expect(total).toBe(6000);
  });

  it('timeout : check si possible, sinon fold', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    t.timeoutAction('p0');
    expect(actions(t.hand!.events).at(-1)).toMatchObject({ playerId: 'p0', action: 'fold' });
    t.act('p1', { type: 'call' });
    t.timeoutAction('p2');
    expect(actions(t.hand!.events).at(-1)).toMatchObject({ playerId: 'p2', action: 'check' });
  });
});

describe('Showdown, pots secondaires et partages', () => {
  it('trois all-in, trois pots, gagnants différents', () => {
    const t = makeTable([500, 1500, 3000, 3000]);
    // bouton 0, SB 1, BB 2, UTG 3
    t.startHand(undefined, rigDeck(t, {
      0: 'As Ad', // meilleure main : gagne le pot principal
      1: 'Ks Kd', // 2e : gagne le side pot 1
      2: 'Qs Qd', // 3e : gagne le side pot 2
      3: '7c 2h',
    }, '3c 8h 9d Jc 4s'));
    t.act('p3', { type: 'call' });
    t.act('p0', { type: 'allin' });
    t.act('p1', { type: 'allin' });
    t.act('p2', { type: 'allin' });
    t.act('p3', { type: 'fold' });
    const h = t.hand!;
    expect(h.finished).toBe(true);
    // p3 a investi 100 (couché). Principal : 500×3 + 100 = 1600 ; side 1 : 1000×2 = 2000 ;
    // p2 récupère 1500 non suivis.
    expect(h.awards.map((a) => [a.amount, a.winners])).toEqual([[1600, ['p0']], [2000, ['p1']]]);
    expect(stacksOf(t)).toEqual({ p0: 1600, p1: 2000, p2: 1500, p3: 2900 });
  });

  it('pot partagé (le board joue) avec jeton indivisible', () => {
    const t = makeTable([1000, 1000, 1000], { smallBlind: 25, bigBlind: 50 });
    t.startHand(undefined, rigDeck(t, { 0: '2c 3d', 1: '2d 3c', 2: '4c 5d' }, 'Ts Js Qs Ks As'));
    // SB 25 se couche, bouton et BB partagent 125 → 63 / 62
    t.act('p0', { type: 'call' });
    t.act('p1', { type: 'fold' });
    t.act('p2', { type: 'check' });
    for (let i = 0; i < 6; i++) t.act(t.currentPlayerId()!, { type: 'check' });
    const award = t.hand!.awards[0]!;
    expect(award.winners.sort()).toEqual(['p0', 'p2']);
    // Premier à gauche du bouton parmi les gagnants = p2 (siège 2 avant 0)
    expect(award.shares).toEqual({ p2: 63, p0: 62 });
    expect(stacksOf(t)).toEqual({ p0: 1012, p1: 975, p2: 1013 });
  });

  it('égalité dans un pot secondaire uniquement', () => {
    const t = makeTable([200, 1000, 1000]);
    t.startHand(undefined, rigDeck(t, { 0: 'As Ad', 1: 'Kc Qc', 2: 'Kd Qd' }, '2h 7s 9c Jh 3s'));
    t.act('p0', { type: 'allin' });
    t.act('p1', { type: 'call' });
    t.act('p2', { type: 'call' });
    // flop : p1 et p2 misent encore
    t.act('p1', { type: 'bet', amount: 400 });
    t.act('p2', { type: 'call' });
    t.act('p1', { type: 'check' });
    t.act('p2', { type: 'check' });
    t.act('p1', { type: 'check' });
    t.act('p2', { type: 'check' });
    const h = t.hand!;
    expect(h.awards[0]).toMatchObject({ amount: 600, winners: ['p0'] });
    expect(h.awards[1]!.amount).toBe(800);
    expect(Object.values(h.awards[1]!.shares)).toEqual([400, 400]);
    expect(stacksOf(t)).toEqual({ p0: 600, p1: 800, p2: 800 });
  });

  it('les cartes sont révélées en cas d’all-in sans action possible', () => {
    const t = makeTable([1000, 1000]);
    t.startHand();
    t.act('p0', { type: 'allin' });
    t.act('p1', { type: 'call' });
    expect(t.hand!.events.some((e) => e.type === 'reveal')).toBe(true);
  });

  it('victoire sans showdown : aucune carte dévoilée', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    t.act('p0', { type: 'raise', amount: 300 });
    t.act('p1', { type: 'fold' });
    t.act('p2', { type: 'fold' });
    const h = t.hand!;
    expect(h.events.some((e) => e.type === 'showdown' || e.type === 'reveal')).toBe(false);
    expect(stacksOf(t)).toEqual({ p0: 1150, p1: 950, p2: 900 });
  });
});

describe('Transitions entre mains et parties à plusieurs', () => {
  it('impossible de démarrer deux mains en même temps', () => {
    const t = makeTable([1000, 1000]);
    t.startHand();
    expect(() => t.startHand()).toThrow(/déjà en cours/);
  });
  it('un joueur éliminé ne reçoit plus de cartes, le heads-up se met en place', () => {
    const t = makeTable([100, 1000, 1000]);
    t.startHand(undefined, rigDeck(t, { 0: '7c 2d', 1: 'As Ad', 2: '8c 3h' }, 'Kc Qd 9h 5s 4c'));
    t.act('p0', { type: 'allin' });
    t.act('p1', { type: 'call' });
    t.act('p2', { type: 'fold' });
    expect(stacksOf(t).p0).toBe(0);
    const h2 = t.startHand();
    expect(h2.players.map((p) => p.playerId).sort()).toEqual(['p1', 'p2']);
    expect(h2.sbSeat).toBe(h2.buttonSeat);
  });
  it('quitter pendant une main est refusé, mais permis après un fold', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    expect(() => t.stand('p1')).toThrow(/main en cours/);
    t.act('p0', { type: 'fold' });
    expect(t.stand('p0')).toBe(1000);
  });
  it('snapshot / restauration (reconnexion, reprise après redémarrage)', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand();
    t.act('p0', { type: 'call' });
    const copy = PokerTable.restore(t.snapshot());
    expect(copy.currentPlayerId()).toBe('p1');
    copy.act('p1', { type: 'call' });
    copy.act('p2', { type: 'check' });
    expect(copy.hand!.street).toBe('flop');
    expect(t.hand!.street).toBe('preflop'); // original intact
  });
});

describe('Statistiques calculées depuis les actions', () => {
  it('VPIP, PFR, 3-bet, AF, WTSD, W$SD', () => {
    const t = makeTable([1000, 1000, 1000]);
    t.startHand(undefined, rigDeck(t, { 0: 'As Ah', 1: 'Kd Kc', 2: '7c 2d' }, '3s 8h 9c Jd 4s'));
    t.act('p0', { type: 'raise', amount: 300 }); // open
    t.act('p1', { type: 'raise', amount: 900 }); // 3-bet
    t.act('p2', { type: 'fold' });
    t.act('p0', { type: 'call' });
    t.act('p1', { type: 'bet', amount: 100 });
    t.act('p0', { type: 'call' });
    const s = Object.fromEntries(computeHandStats(t.hand!.events).map((x) => [x.playerId, x]));
    expect(s.p0).toMatchObject({ vpip: true, pfr: true, threeBetOpportunity: false, sawFlop: true, wentToShowdown: true, wonAtShowdown: true, postflopCalls: 1 });
    expect(s.p1).toMatchObject({ vpip: true, pfr: true, threeBet: true, threeBetOpportunity: true, wentToShowdown: true, wonAtShowdown: false, postflopBets: 1 });
    expect(s.p2).toMatchObject({ vpip: false, pfr: false, threeBetOpportunity: false, sawFlop: false }); // a fait face à un 3-bet, pas à une simple relance
    expect(s.p0!.net).toBe(1100);
    expect(s.p1!.net).toBe(-1000);
    expect(s.p2!.net).toBe(-100);
  });
});

describe('Fuzzing : 3000 mains aléatoires', () => {
  it('conservation des jetons et terminaison de chaque main', () => {
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const rand = (n: number) => Math.floor(rnd() * n);
    for (let game = 0; game < 30; game++) {
      const n = 2 + (game % 9);
      const t = makeTable(Array.from({ length: n }, () => 500 + rand(5000)), { ante: game % 3 === 0 ? 10 : 0, maxSeats: 10 });
      const total = t.seats.reduce((s, x) => s + (x?.stack ?? 0), 0);
      for (let i = 0; i < 100 && t.canStartHand(); i++) {
        t.startHand(rand);
        let guard = 0;
        while (!t.hand!.finished) {
          if (++guard > 500) throw new Error('Boucle infinie');
          const id = t.currentPlayerId()!;
          const l = t.legalActions(id)!;
          const r = rnd();
          if (r < 0.15) t.act(id, { type: 'fold' });
          else if (r < 0.5) t.act(id, { type: l.canCheck ? 'check' : 'call' });
          else if (r < 0.8 && (l.canBet || l.canRaise)) {
            const to = l.minTo + rand(Math.max(1, l.maxTo - l.minTo + 1));
            t.act(id, { type: l.canBet ? 'bet' : 'raise', amount: Math.min(to, l.maxTo) });
          } else if (r < 0.9) t.act(id, { type: 'allin' });
          else t.act(id, { type: l.canCheck ? 'check' : 'fold' });
        }
        const now = t.seats.reduce((s, x) => s + (x?.stack ?? 0), 0);
        expect(now).toBe(total);
        expect(t.seats.every((s) => !s || s.stack >= 0)).toBe(true);
      }
    }
  });
});
