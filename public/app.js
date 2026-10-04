(() => {
 const config=JSON.parse(document.getElementById('site-data').textContent);
 const $=id=>document.getElementById(id), form=$('lead-form'), model=$('model'), variant=$('variant'), quantity=$('quantity');
 const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
 let analytics=false, submitted=false, requestId=crypto.randomUUID(), lastPayload='';
 const track=(event,params={})=>{if(analytics&&window.ym)window.ym(Number(config.metrikaId),'reachGoal',event,params);};
 function startAnalytics(){if(analytics||!config.metrikaId)return;analytics=true;window.qrongeStartMetrika?.();}
 if(config.metrikaId){let choice;try{choice=localStorage.getItem('analytics-choice-v2')}catch{}if(choice==='yes')startAnalytics();else if(!choice)$('cookie-choice').hidden=false;$('analytics-accept').onclick=()=>{try{localStorage.setItem('analytics-choice-v2','yes')}catch{}$('cookie-choice').hidden=true;startAnalytics()};$('analytics-decline').onclick=()=>{try{localStorage.setItem('analytics-choice-v2','no')}catch{}$('cookie-choice').hidden=true};}
 document.querySelectorAll('[data-goal]').forEach(el=>el.addEventListener('click',()=>track(el.dataset.goal)));
 function product(){return config.products.find(p=>p.slug===model.value)}
 function updateSummary(){const p=product(),q=Number(quantity.value);$('order-summary').textContent=!Number.isInteger(q)||q<config.minOrder?`Минимальный заказ — ${config.minOrder} шт.`:q<config.bulkFrom?`Заказ от ${config.minOrder} шт. возможен. Цену и условия согласуем индивидуально по телефону.`:p&&p.price?`Оптовая цена: ${money(p.price)} / шт. × ${q} шт. = ${money(p.price*q)} за партию.`:p?'Уточним актуальную оптовую цену выбранной модели.':'Поможем подобрать модель под ваш бюджет.';}
 function updateVariants(){variant.replaceChildren(new Option('Уточнить с менеджером',''));product()?.variants.forEach(v=>variant.add(new Option(v.color.charAt(0).toUpperCase()+v.color.slice(1),v.sku)));if(product()?.variants.length===1)variant.value=product().variants[0].sku;updateSummary()}
 function resetForm(){if(submitted){$('form-fields').hidden=false;$('form-status').replaceChildren();submitted=false;requestId=crypto.randomUUID();lastPayload='';}}
 // Move the existing form into one native modal; keep its IDs and submission flow.
 let requestDialog=null,requestOpener=null;
 if(form&&typeof HTMLDialogElement!=='undefined'&&typeof HTMLDialogElement.prototype.showModal==='function'){
  requestDialog=document.createElement('dialog');requestDialog.id='request-dialog';requestDialog.className='request-dialog';requestDialog.setAttribute('aria-labelledby','request-title');
  const close=document.createElement('button');close.type='button';close.className='request-dialog-close';close.textContent='Закрыть';close.setAttribute('aria-label','Закрыть форму запроса');close.onclick=()=>requestDialog.close();
  requestDialog.append(close,$('request'));document.body.append(requestDialog);
  requestDialog.addEventListener('close',()=>{document.documentElement.classList.remove('request-dialog-open');if(requestOpener?.isConnected)requestOpener.focus({preventScroll:true});});
  requestDialog.addEventListener('click',event=>{const rect=requestDialog.getBoundingClientRect();if(event.target===requestDialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))requestDialog.close();});
 }
 function goToForm(slug,bulk=false){
  if(!form)return;resetForm();model.value=slug||'';quantity.value=bulk?config.bulkFrom:config.minOrder;updateVariants();track(bulk?'bulk_open':'lead_open',{model:slug||'selection'});
  if(requestDialog){requestOpener=document.activeElement;if(!requestDialog.open)requestDialog.showModal();requestDialog.scrollTop=0;document.documentElement.classList.add('request-dialog-open');$('phone').focus({preventScroll:true});}
  else{$('request').scrollIntoView({behavior:'auto'});$('phone').focus({preventScroll:true});}
 }
 document.querySelectorAll('[data-product]').forEach(button=>{button.setAttribute('aria-haspopup','dialog');button.onclick=()=>goToForm(button.dataset.product);});
 document.querySelectorAll('a[href="#request"]').forEach(link=>{if(form){link.setAttribute('aria-haspopup','dialog');link.onclick=event=>{event.preventDefault();goToForm(model.value);};}});
 if($('bulk-button'))$('bulk-button').onclick=()=>goToForm('',true);
 if(!form)return;
 updateVariants();model.onchange=updateVariants;quantity.oninput=updateSummary;
 const params=new URLSearchParams(location.search), requested=params.get('model');if(requested&&config.products.some(p=>p.slug===requested)){model.value=requested;updateVariants()}
 if(location.hash==='#request')goToForm(model.value);
 const attribution={};['utm_source','utm_medium','utm_campaign','utm_content','utm_term','yclid'].forEach(key=>{const value=params.get(key);if(value)attribution[key]=value.slice(0,250)});
 // Keep only campaign attribution within the current session; never store customer fields.
 let prior={};try{prior=JSON.parse(sessionStorage.getItem('campaign')||'{}');if(Object.keys(attribution).length)sessionStorage.setItem('campaign',JSON.stringify(attribution));}catch{}
 const campaign=Object.keys(attribution).length?attribution:prior;
 $('phone').oninput=()=>{$('phone').setCustomValidity('');};
 form.addEventListener('submit',async e=>{e.preventDefault();let phone=$('phone').value.replace(/\D/g,'');if(phone.length===10)phone='7'+phone;if(phone.length===11&&phone[0]==='8')phone='7'+phone;if(!/^7\d{10}$/.test(phone)){$('phone').setCustomValidity('Введите российский номер: +7 и ещё 10 цифр.');$('phone').reportValidity();return;}if(!form.reportValidity())return;
 const button=form.querySelector('[type=submit]'),status=$('form-status');button.disabled=true;button.textContent='Отправляем…';status.replaceChildren();
 const payload={model:model.value,variant:variant.value,quantity:Number(quantity.value),phone:'+'+phone,name:$('name').value.trim(),consent:form.elements.consent.checked,website:form.elements.website.value,attribution:campaign,path:location.pathname};
 const fingerprint=JSON.stringify(payload);if(lastPayload&&fingerprint!==lastPayload)requestId=crypto.randomUUID();lastPayload=fingerprint;payload.requestId=requestId;
 try{const response=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Не удалось отправить заявку.');if(!result.ok||!result.id)throw new Error('Сервер не подтвердил получение заявки.');submitted=true;$('form-fields').hidden=true;const box=document.createElement('div');box.className='success';const h=document.createElement('h3');h.textContent='Заявка получена.';const p=document.createElement('p');p.textContent=`Номер ${result.id}. Мы свяжемся с вами по номеру +${phone}, чтобы подтвердить наличие и условия покупки.`;const note=document.createElement('p');note.textContent='Перед поездкой дождитесь подтверждения от магазина.';const again=document.createElement('button');again.type='button';again.className='btn secondary';again.textContent='Оставить ещё одну заявку';again.onclick=()=>{form.reset();resetForm();updateVariants()};box.append(h,p,note,again);status.append(box);track('lead_success',{model:payload.model||'selection',quantity:payload.quantity,order_id:result.id});status.scrollIntoView({behavior:'smooth',block:'center'});
 }catch(err){const p=document.createElement('p');p.className='error-message';p.textContent=err.name==='TimeoutError'||err.name==='TypeError'?'Не удалось получить подтверждение. Проверьте соединение и повторите отправку или позвоните нам.':err.message;status.append(p);}finally{button.disabled=false;button.textContent='Отправить заявку';}});
})();
