// Shown until Leeward draws its first screen. If it can't start (a script failed to load, or it
// crashed while starting), say so and offer a reload instead of leaving an empty window.
(function () {
  var boot = document.getElementById('boot');
  if (!boot) return;
  function stuck(detail) {
    if (!document.getElementById('boot')) return; // the app is up
    boot.querySelector('.boot-wait').hidden = true;
    boot.querySelector('.boot-stuck').hidden = false;
    if (detail) boot.querySelector('.boot-detail').textContent = detail;
  }
  boot.querySelector('.boot-reload').addEventListener('click', function () {
    location.reload();
  });
  setTimeout(function () {
    stuck('');
  }, 20000);
  // resource errors don't bubble, so listen in the capture phase
  window.addEventListener(
    'error',
    function (e) {
      var t = e.target;
      if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')) stuck('Part of Leeward didn’t load.');
      else if (e.error) stuck(String(e.error.message || e.error));
    },
    true,
  );
})();
