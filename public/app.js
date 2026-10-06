(() => {
 const config = JSON.parse(document.getElementById('site-data').textContent);
 const $ = id => document.getElementById(id);
 const form = $('lead-form'), model = $('model'), variant = $('variant'), quantity = $('quantity');
 const money = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
 let analytics = false, submitted = false, pending = false, started = false;
 let requestId = crypto.randomUUID(), lastPayload = '', placement = 'page';
 const track = (event, params = {}, callback) => {
  if (analytics && window.ym) window.ym(Number(config.metrikaId), 'reachGoal', event, params, callback);
 };
 const ecommerce = data => {
  if (analytics) (window.dataLayer = window.dataLayer || []).push({ecommerce: {currencyCode: 'RUB', ...data}});
 };
 function startAnalytics() {
  if (analytics || !config.metrikaId) return;
  analytics = true;
  window.qrongeStartMetrika?.();
  document.dispatchEvent(new Event('qronge:analytics-ready'));
 }
 if (config.metrikaId) {
  let choice;
  try { choice = localStorage.getItem('analytics-choice-v2'); } catch {}
  if (choice === 'yes') startAnalytics();
  else if (!choice) $('cookie-choice').hidden = false;
  $('analytics-accept').onclick = () => {
   try { localStorage.setItem('analytics-choice-v2', 'yes'); } catch {}
   $('cookie-choice').hidden = true;
   startAnalytics();
  };
  $('analytics-decline').onclick = () => {
   try { localStorage.setItem('analytics-choice-v2', 'no'); } catch {}
   $('cookie-choice').hidden = true;
  };
 }
 document.querySelectorAll('[data-goal]').forEach(el => el.addEventListener('click', () => track(el.dataset.goal)));

 // Product events contain catalog data only. Collection starts after analytics consent.
 const cards = [...document.querySelectorAll('.product-card[data-model]')];
 const itemData = (slug, card) => {
  const p = config.products.find(item => item.slug === slug);
  return {id: slug, name: p ? `QRONGE ${p.name}` : slug, brand: 'QRONGE',
   ...(p?.price ? {price: p.price} : {}),
   ...(card ? {list: card.dataset.list, position: Number(card.dataset.position)} : {})};
 };
 let measurementStarted = false;
 function measureCatalog() {
  if (!analytics || measurementStarted) return;
  measurementStarted = true;
  const detail = document.querySelector('[data-detail-model]');
  if (detail) {
   ecommerce({detail: {products: [itemData(detail.dataset.detailModel)]}});
   track('product_view', {model: detail.dataset.detailModel});
  }
  if (!('IntersectionObserver' in window)) return;
  const seen = new Set(), timers = new Map();
  const clearTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  const observer = new IntersectionObserver(entries => {
   entries.forEach(entry => {
    const card = entry.target;
    if (entry.intersectionRatio >= 0.5 && !document.hidden && !seen.has(card)) {
     if (timers.has(card)) return;
     timers.set(card, setTimeout(() => {
      timers.delete(card);
      if (document.hidden) return;
      seen.add(card);
      observer.unobserve(card);
      ecommerce({impressions: [itemData(card.dataset.model, card)]});
      track('product_impression', {model: card.dataset.model, list: card.dataset.list, position: Number(card.dataset.position)});
     }, 1000));
    } else { clearTimeout(timers.get(card)); timers.delete(card); }
   });
  }, {threshold: [0, 0.5]});
  const resume = () => cards.filter(card => !seen.has(card)).forEach(card => observer.observe(card));
  resume();
  document.addEventListener('visibilitychange', () => {
   clearTimers(); observer.disconnect();
   if (!document.hidden) resume();
  });
  window.addEventListener('pagehide', () => { clearTimers(); observer.disconnect(); });
  window.addEventListener('pageshow', () => { if (!document.hidden) resume(); });
 }
 document.addEventListener('qronge:analytics-ready', measureCatalog);
 measureCatalog();
 document.querySelectorAll('[data-product-link]').forEach(link => link.addEventListener('click', event => {
  const card = link.closest('[data-model]');
  if (!card || !analytics) return;
  ecommerce({click: {products: [itemData(card.dataset.model, card)]}});
  const params = {model: card.dataset.model, list: card.dataset.list, position: Number(card.dataset.position)};
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank' || !window.ym) {
   track('product_click', params); return;
  }
  // Preserve ordinary links and modifier keys; cap the analytics navigation delay.
  event.preventDefault();
  let navigated = false;
  const navigate = () => { if (!navigated) { navigated = true; location.assign(link.href); } };
  setTimeout(navigate, 200);
  track('product_click', params, navigate);
 }));
 if (!form) return;

 const product = () => config.products.find(p => p.slug === model.value);
 const leadContext = () => ({model: model.value || 'selection', quantity: Number(quantity.value), placement});
 function updateSummary() {
  const p = product(), q = Number(quantity.value);
  $('order-summary').textContent = !Number.isInteger(q) || q < config.minOrder
   ? `Минимальный заказ — ${config.minOrder} шт.`
   : q > 999 ? 'Для партии больше 999 шт. позвоните нам.'
   : q < config.bulkFrom ? `Заказ ${q} шт.: цену и условия согласуем индивидуально. Оптовая цена действует от ${config.bulkFrom} шт. одной модели.`
   : p?.price ? `${money(p.price)} / шт. × ${q} шт. = ${money(p.price * q)} за партию.`
   : p ? 'Уточним актуальную оптовую цену выбранной модели.' : 'Поможем подобрать модель под ваш бюджет.';
 }
 function updateVariants() {
  const p = product();
  variant.replaceChildren(new Option('Уточнить с менеджером', ''));
  p?.variants.forEach(v => variant.add(new Option(v.color.charAt(0).toUpperCase() + v.color.slice(1), v.sku)));
  if (p?.variants.length === 1) variant.value = p.variants[0].sku;
  const single = !p || p.variants.length <= 1;
  $('variant-field').hidden = single;
  variant.closest('.form-row').classList.toggle('single-variant', single);
  $('selected-model').hidden = !p;
  $('model-field').hidden = !!p;
  $('selected-model-name').textContent = p ? `QRONGE ${p.name}` : '';
  updateSummary();
 }
 $('change-model').onclick = () => {
  $('selected-model').hidden = true;
  $('model-field').hidden = false;
  model.focus();
 };
 function resetForm() {
  if (submitted) {
   $('form-fields').hidden = false;
   $('form-status').replaceChildren();
   submitted = false; requestId = crypto.randomUUID(); lastPayload = '';
  }
 }
 let requestDialog = null, requestOpener = null;
 if (typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function') {
  requestDialog = document.createElement('dialog');
  requestDialog.id = 'request-dialog'; requestDialog.className = 'request-dialog';
  requestDialog.setAttribute('aria-labelledby', 'request-title');
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'request-dialog-close'; close.textContent = 'Закрыть';
  close.setAttribute('aria-label', 'Закрыть форму запроса'); close.onclick = () => requestDialog.close();
  requestDialog.append(close, $('request')); document.body.append(requestDialog);
  requestDialog.addEventListener('close', () => {
   document.documentElement.classList.remove('request-dialog-open');
   if (requestOpener?.isConnected) requestOpener.focus({preventScroll: true});
  });
  requestDialog.addEventListener('click', event => {
   const rect = requestDialog.getBoundingClientRect();
   if (event.target === requestDialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) requestDialog.close();
  });
 }
 function goToForm(slug, smallOrder = false, source = 'page') {
  if (!pending) {
   resetForm(); model.value = slug || ''; quantity.value = smallOrder ? config.minOrder : config.bulkFrom;
   placement = source; started = false; updateVariants();
   track('lead_open', {...leadContext(), price_mode: smallOrder ? 'negotiated' : 'wholesale'});
  }
  if (requestDialog) {
   requestOpener = document.activeElement;
   if (!requestDialog.open) requestDialog.showModal();
   requestDialog.scrollTop = 0; document.documentElement.classList.add('request-dialog-open');
  } else $('request').scrollIntoView({behavior: 'auto'});
  $('phone').focus({preventScroll: true});
 }
 document.querySelectorAll('[data-product]').forEach(button => {
  button.setAttribute('aria-haspopup', 'dialog');
  button.onclick = () => goToForm(button.dataset.product, button.hasAttribute('data-small-order'), button.dataset.placement || 'card');
 });
 document.querySelectorAll('a[href="#request"]').forEach(link => {
  link.setAttribute('aria-haspopup', 'dialog');
  link.onclick = event => {
   event.preventDefault();
   const pageModel = document.querySelector('[data-detail-model]')?.dataset.detailModel;
   goToForm(pageModel || model.value, false, link.id === 'request-mobile' ? 'mobile' : 'product');
  };
 });
 if ($('bulk-button')) $('bulk-button').onclick = () => goToForm('', false, 'bulk');
 updateVariants();
 model.onchange = () => { updateVariants(); if (model.value) quantity.focus(); };
 quantity.oninput = updateSummary;
 const params = new URLSearchParams(location.search);
 const requested = config.modelAliases?.[params.get('model')] || params.get('model');
 if (requested && config.products.some(p => p.slug === requested)) { model.value = requested; updateVariants(); }
 if (location.hash === '#request') goToForm(model.value);
 const attribution = {};
 ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid'].forEach(key => {
  const value = params.get(key); if (value) attribution[key] = value.slice(0, 250);
 });
 let prior = {};
 try {
  prior = JSON.parse(sessionStorage.getItem('campaign') || '{}');
  if (Object.keys(attribution).length) sessionStorage.setItem('campaign', JSON.stringify(attribution));
 } catch {}
 const campaign = Object.keys(attribution).length ? attribution : prior;
 form.addEventListener('input', event => {
  if (event.target.name === 'website' || started) return;
  started = true; track('lead_start', leadContext());
 });
 form.addEventListener('invalid', event => {
  if (['phone','quantity','consent'].includes(event.target.name)) track('lead_validation_error', {...leadContext(), field: event.target.name});
 }, true);
 $('phone').oninput = () => $('phone').setCustomValidity('');
 form.addEventListener('submit', async event => {
  event.preventDefault(); if (pending) return;
  let phone = $('phone').value.replace(/\D/g, '');
  if (phone.length === 10) phone = '7' + phone;
  if (phone.length === 11 && phone[0] === '8') phone = '7' + phone.slice(1);
  if (!/^7\d{10}$/.test(phone)) {
   $('phone').setCustomValidity('Введите российский номер: +7 и ещё 10 цифр.');
   $('phone').reportValidity(); return;
  }
  if (!form.reportValidity()) return;
  const button = form.querySelector('[type=submit]'), status = $('form-status');
  pending = true; button.disabled = true; button.textContent = 'Отправляем…'; status.replaceChildren();
  const payload = {model: model.value, variant: variant.value, quantity: Number(quantity.value), phone: '+' + phone, name: '', consent: form.elements.consent.checked, website: form.elements.website.value, attribution: campaign, path: location.pathname};
  const fingerprint = JSON.stringify(payload);
  if (lastPayload && fingerprint !== lastPayload) requestId = crypto.randomUUID();
  lastPayload = fingerprint; payload.requestId = requestId;
  const context = {...leadContext()};
  let errorKind = 'network';
  try {
   const response = await fetch('/api/leads', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)});
   errorKind = response.ok ? 'invalid_response' : `http_${response.status}`;
   const result = await response.json();
   if (!response.ok) throw new Error(result.error || 'Не удалось отправить заявку.');
   if (!result.ok || !result.id) throw new Error('Сервер не подтвердил получение заявки.');
   submitted = true; $('form-fields').hidden = true;
   const box = document.createElement('div'); box.className = 'success';
   const h = document.createElement('h3'); h.textContent = 'Заявка получена.';
   const p = document.createElement('p');
   const chosen = config.products.find(item => item.slug === payload.model);
   p.textContent = `Номер ${result.id}. ${chosen ? 'QRONGE ' + chosen.name : 'Подбор модели'}, ${payload.quantity} шт. Позвоним по номеру +${phone}, чтобы подтвердить наличие и условия покупки.`;
   const note = document.createElement('p'); note.textContent = 'Перед поездкой дождитесь подтверждения от магазина.';
   const again = document.createElement('button'); again.type = 'button'; again.className = 'btn secondary'; again.textContent = 'Оставить ещё одну заявку';
   again.onclick = () => { form.reset(); resetForm(); started = false; updateVariants(); };
   box.append(h, p, note, again); status.append(box);
   track('lead_success', {...context, order_id: result.id});
   status.scrollIntoView({behavior: 'smooth', block: 'center'});
  } catch (error) {
   track('lead_error', {...context, reason: error.name === 'TimeoutError' ? 'timeout' : errorKind});
   const p = document.createElement('p'); p.className = 'error-message';
   p.textContent = error.name === 'TimeoutError' || error.name === 'TypeError' || error.name === 'SyntaxError'
    ? 'Не удалось получить подтверждение. Проверьте соединение и повторите отправку или позвоните нам.' : error.message;
   const call = document.createElement('a'); call.href = 'tel:+79174600707'; call.textContent = '+7 917 460-07-07';
   call.addEventListener('click', () => track('phone_click', {placement: 'form_error'}));
   status.append(p, call);
  } finally { pending = false; button.disabled = false; button.textContent = 'Отправить заявку'; }
 });
})();
