/** Conecta un botón para mostrar u ocultar la contraseña de un input. */
export function setupPasswordToggle(input: HTMLInputElement, button: HTMLButtonElement, icon: HTMLElement): void {
  button.addEventListener('click', () => {
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    icon.textContent = hidden ? 'visibility_off' : 'visibility';
    button.setAttribute('aria-pressed', String(hidden));
  });
}
