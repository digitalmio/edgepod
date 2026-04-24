export const functionsIndexTemplate = () => `import { EdgePodContext } from '@edgepod/server';
import { DB } from '../.generated'; // This is Auto-generated for you from schema.prisma

// 1. Setup the typed context
type Ctx = EdgePodContext<DB>;

// 2. Export standard queries
export const getUsers = async (ctx: Ctx) => {
  // Autocomplete will perfectly suggest 'User' and 'Post' here!
  return await ctx.db.selectFrom('User').selectAll().execute();
};

// 3. Export queries with arguments
export const getUserById = async (ctx: Ctx, args: { id: number }) => {
  return await ctx.db
    .selectFrom('User')
    .selectAll()
    .where('id', '=', args.id)
    .executeTakeFirst();
};

// 4. Export mutations (This automatically triggers the WebSocket invalidation!)
export const insertUser = async (ctx: Ctx, args: { email: string; name: string }) => {
  const newUser = await ctx.db
    .insertInto('User')
    .values({
      email: args.email,
      name: args.name,
      createdAt: new Date().toISOString()
    })
    .returningAll()
    .executeTakeFirst();

  return newUser;
};
`;
