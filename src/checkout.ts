import { validateProject, type Project } from "./editor/domain";

export interface DemoCartItem {
  id: string;
  mode: "demo";
  createdAt: string;
  project: Project;
  price: null;
}

/** Replace this local adapter when a real order backend is approved. */
export function createDemoCartItem(project: Project): DemoCartItem {
  if (!validateProject(project) || !project.design.layers.length) {
    throw new Error("Добавь дизайн перед продолжением.");
  }
  return {
    id: project.id,
    mode: "demo",
    createdAt: new Date().toISOString(),
    project: structuredClone(project),
    price: null,
  };
}

export async function addToDemoCart(project: Project): Promise<void> {
  const item = createDemoCartItem(project);
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("strogo-custom-demo-cart", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("items", { keyPath: "id" });
    request.onerror = () =>
      reject(
        new Error(
          "Не удалось открыть демо-корзину. Скачай PNG или повтори попытку.",
        ),
      );
    request.onblocked = () =>
      reject(
        new Error("Закрой другие вкладки конструктора и повтори попытку."),
      );
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("items", "readwrite");
      transaction.objectStore("items").put(item);
      transaction.oncomplete = () => {
        db.close();
        window.dispatchEvent(new Event("strogo:demo-cart"));
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(
          new Error(
            "Не удалось сохранить демо-корзину. Возможно, закончилось место.",
          ),
        );
      };
      transaction.onabort = () => {
        db.close();
        reject(new Error("Сохранение демо-корзины прервано. Повтори попытку."));
      };
    };
  });
}
