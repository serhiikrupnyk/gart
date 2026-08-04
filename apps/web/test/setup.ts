import '@testing-library/jest-dom';

// jsdom has no matchMedia; the theme code asks it for the system preference.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }),
});

// jsdom implements no layout, so scrolling is a no-op rather than a method.
// The chat keeps the newest message in view with it.
Element.prototype.scrollIntoView = jest.fn();
