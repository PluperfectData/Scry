import '@testing-library/jest-dom'

process.env.VITE_API_URL ??= 'http://localhost:6161'

// jsdom has no modal dialogs. These open and close one, firing close as a browser does.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.open = true
}
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.open = false
  this.dispatchEvent(new Event('close'))
}
