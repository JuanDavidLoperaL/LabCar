/** Clona un <template> del HTML. Todo el marcado vive en los .html; el TS solo llena datos. */
export function cloneTemplate<T extends Element = HTMLElement>(templateId: string): T {
  const template = document.getElementById(templateId);
  if (!(template instanceof HTMLTemplateElement)) throw new Error(`No existe el <template id="${templateId}">`);
  const element = template.content.firstElementChild?.cloneNode(true);
  if (!(element instanceof Element)) throw new Error(`El <template id="${templateId}"> está vacío`);
  return element as T;
}

/** Busca un hijo marcado con data-field="nombre". */
export function field<T extends HTMLElement = HTMLElement>(root: ParentNode, name: string): T {
  const element = root.querySelector<T>(`[data-field="${name}"]`);
  if (!element) throw new Error(`Falta [data-field="${name}"]`);
  return element;
}

/** Asigna texto de forma segura (nunca innerHTML con datos de la base). */
export function setField(root: ParentNode, name: string, text: string): void {
  field(root, name).textContent = text;
}
