import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const submissions = pgTable('submissions', {
  id: serial('id').primaryKey(),
  authorName: text('author_name').notNull(),
  storyText: text('story_text').notNull(),
  fileUrl: text('file_url'),
  instagram: text('instagram'),
  tiktok: text('tiktok'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});