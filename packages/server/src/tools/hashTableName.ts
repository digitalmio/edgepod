// Super-fast, synchronous string hashing (djb2 algorithm)
function hashTableName(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export const hashMetaTableNames = (
  data: { changed: string[]; read: string[] } = { changed: [], read: [] },
) => ({
  read: data.read.map(hashTableName),
  changed: data.changed.map(hashTableName),
});
