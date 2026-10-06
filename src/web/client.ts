/** Small vanilla-JS enhancement: drag-and-drop, with tap/click/keyboard-to-place as the fallback. */
export const CLIENT_JS = `
(function () {
  var dragged = null;
  var $ = function (id) { return document.getElementById(id); };
  function sync() {
    var slot = $('slot'); if (!slot) return;
    var words = [].map.call(slot.querySelectorAll('.chip'), function (c) { return c.dataset.word; });
    $('answer').value = words.join('|');
    $('check').disabled = words.length === 0;
    slot.classList.toggle('empty', words.length === 0);
  }
  function move(chip) {
    var slot = $('slot'), bank = $('bank'); if (!slot) return;
    (chip.parentNode === bank ? slot : bank).appendChild(chip);
    sync();
  }
  document.addEventListener('click', function (e) {
    var chip = e.target.closest && e.target.closest('.chip'); if (chip) move(chip);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('chip')) { e.preventDefault(); move(e.target); }
  });
  document.addEventListener('dragstart', function (e) {
    var chip = e.target.closest && e.target.closest('.chip'); if (!chip) return;
    dragged = chip; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', chip.dataset.word);
  });
  document.addEventListener('dragover', function (e) { if (dragged && e.target.closest('#slot, #bank')) e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    var zone = e.target.closest && e.target.closest('#slot, #bank'); if (!dragged || !zone) return;
    e.preventDefault();
    var before = [].filter.call(zone.querySelectorAll('.chip'), function (c) { return c !== dragged; })
      .find(function (c) { var r = c.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
    zone.insertBefore(dragged, before || null);
    dragged = null; sync();
  });
  document.addEventListener('dragend', function () { dragged = null; });
  document.addEventListener('htmx:afterSettle', sync);
  // Let HTMX swap 4xx/5xx responses so we can show their messages.
  document.addEventListener('htmx:beforeSwap', function (e) {
    if (e.detail.xhr.status >= 400) { e.detail.shouldSwap = true; e.detail.isError = false; }
  });
  sync();
})();
`;

export const CSS = `
:root { --bg:#f6f7f4; --fg:#1f2a1f; --muted:#667; --card:#fff; --accent:#58a700; --accent-d:#3d7a00; --bad:#d33; --line:#dde2d8; }
@media (prefers-color-scheme: dark) { :root { --bg:#14181a; --fg:#e8ede6; --muted:#9aa; --card:#1e2427; --line:#2e373b; --accent:#6cc10a; --accent-d:#8bdc2c; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 system-ui, sans-serif; }
header { display:flex; gap:1rem; align-items:center; padding:.75rem 1rem; border-bottom:1px solid var(--line); background:var(--card); }
header .brand { font-weight:800; color:var(--accent); text-decoration:none; font-size:1.2rem; }
header nav { margin-left:auto; display:flex; gap:1rem; align-items:center; }
a { color:var(--accent-d); }
main { max-width:640px; margin:1.5rem auto; padding:0 1rem; }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:1.25rem; margin-bottom:1rem; }
h1, h2 { margin:.2rem 0 .8rem; }
label { display:block; margin:.6rem 0 .2rem; font-weight:600; }
input[type=text], input[type=email], input[type=password] { width:100%; padding:.55rem; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--fg); font:inherit; }
button, .btn { background:var(--accent); color:#fff; border:0; border-radius:10px; padding:.6rem 1.1rem; font:inherit; font-weight:700; cursor:pointer; text-decoration:none; display:inline-block; }
button:disabled { opacity:.5; cursor:not-allowed; }
button.link { background:none; color:var(--accent-d); padding:0; font-weight:400; text-decoration:underline; }
.err { color:var(--bad); font-weight:600; } .ok { color:var(--accent-d); font-weight:600; } .muted { color:var(--muted); }
.stats { display:flex; gap:1.5rem; } .stat b { font-size:1.6rem; display:block; }
.progress { height:8px; background:var(--line); border-radius:99px; overflow:hidden; margin-bottom:1rem; }
.progress > div { height:100%; background:var(--accent); }
.sentence { font-size:1.4rem; margin:1rem 0; display:flex; flex-wrap:wrap; gap:.4rem; align-items:center; }
#slot { min-width:7rem; min-height:2.6rem; border-bottom:3px solid var(--line); display:inline-flex; gap:.4rem; padding:.2rem; border-radius:6px; }
#slot.empty { background:rgba(128,128,128,.12); }
#bank { display:flex; flex-wrap:wrap; gap:.5rem; min-height:3rem; margin:1rem 0; padding:.6rem; border:2px dashed var(--line); border-radius:10px; }
.chip { background:var(--card); border:2px solid var(--line); border-bottom-width:4px; border-radius:10px; padding:.3rem .8rem; font-size:1.1rem; cursor:grab; user-select:none; }
.chip:focus-visible { outline:3px solid var(--accent); }
table { width:100%; border-collapse:collapse; } th, td { padding:.4rem .5rem; text-align:left; border-bottom:1px solid var(--line); } td.n, th.n { text-align:right; }
tr.me td { font-weight:700; background:rgba(108,193,10,.12); }
.tabs { display:flex; gap:.5rem; margin-bottom:.6rem; } .tabs a { padding:.25rem .8rem; border-radius:99px; border:1px solid var(--line); text-decoration:none; } .tabs a.on { background:var(--accent); color:#fff; border-color:var(--accent); }
`;
