export const prismaSchemaTemplate =
  () => `// This is your Prisma schema file where you can define your database models and relationships.
// Feel free to delete example models or amend them to fit your application's needs.

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  name      String?
  createdAt DateTime @default(now())
  posts     Post[]
}

model Post {
  id       Int     @id @default(autoincrement())
  title    String
  content  String?
  authorId Int
  User     User    @relation(fields: [authorId], references: [id])
}

`;
