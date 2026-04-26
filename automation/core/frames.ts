import type { Page, Frame } from 'playwright';

export function collectFrames(page: Page) {
  const frames = new Set<Frame>();
  const visit = (frame: Frame) => {
    frames.add(frame);
    frame.childFrames().forEach(visit);
  };
  visit(page.mainFrame());
  return Array.from(frames.values());
}
