import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  clerkId: text('clerk_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const audios = pgTable('audios', {
  id: text('id').primaryKey().default(sql`gen_random_uuid()`),
  clerkUserId: text('clerk_user_id'),
  topic: text('topic').notNull(),
  title: text('title').notNull(),
  script: text('script'),
  audioUrl: text('audio_url'),
  lengthMinutes: integer('length_minutes'),
  format: text('format').notNull(),
  tones: text('tones').notNull().default(''),
  radioStyle: text('radio_style'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
