// Shared: header/footer injection, mobile menu, analytics.
(function () {
  var GA = 'G-1EC9HP9GTD';
  var PIXEL = '996664429816494';

  var header =
    '<header class="nav"><div class="wrap">' +
    '<a class="brand" href="/"><img src="/mascot-sm.png" alt="Wreckly logo" width="34" height="44"><span>Wreckly</span></a>' +
    '<button class="menu-btn" aria-label="Menu" id="menuBtn">&#9776;</button>' +
    '<nav id="mainNav"><a href="/#how">How it works</a><a href="/yards.html">For yards</a>' +
    '<a class="btn small" href="/request.html">Find a part</a></nav></div></header>';

  var footer =
    '<footer><div class="wrap"><div class="row">' +
    '<div><strong style="color:#fff;font-style:italic;text-transform:uppercase">Wreckly</strong><br>Find parts. Skip the calls.<br>Ontario, Canada</div>' +
    '<div><a href="/terms.html">Terms of Service</a><br><a href="/privacy.html">Privacy Policy</a><br><a href="mailto:info@wreckly.ca">info@wreckly.ca</a></div>' +
    '</div><p style="margin-top:18px;font-size:.82rem">Wreckly is an intermediary. Parts are sold by independent yards, which are responsible for the parts and any warranty.</p></div></footer>';

  var h = document.getElementById('site-header');
  if (h) h.outerHTML = header;
  var f = document.getElementById('site-footer');
  if (f) f.outerHTML = footer;

  var btn = document.getElementById('menuBtn');
  if (btn) btn.addEventListener('click', function () {
    document.getElementById('mainNav').classList.toggle('open');
  });

  // Google Analytics
  var s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date()); gtag('config', GA);

  // Meta Pixel
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', PIXEL); fbq('track', 'PageView');

  // Helper for forms
  window.wrecklyPost = function (url, data) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
  };
})();
