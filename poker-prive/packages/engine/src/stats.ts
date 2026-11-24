/**
 * Statistiques par joueur dérivées UNIQUEMENT des événements réels d'une main.
 *
 * Définitions retenues (standard des trackers) :
 *  - VPIP  : a mis volontairement de l'argent préflop (call, bet, raise ; les
 *            blinds et le check de la BB ne comptent pas).
 *  - PFR   : a relancé préflop.
 *  - 3-bet : a relancé préflop alors qu'il faisait face à exactement une
 *            relance (la BB compte comme la mise d'ouverture). Opportunité =
 *            avoir eu la parole face à exactement une relance.
 *  - AF    : (bets + raises) / calls, après le flop.
 *  - WTSD  : est allé au showdown parmi les mains où il a vu le flop.
 *  - W$SD  : a gagné de l'argent au showdown parmi les mains allées au showdown.
 */
import type { HandEvent } from './table.js';

export interface PlayerHandStats {
  playerId: string;
  vpip: boolean;
  pfr: boolean;
  threeBetOpportunity: boolean;
  threeBet: boolean;
  sawFlop: boolean;
  wentToShowdown: boolean;
  wonAtShowdown: boolean;
  postflopBets: number;
  postflopRaises: number;
  postflopCalls: number;
  /** Gain net de la main (peut être négatif). */
  net: number;
  won: boolean;
}

export function computeHandStats(events: HandEvent[]): PlayerHandStats[] {
  const start = events.find((e) => e.type === 'handStart');
  if (!start || start.type !== 'handStart') return [];
  const stats = new Map<string, PlayerHandStats>();
  const invested = new Map<string, number>();
  const won = new Map<string, number>();
  const folded = new Set<string>();
  for (const p of start.players) {
    stats.set(p.playerId, {
      playerId: p.playerId, vpip: false, pfr: false, threeBetOpportunity: false, threeBet: false,
      sawFlop: false, wentToShowdown: false, wonAtShowdown: false, postflopBets: 0, postflopRaises: 0,
      postflopCalls: 0, net: 0, won: false,
    });
    invested.set(p.playerId, 0);
    won.set(p.playerId, 0);
  }
  let preflopRaises = 0;
  for (const e of events) {
    switch (e.type) {
      case 'ante':
      case 'blind':
        invested.set(e.playerId, invested.get(e.playerId)! + e.amount);
        break;
      case 'uncalled':
        invested.set(e.playerId, invested.get(e.playerId)! - e.amount);
        break;
      case 'action': {
        const s = stats.get(e.playerId)!;
        invested.set(e.playerId, invested.get(e.playerId)! + e.amount);
        if (e.action === 'fold') folded.add(e.playerId);
        if (e.street === 'preflop') {
          if (preflopRaises === 1) s.threeBetOpportunity = true;
          if (e.action === 'call' || e.action === 'bet' || e.action === 'raise') s.vpip = true;
          if (e.action === 'raise' || e.action === 'bet') {
            s.pfr = true;
            if (preflopRaises === 1) s.threeBet = true;
            preflopRaises++;
          }
        } else {
          if (e.action === 'bet') s.postflopBets++;
          if (e.action === 'raise') s.postflopRaises++;
          if (e.action === 'call') s.postflopCalls++;
        }
        break;
      }
      case 'street':
        if (e.street === 'flop') for (const s of stats.values()) if (!folded.has(s.playerId)) s.sawFlop = true;
        break;
      case 'showdown':
        for (const h of e.hands) stats.get(h.playerId)!.wentToShowdown = true;
        for (const id of e.mucked ?? []) stats.get(id)!.wentToShowdown = true;
        break;
      case 'potAwarded':
        for (const [id, amt] of Object.entries(e.shares)) {
          won.set(id, won.get(id)! + amt);
          if (e.showdown) stats.get(id)!.wonAtShowdown = true;
        }
        break;
      default:
        break;
    }
  }
  for (const s of stats.values()) {
    s.net = won.get(s.playerId)! - invested.get(s.playerId)!;
    s.won = won.get(s.playerId)! > 0;
    // Un gain au showdown ne compte que s'il y a eu profit net ou récupération d'un pot
    if (s.wonAtShowdown && !s.wentToShowdown) s.wonAtShowdown = false;
  }
  return [...stats.values()];
}

export interface AggregateStats {
  hands: number;
  vpip: number;
  pfr: number;
  threeBet: number;
  af: number | null;
  wtsd: number;
  wsd: number;
}

export interface AggregateCounters {
  hands: number;
  vpipCount: number;
  pfrCount: number;
  threeBetCount: number;
  threeBetOpp: number;
  postflopBets: number;
  postflopRaises: number;
  postflopCalls: number;
  sawFlopCount: number;
  wtsdCount: number;
  wsdCount: number;
}

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10);

export function aggregate(c: AggregateCounters): AggregateStats {
  return {
    hands: c.hands,
    vpip: pct(c.vpipCount, c.hands),
    pfr: pct(c.pfrCount, c.hands),
    threeBet: pct(c.threeBetCount, c.threeBetOpp),
    af: c.postflopCalls === 0 ? (c.postflopBets + c.postflopRaises > 0 ? null : 0) : Math.round(((c.postflopBets + c.postflopRaises) / c.postflopCalls) * 100) / 100,
    wtsd: pct(c.wtsdCount, c.sawFlopCount),
    wsd: pct(c.wsdCount, c.wtsdCount),
  };
}
