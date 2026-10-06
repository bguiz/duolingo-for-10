import { AuthService } from '../auth/service';
import type { Db } from '../db/types';
import { LessonService } from '../domain/lessons';
import type { LlmClient } from '../llm/client';
import type { Mailer } from '../mail/types';

export interface Deps {
  db: Db;
  auth: AuthService;
  lessons: LessonService;
  llm: LlmClient;
  now: () => Date;
  baseUrl: string;
}

export function buildDeps(o: { db: Db; mailer: Mailer; llm: LlmClient; baseUrl: string; now?: () => Date }): Deps {
  const now = o.now ?? (() => new Date());
  return {
    db: o.db,
    auth: new AuthService(o.db, o.mailer, o.baseUrl, now),
    lessons: new LessonService(o.db, now),
    llm: o.llm,
    now,
    baseUrl: o.baseUrl,
  };
}
