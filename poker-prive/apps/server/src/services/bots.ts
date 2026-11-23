/**
 * Robots de test : de vrais comptes (marqués par un domaine d'e-mail réservé,
 * sans mot de passe utilisable) pilotés par le serveur. Ils passent par
 * exactement les mêmes règles que les humains (le moteur valide leurs actions).
 */
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';

export const BOT_EMAIL_DOMAIN = '@bots.cercle-prive.local';
export const isBotEmail = (email: string) => email.endsWith(BOT_EMAIL_DOMAIN);

const NAMES = ['Ada', 'Bruno', 'Chloé', 'Dédé', 'Émile', 'Fanny', 'Gaston', 'Hélène', 'Igor', 'Josette', 'Kiki', 'Lulu', 'Marcel', 'Nina', 'Oscar'];

/** Retourne un robot libre (crée le compte si besoin) avec un solde suffisant. */
export async function getBotUser(exclude: string[], minChips: number): Promise<{ id: string; username: string; avatarUrl: string | null }> {
  const existing = await prisma.user.findFirst({
    where: { email: { endsWith: BOT_EMAIL_DOMAIN }, id: { notIn: exclude.length ? exclude : [''] }, banned: false },
    orderBy: { createdAt: 'asc' },
  });
  let bot = existing;
  if (!bot) {
    const count = await prisma.user.count({ where: { email: { endsWith: BOT_EMAIL_DOMAIN } } });
    const base = `Robot ${NAMES[count % NAMES.length]}`;
    const username = count < NAMES.length ? base : `${base} ${Math.floor(count / NAMES.length) + 1}`;
    bot = await prisma.user.create({
      data: {
        email: `bot-${randomBytes(6).toString('hex')}${BOT_EMAIL_DOMAIN}`,
        username,
        passwordHash: '!robot-sans-mot-de-passe', // aucun mot de passe ne peut correspondre
        chips: 1_000_000,
      },
    });
  }
  if (bot.chips < minChips) bot = await prisma.user.update({ where: { id: bot.id }, data: { chips: 1_000_000 } });
  return { id: bot.id, username: bot.username, avatarUrl: bot.avatarUrl };
}
