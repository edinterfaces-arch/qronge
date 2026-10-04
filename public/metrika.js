(() => {
  const id = 113405844;

  window.qrongeStartMetrika = () => {
    if (window.qrongeMetrikaStarted) return;
    window.qrongeMetrikaStarted = true;
    window.dataLayer = window.dataLayer || [];

    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      for (let j = 0; j < document.scripts.length; j++) {
        if (document.scripts[j].src === r) return;
      }
      k = e.createElement(t);
      a = e.getElementsByTagName(t)[0];
      k.async = true;
      k.src = r;
      a.parentNode.insertBefore(k, a);
    })(window, document, 'script', `https://mc.yandex.ru/metrika/tag.js?id=${id}`, 'ym');

    window.ym(id, 'init', {
      ssr: true,
      webvisor: true,
      clickmap: true,
      ecommerce: 'dataLayer',
      referrer: document.referrer,
      url: location.href,
      accurateTrackBounce: true,
      trackLinks: true,
    });
  };

  try {
    if (localStorage.getItem('analytics-choice') === 'yes') {
      window.qrongeStartMetrika();
    }
  } catch {
    // Wait for explicit consent if browser storage is unavailable.
  }
})();
