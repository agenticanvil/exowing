const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function installMenuKeyboard(root: Document = document) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;

    const menu = activeMenu(root);
    if (!menu) return;

    const verticalDirection = verticalMenuDirection(
      event.code,
      root.activeElement,
    );
    if (verticalDirection !== 0) {
      event.preventDefault();
      moveFocus(menu, verticalDirection, root.activeElement);
      return;
    }

    const horizontalDirection = horizontalControlDirection(event.code);
    if (horizontalDirection !== 0) {
      const target = root.activeElement;
      if (
        target instanceof HTMLInputElement &&
        target.type === "range" &&
        adjustRange(target, horizontalDirection)
      ) {
        event.preventDefault();
      } else if (
        target instanceof HTMLSelectElement &&
        adjustSelect(target, horizontalDirection)
      ) {
        event.preventDefault();
      }
      return;
    }

    const activeElement = root.activeElement;
    const isButton = activeElement instanceof HTMLButtonElement;
    const isToggle =
      activeElement instanceof HTMLInputElement &&
      (activeElement.type === "checkbox" || activeElement.type === "radio");
    if (
      !event.repeat &&
      (event.code === "Enter" || event.code === "Space") &&
      (isButton || isToggle)
    ) {
      event.preventDefault();
      activeElement.click();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}

function activeMenu(root: Document) {
  const menus = root.querySelectorAll<HTMLElement>(
    ".menu:not([hidden]):not([inert])",
  );
  return menus.item(menus.length - 1) || null;
}

function moveFocus(
  menu: HTMLElement,
  direction: -1 | 1,
  activeElement: Element | null,
) {
  const controls = [...menu.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
  if (controls.length === 0) return;
  const currentIndex = activeElement
    ? controls.indexOf(activeElement as HTMLElement)
    : -1;
  const nextIndex =
    currentIndex === -1
      ? direction === 1
        ? 0
        : controls.length - 1
      : (currentIndex + direction + controls.length) % controls.length;
  controls[nextIndex]?.focus();
}

function adjustRange(input: HTMLInputElement, direction: -1 | 1) {
  const minimum = input.min === "" ? 0 : Number(input.min);
  const maximum = input.max === "" ? 100 : Number(input.max);
  const step =
    input.step === "" || input.step === "any" ? 1 : Number(input.step);
  if (![minimum, maximum, step, input.valueAsNumber].every(Number.isFinite))
    return false;
  const value = Math.max(
    minimum,
    Math.min(maximum, input.valueAsNumber + step * direction),
  );
  if (value === input.valueAsNumber) return true;
  input.valueAsNumber = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function adjustSelect(select: HTMLSelectElement, direction: -1 | 1) {
  const enabledOptions = [...select.options].filter(
    (option) => !option.disabled && !option.hidden,
  );
  if (enabledOptions.length === 0) return false;
  const current = enabledOptions.indexOf(select.selectedOptions[0]);
  const next = Math.max(
    0,
    Math.min(enabledOptions.length - 1, current + direction),
  );
  const option = enabledOptions[next];
  if (!option || option === select.selectedOptions[0]) return true;
  select.value = option.value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function verticalMenuDirection(
  code: string,
  activeElement: Element | null,
): -1 | 0 | 1 {
  if (code === "ArrowUp" || code === "KeyW") return -1;
  if (code === "ArrowDown" || code === "KeyS") return 1;
  if (
    code === "KeyD" &&
    !(
      activeElement instanceof HTMLSelectElement ||
      (activeElement instanceof HTMLInputElement &&
        activeElement.type === "range")
    )
  )
    return 1;
  return 0;
}

function horizontalControlDirection(code: string): -1 | 0 | 1 {
  if (code === "ArrowLeft" || code === "KeyA") return -1;
  if (code === "ArrowRight" || code === "KeyD") return 1;
  return 0;
}
