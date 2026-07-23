import { driveCentricParserConfig } from './drivecentric/selectors';

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = Object.getPrototypeOf(element) as HTMLInputElement | HTMLTextAreaElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function insertTextIntoDriveCentric(text: string) {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
    setNativeValue(active, text);
    active.focus();
    return true;
  }

  if (active instanceof HTMLElement && active.isContentEditable) {
    active.textContent = text;
    active.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    active.focus();
    return true;
  }

  for (const selector of driveCentricParserConfig.replyInputSelectors) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
      setNativeValue(element, text);
      element.focus();
      return true;
    }
    if (element instanceof HTMLElement && element.isContentEditable) {
      element.textContent = text;
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      element.focus();
      return true;
    }
  }

  return false;
}
