import type { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma';
import { API_ERROR_CODES } from '../lib/errorCodes';

export function createUpcomingBirthdaysHandler(database: Pick<PrismaClient, 'follow'> = prisma, now = () => new Date()) {
  return async (req: Request, res: Response) => {
    res.set('Cache-Control', 'private, no-store');
    if (Object.keys(req.query).length) return res.status(400).json({ errorCode: API_ERROR_CODES.INVALID_INPUT });
    try {
      const follows = await database.follow.findMany({
        where: { followerId: (req as any).user.id, following: { isBirthdayVisible: true, birthday: { not: null } } },
        select: { following: { select: { id: true, name: true, nicknames: true, avatarUrl: true, isAvatarVisible: true, birthday: true } } },
      });
      const clock = now();
      const today = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate()));
      const end = new Date(today); end.setUTCDate(end.getUTCDate() + 30);
      const upcoming = follows.map(({ following: friend }) => {
        const born = friend.birthday!;
        let next = new Date(Date.UTC(today.getUTCFullYear(), born.getUTCMonth(), born.getUTCDate()));
        if (next < today) next = new Date(Date.UTC(today.getUTCFullYear() + 1, born.getUTCMonth(), born.getUTCDate()));
        return { friend, next };
      }).filter(({ next }) => next >= today && next <= end)
        .sort((a, b) => a.next.getTime() - b.next.getTime() || a.friend.id - b.friend.id)
        .map(({ friend, next }) => ({ id: friend.id, name: friend.name, nicknames: friend.nicknames,
          avatarUrl: friend.isAvatarVisible ? friend.avatarUrl : null, birthday: friend.birthday, nextBirthday: next }));
      return res.json(upcoming);
    } catch {
      console.error('Birthdays unavailable; personal and database details withheld');
      return res.status(500).json({ errorCode: API_ERROR_CODES.INTERNAL_ERROR });
    }
  };
}
export const getUpcomingBirthdays = createUpcomingBirthdaysHandler();
