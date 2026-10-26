/**
 * Comandos ESC/POS para la impresora térmica (Epson TM-m30II, papel de 80 mm).
 * Con la fuente A caben 48 caracteres por línea; el texto se envía en la página de códigos
 * WPC1252 para que salgan bien las tildes, la ñ, ¡ y ¿.
 */
export const LINE_WIDTH = 48;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
/** ESC t 16 = página de códigos WPC1252 (Latin-1 occidental). */
const CODE_PAGE_WPC1252 = 16;

/** Caracteres que Intl y el texto de la app usan y que no existen en WPC1252. */
const REPLACEMENTS: Record<string, string> = {
  ' ': ' ', // espacio sin quiebre ("$ 650.000")
  ' ': ' ', // espacio fino ("3:15 p. m.")
  '−': '-', // signo menos
  '–': '-',
  '—': '-',
};

/** Texto → bytes WPC1252. Lo que no existe en esa página se cambia por su letra sin tilde o por "?". */
export function encode(text: string): number[] {
  const bytes: number[] = [];
  for (const raw of text) {
    const char = REPLACEMENTS[raw] ?? raw;
    const code = char.codePointAt(0) ?? 0x3f;
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const plain = char.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const plainCode = plain.codePointAt(0) ?? 0x3f;
    bytes.push(plain.length === 1 && plainCode <= 0xff ? plainCode : 0x3f);
  }
  return bytes;
}

/** Corta el texto en líneas del ancho dado sin partir palabras (salvo una palabra más larga que la línea). */
export function wrap(text: string, width = LINE_WIDTH): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let piece = word;
      while (piece.length > width) {
        if (current) lines.push(current);
        lines.push(piece.slice(0, width));
        piece = piece.slice(width);
        current = '';
      }
      const candidate = current ? `${current} ${piece}` : piece;
      if (candidate.length > width) {
        lines.push(current);
        current = piece;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

/** "Subtotal ............ $ 650.000": texto a la izquierda y valor a la derecha en una misma línea. */
export function columns(left: string, right: string, width = LINE_WIDTH): string[] {
  const space = width - right.length - 1;
  if (left.length <= space) return [left + ' '.repeat(width - left.length - right.length) + right];
  // Si no cabe, la parte izquierda se parte y el valor va al final de la última línea.
  const lines = wrap(left, space);
  const last = lines.pop() ?? '';
  return [...lines, last + ' '.repeat(width - last.length - right.length) + right];
}

export class Ticket {
  private readonly bytes: number[] = [ESC, 0x40, ESC, 0x74, CODE_PAGE_WPC1252];

  align(position: 'left' | 'center'): this {
    this.bytes.push(ESC, 0x61, position === 'center' ? 1 : 0);
    return this;
  }

  bold(on: boolean): this {
    this.bytes.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** Texto al doble de alto y ancho (títulos y total). Ocupa la mitad de columnas. */
  large(on: boolean): this {
    this.bytes.push(GS, 0x21, on ? 0x11 : 0x00);
    return this;
  }

  line(text = ''): this {
    this.bytes.push(...encode(text), LF);
    return this;
  }

  lines(texts: readonly string[]): this {
    texts.forEach((text) => this.line(text));
    return this;
  }

  separator(): this {
    return this.line('-'.repeat(LINE_WIDTH));
  }

  raw(bytes: readonly number[]): this {
    this.bytes.push(...bytes);
    return this;
  }

  /**
   * Código QR nativo de la impresora (GS ( k, modelo 2, corrección de errores M). `size` es el
   * tamaño de cada punto (1–16): 6 deja un QR de unos 3 cm, fácil de escanear con el celular.
   */
  qr(data: string, size = 6): this {
    const payload = Array.from(new TextEncoder().encode(data));
    const length = payload.length + 3;
    this.bytes.push(
      GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00, // modelo 2
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size, // tamaño del punto
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31, // corrección M (15%)
      GS, 0x28, 0x6b, length & 0xff, length >> 8, 0x31, 0x50, 0x30, ...payload, // guardar datos
      GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30, // imprimir
      LF,
    );
    return this;
  }

  /** Avanza el papel y lo corta (corte parcial: la tirilla queda colgando y se arranca fácil). */
  cut(): this {
    this.bytes.push(LF, LF, LF, GS, 0x56, 0x41, 0x00);
    return this;
  }

  toBase64(): string {
    let binary = '';
    for (const byte of this.bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
}

/**
 * Imagen → comando de mapa de bits (GS v 0) en blanco y negro. Devuelve [] si la imagen no carga:
 * el ticket se imprime igual, sin logo.
 * `ink`: 'dark' = se imprime lo oscuro (imagen sobre fondo blanco) · 'opaque' = se imprime todo lo
 * que no es transparente (logo claro sobre fondo transparente, como el de LAB CAR para el tema oscuro).
 */
export async function imageToRaster(src: string, width: number, ink: 'dark' | 'opaque' = 'dark'): Promise<number[]> {
  const image = new Image();
  image.src = src;
  try {
    await image.decode();
  } catch {
    console.warn('No se pudo cargar el logo para la tirilla: se imprime sin logo.');
    return [];
  }

  const isInk = (data: Uint8ClampedArray, i: number) =>
    ink === 'opaque' ? data[i + 3] >= 128 : 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 128;
  const draw = (canvas: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number) => {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    if (ink === 'dark') {
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return context.getImageData(0, 0, canvas.width, canvas.height).data;
  };

  // 1. Recorta los márgenes vacíos de la imagen para no gastar papel.
  const full = document.createElement('canvas');
  full.width = image.naturalWidth;
  full.height = image.naturalHeight;
  const fullData = draw(full, 0, 0, full.width, full.height);
  if (!fullData) return [];
  let top = full.height, bottom = -1, left = full.width, right = -1;
  for (let y = 0; y < full.height; y++) {
    for (let x = 0; x < full.width; x++) {
      if (!isInk(fullData, (y * full.width + x) * 4)) continue;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  if (bottom < 0) return [];
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;

  // 2. Escala lo recortado al ancho pedido y lo pasa a puntos blanco/negro (8 puntos por byte).
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round((cropHeight * width) / cropWidth);
  const data = draw(canvas, left, top, cropWidth, cropHeight);
  if (!data) return [];
  const height = canvas.height;
  const bytesPerRow = Math.ceil(width / 8);
  const raster: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let column = 0; column < bytesPerRow; column++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = column * 8 + bit;
        if (x < width && isInk(data, (y * width + x) * 4)) byte |= 0x80 >> bit;
      }
      raster.push(byte);
    }
  }
  return [GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, bytesPerRow >> 8, height & 0xff, height >> 8, ...raster, LF];
}
