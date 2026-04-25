export const schemaTemplate = () => `// This is your Edgepod schema file.
// Define your database tables and their relationships here using the Edgepod schema builder (based on Drizzle ORM).
// This file is used to generate the types for your database and to create the actual database structure on the Edgepod server.

import { table, text, integer } from '@edgepod/server';

export const users = table('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: text('created_at').$defaultFn(() => new Date().toISOString()),
});

export const posts = table('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content'),
  authorId: integer('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});
`;
