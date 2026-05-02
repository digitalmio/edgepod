// Super-fast, synchronous string hashing (djb2 algorithm)
const hashTableName = (str: string): string => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

export const hashMetaTableNames = (tables: string[]) => tables.map(hashTableName);
