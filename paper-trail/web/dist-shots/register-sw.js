// Lets the page be installed and start fast. It only ever stores the app's own files, never anyone's papers.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* the app works without it */ });
  });
}
