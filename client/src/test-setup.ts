import '@testing-library/jest-dom';

// jsdom не реалізує scrollIntoView
window.HTMLElement.prototype.scrollIntoView = () => {};
