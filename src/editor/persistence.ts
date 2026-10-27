import { validateProject, type Project } from "./domain";

const DATABASE = "strogo-custom-local";
const STORE = "projects";
function database(): Promise<IDBDatabase> {
  if (!("indexedDB" in globalThis))
    return Promise.reject(
      new Error(
        "Локальное сохранение недоступно в этом браузере. Скачайте PNG-превью.",
      ),
    );
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Не удалось открыть локальное хранилище. Проверьте настройки приватности браузера.",
        ),
      );
    request.onblocked = () =>
      reject(
        new Error(
          "Закройте другие вкладки конструктора и повторите сохранение.",
        ),
      );
  });
}

async function write(key: string, value?: Project): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      if (value) store.put(value, key);
      else store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          new Error(
            "Не удалось сохранить проект. Возможно, закончилось место. Скачайте PNG-превью.",
          ),
        );
      tx.onabort = () =>
        reject(
          new Error(
            "Сохранение прервано. Проверьте свободное место и повторите.",
          ),
        );
    });
  } finally {
    db.close();
  }
}

export async function saveProject(project: Project): Promise<void> {
  if (!validateProject(project))
    throw new Error(
      "Конфигурация проекта повреждена. Проверьте параметры дизайна.",
    );
  await write("draft", { ...project, updatedAt: new Date().toISOString() });
}
export async function loadProject(): Promise<Project | null> {
  const db = await database();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get("draft");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          new Error(
            "Не удалось восстановить проект. Попробуйте открыть страницу ещё раз.",
          ),
        );
    });
    if (value === undefined) return null;
    if (!validateProject(value))
      throw new Error(
        "Сохранённый проект повреждён или устарел. Начните новый дизайн.",
      );
    return value;
  } finally {
    db.close();
  }
}
export async function clearProject(): Promise<void> {
  await write("draft");
}
