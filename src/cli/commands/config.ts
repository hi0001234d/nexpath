import { openStore, closeStore, DEFAULT_DB_PATH, getConfig, setConfig } from '../../store/index.js';

export async function configGetAction(key: string, dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  const value = getConfig(store.db, key);
  closeStore(store);

  if (value === undefined) {
    console.log('(not set)');
  } else {
    console.log(value);
  }
}

export async function configSetAction(key: string, value: string, dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  setConfig(store, key, value);
  closeStore(store);
  console.log(`${key} = ${value}`);
}
