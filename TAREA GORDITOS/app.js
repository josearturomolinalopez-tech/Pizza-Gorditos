// /app.js (ACTUALIZADO: máscaras y validación de vencimiento)
const SHIPPING = 2.0;

const IMGS = {
  pep: '2.png',
  '4q': '3.png',
  mar: '4.png',
};

const MENU = [
  { id:'pep', name:'Pepperoni', desc:'Pepperoni y queso extra', img: IMGS.pep, prices:{ personal:4, mediana:7, familiar:9 } },
  { id:'mar', name:'Margarita', desc:'Tomate, mozzarella, albahaca', img: IMGS.mar, prices:{ personal:5, mediana:8, familiar:10 } },
  { id:'4q',  name:'4 Quesos', desc:'Mozzarella, gorgonzola, parmesano, ricotta', img: IMGS['4q'], prices:{ personal:6, mediana:9, familiar:11 } },
];

const state = { cart: load('pg_cart', []), lastOrder: load('pg_order', null), selections:{} };
const $ = s=>document.querySelector(s), $$ = s=>Array.from(document.querySelectorAll(s));
const money = n=>`$${n.toFixed(2)}`;

/* Storage helpers */
function load(k,f){try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;}}
function save(k,v){localStorage.setItem(k,JSON.stringify(v));}
function del(k){localStorage.removeItem(k);}
function labelSize(s){return s==='personal'?'Personal':s==='mediana'?'Mediana':'Familiar';}
function imgFor(id){ const item = MENU.find(x=>x.id===id); return item? item.img : IMGS.pep; }

/* ===== NAV móvil con backdrop y cierre seguro ===== */
function setupMobileMenu(){
  const btn = $('#menu-toggle'), panel = $('#mobile-menu'), backdrop = $('#menu-backdrop');
  if(!btn || !panel || !backdrop) return;
  const openMenu = ()=>{ panel.removeAttribute('hidden'); backdrop.removeAttribute('hidden'); btn.setAttribute('aria-expanded','true'); document.body.classList.add('no-scroll'); };
  const closeMenu = ()=>{ panel.setAttribute('hidden',''); backdrop.setAttribute('hidden',''); btn.setAttribute('aria-expanded','false'); document.body.classList.remove('no-scroll'); };
  btn.addEventListener('click', ()=> (panel.hasAttribute('hidden') ? openMenu() : closeMenu()));
  backdrop.addEventListener('click', closeMenu);
  panel.querySelectorAll('a').forEach(a=>a.addEventListener('click', closeMenu));
  window.addEventListener('scroll', ()=>{ if(!panel.hasAttribute('hidden')) closeMenu(); });
  window.addEventListener('keydown', e=>{ if(e.key==='Escape') closeMenu(); });
}

/* ===== Input masks & validations ===== */
// Teléfono: ####-#### (8 dígitos)
function maskPhone(el){
  const digits = el.value.replace(/\D/g,'').slice(0,8);
  const out = digits.length > 4 ? digits.slice(0,4)+'-'+digits.slice(4) : digits;
  el.value = out;
}
// Tarjeta: #### #### #### #### (16 dígitos)
function maskCardNumber(el){
  const digits = el.value.replace(/\D/g,'').slice(0,16);
  el.value = digits.replace(/(\d{4})(?=\d)/g,'$1 ').trim();
}
// Vencimiento: MM/AA con validación de fecha no pasada
function maskExp(el){
  let digits = el.value.replace(/\D/g,'').slice(0,4);
  if(digits.length>=3){
    const mm = Math.min(Math.max(parseInt(digits.slice(0,2)||'0',10),1),12).toString().padStart(2,'0');
    const yy = digits.slice(2);
    el.value = `${mm}/${yy}`;
  }else{
    el.value = digits;
  }
  validateExpiryNotPast(el);
}
function validateExpiryNotPast(el){
  el.setCustomValidity('');
  const m = /^(\d{2})\/(\d{2})$/.exec(el.value);
  if(!m){ return; }
  const mm = parseInt(m[1],10);
  const yy = 2000 + parseInt(m[2],10);
  const now = new Date();
  const endOfMonth = new Date(yy, mm, 0); // último día del mes mm/yy
  // why: evitar aceptar tarjetas expiradas
  if(yy < now.getFullYear() || (yy === now.getFullYear() && mm < (now.getMonth()+1))){
    el.setCustomValidity('La tarjeta está vencida.');
  }else{
    el.setCustomValidity('');
  }
}

/* ===== Menú ===== */
function renderMenu(){
  const grid = $('#menu-grid'); grid.innerHTML = '';
  MENU.forEach(item=>{
    const size = state.selections[item.id] || 'mediana';
    const price = item.prices[size];
    const card = document.createElement('article'); card.className='card';
    card.innerHTML = `
      <img src="${item.img}" alt="Pizza ${item.name}">
      <h3>${item.name}</h3>
      <p>${item.desc}</p>
      <div class="size-row" role="group" aria-label="Tamaño">
        ${['personal','mediana','familiar'].map(s=>`<button class="${s===size?'active':''}" data-size="${s}">${labelSize(s)}</button>`).join('')}
      </div>
      <div class="card-foot">
        <div class="price" aria-live="polite">${money(price)}</div>
        <button class="add-btn" data-id="${item.id}">Añadir</button>
      </div>`;
    card.querySelectorAll('.size-row button').forEach(btn=>{
      btn.addEventListener('click', ()=>{ state.selections[item.id]=btn.dataset.size; renderMenu(); });
    });
    card.querySelector('.add-btn').addEventListener('click', ()=>{
      const s = state.selections[item.id] || 'mediana'; addToCart(item.id, s, 1);
    });
    grid.appendChild(card);
  });
}

/* ===== Carrito con PROMO ===== */
function addToCart(id,size,qty){
  const line=state.cart.find(l=>l.id===id&&l.size===size);
  if(line) line.qty+=qty; else state.cart.push({id,size,qty});
  save('pg_cart',state.cart); renderCart();
}
function updateQty(id,size,delta){
  const line=state.cart.find(l=>l.id===id&&l.size===size);
  if(!line) return;
  line.qty+=delta;
  if(line.qty<=0) state.cart=state.cart.filter(l=>!(l.id===id&&l.size===size));
  save('pg_cart',state.cart); renderCart();
}
function clearCart(){ state.cart=[]; save('pg_cart',state.cart); renderCart(); }

function compute(){
  let subtotal=0, familyCount=0;
  const items=state.cart.map(l=>{
    const p=MENU.find(x=>x.id===l.id);
    const unit=p.prices[l.size]; const line=unit*l.qty; subtotal+=line;
    if(l.size==='familiar') familyCount += l.qty;
    return {...l,name:p.name,unit,line,img:p.img};
  });

  // Por cada 2 familiares => 1 pepperoni personal gratis
  const freebies = Math.floor(familyCount/2);
  if(freebies>0){
    items.push({id:'pep',name:'Pepperoni (Promo)',size:'personal',qty:freebies,unit:0,line:0,promo:true,img:IMGS.pep});
  }

  const shipping=items.filter(i=>!i.promo).length?SHIPPING:0;
  const discount=$('#payment')?.value==='online' ? (subtotal*0.10) : 0;
  const total=subtotal-discount+shipping;
  return {items, subtotal, discount, shipping, total};
}

function renderCart(){
  const list=$('#cart-list'), empty=$('#cart-empty'); list.innerHTML='';
  const {items, subtotal, discount, shipping, total}=compute();
  if(!items.length){ empty.classList.remove('hide'); list.classList.add('hide'); }
  else{
    empty.classList.add('hide'); list.classList.remove('hide');
    items.forEach(l=>{
      const row=document.createElement('div'); row.className='line';
      row.innerHTML=`<img src="${imgFor(l.id)}" alt="">
        <div><div style="font-weight:700">${l.name} <span class="order-id">${labelSize(l.size)}</span> ${l.promo?'<span class="order-id" style="background:#2e4920;border-color:#2e4920">Gratis</span>':''}</div>
        <div class="muted">${money(l.unit)} c/u</div></div>
        <div class="qty"></div>`;
      const q=row.querySelector('.qty');
      if(l.promo){ q.textContent=`× ${l.qty}`; }
      else{
        q.innerHTML=`<button aria-label="Menos">–</button><div aria-live="polite" style="min-width:24px;text-align:center">${l.qty}</div><button aria-label="Más">+</button><button class="text-btn" title="Eliminar">✕</button>`;
        const [dec,inc,delBtn]=q.querySelectorAll('button');
        inc.addEventListener('click',()=>updateQty(l.id,l.size,+1));
        dec.addEventListener('click',()=>updateQty(l.id,l.size,-1));
        delBtn.addEventListener('click',()=>updateQty(l.id,l.size,-l.qty));
      }
      list.appendChild(row);
    });
  }
  $('#subtotal').textContent=money(subtotal);
  $('#discount').textContent=`-${money(discount)}`;
  $('#shipping').textContent=money(shipping);
  $('#total').textContent=money(total);
}

/* ===== Checkout + Pago en línea ===== */
function validateForm(){
  for(const id of ['name','phone','address']){
    const el = document.getElementById(id);
    if(!el.checkValidity()) return false;
  }
  return state.cart.length>0;
}
function submitOrder(e){
  e.preventDefault();
  const status=$('#form-status');
  if(!validateForm()){
    status.textContent='Completa los campos y agrega productos.'; status.style.color='#ffb4b4'; return;
  }
  if($('#payment').value==='online'){ openPaySheet(); }
  else{ placeOrder(); }
}
function placeOrder(){
  const totals=compute();
  const order={
    id:`PG-${Date.now().toString().slice(-6)}`,
    at:new Date().toISOString(),
    customer:{name:$('#name').value.trim(), phone:$('#phone').value.trim(), address:$('#address').value.trim()},
    payment:$('#payment').value,
    ...totals, step:0
  };
  if(order.payment==='online'){
    const dlg=document.getElementById('pay-modal'), text=document.getElementById('pay-text');
    dlg.showModal(); text.textContent='Procesando pago…';
    setTimeout(()=>{ text.textContent='Pago aprobado ✔'; setTimeout(()=>{ dlg.close(); finishOrder(order,$('#form-status')); },700); },1200);
  }else{
    finishOrder(order,$('#form-status'));
  }
}
function finishOrder(order,statusEl){
  state.lastOrder=order; save('pg_order',state.lastOrder);
  clearCart();
  statusEl.textContent='Pedido confirmado. Revisa el estado abajo.'; statusEl.style.color='#9CC645';
  location.hash='#estado'; renderStatus();
}

/* ===== Pantalla de pago ===== */
function openPaySheet(){
  const sheet = document.getElementById('pay-sheet');
  const closeBtn = document.getElementById('pay-close');
  const cancelBtn = document.getElementById('pay-cancel');
  const form = document.getElementById('pay-form');
  const num = document.getElementById('cardNumber');
  const exp = document.getElementById('exp');

  sheet.showModal();
  const close = ()=>sheet.close();
  closeBtn.onclick = cancelBtn.onclick = close;

  // Validación adicional de vencimiento
  exp.addEventListener('input', ()=>maskExp(exp));
  exp.addEventListener('blur', ()=>validateExpiryNotPast(exp));

  form.onsubmit = (ev)=>{
    ev.preventDefault();
    // corrección última máscara
    maskCardNumber(num); maskExp(exp);
    const okFields = ['cardName','cardNumber','exp','cvv'].every(id => document.getElementById(id).checkValidity());
    if(!okFields || exp.validationMessage){
      form.reportValidity(); return;
    }
    close();
    placeOrder();
  };
}

/* ===== Estado + Mapa (DEST fijo) ===== */
let map,courier,destMarker;
const STORE=[13.6929,-89.2182]; // Sucursal
const DEST={lat:13.7042, lng:-89.1081, label:'Bosques de la Paz, Ilopango · Calle 19 Poniente'};
const COURIER_KEY='pg_courier_pos';

function ensureMap(){
  if(map) return;
  map=L.map('map',{zoomControl:true}).setView(STORE,13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  L.marker(STORE).addTo(map).bindPopup('Pizza Gorditos (Sucursal)');
  destMarker = L.marker([DEST.lat, DEST.lng]).addTo(map).bindPopup(DEST.label);
}
function getCourierPos(){ return load(COURIER_KEY, null); }
function setCourierPos(latlng){ save(COURIER_KEY, latlng); }
function clearCourierPos(){ del(COURIER_KEY); }

function renderStatus(){
  const no=$('#no-order'), info=$('#order-info');
  if(!state.lastOrder){ no.classList.remove('hide'); info.classList.add('hide'); return; }
  no.classList.add('hide'); info.classList.remove('hide');

  const o=state.lastOrder;
  $('#order-id').textContent=o.id;
  const addr=o.customer?.address ? ` · Envío a: ${o.customer.address}` : '';
  $('#order-summary').textContent=o.items.map(i=>`${i.qty}× ${i.name} ${labelSize(i.size)}`).join(', ') + ` — Total ${money(o.total)}${addr}`;

  $$('.timeline .step').forEach(el=>{ const s=Number(el.dataset.step); el.classList.toggle('active', s<=o.step); });

  ensureMap();
  const saved = getCourierPos();

  if(!courier){
    const startLatLng = (o.step<3 && saved) ? saved : STORE;
    courier=L.marker(startLatLng).addTo(map).bindPopup('Repartidor');
  }else if(o.step<3 && saved){
    courier.setLatLng(saved);
  }

  map.fitBounds([STORE, [DEST.lat, DEST.lng]], { padding:[30,30] });

  const eta=new Date(Date.now()+(40-o.step*10)*60000);
  $('#eta-text').textContent=o.step<3?`Estimado de entrega: ${eta.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:'¡Entregado!';

  if(o.step>=2 && o.step<3 && !saved){
    animateCourier(STORE, [DEST.lat, DEST.lng], 4000);
  }
}
function animateCourier(from,to,ms){
  const start=performance.now();
  (function loop(now){
    const t=Math.min(1,(now-start)/ms);
    const lat=from[0]+(to[0]-from[0])*t, lng=from[1]+(to[1]-from[1])*t;
    const pos=[lat,lng];
    courier.setLatLng(pos);
    setCourierPos(pos);
    if(t<1) requestAnimationFrame(loop);
  })(start);
}
function advanceStep(){
  if(!state.lastOrder) return;
  if(state.lastOrder.step<3){
    state.lastOrder.step += 1;
    if(state.lastOrder.step===3){ clearCourierPos(); }
    save('pg_order', state.lastOrder);
    renderStatus();
  }
}

/* ===== Arranque ===== */
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('year').textContent=new Date().getFullYear();
  setupMobileMenu();

  if(state.lastOrder && state.lastOrder.step===3){ del('pg_order'); clearCourierPos(); state.lastOrder=null; }

  // LOGO opcional:
  // document.getElementById('brand-logo').src = 'sandbox:/mnt/data/21f96df5-0cdc-48c4-bdb1-9f61b7d102c8.png';

  // Máscaras en checkout
  const phone = document.getElementById('phone');
  phone.addEventListener('input', ()=>maskPhone(phone));
  phone.addEventListener('paste', e=>{ e.preventDefault(); phone.value = (e.clipboardData.getData('text')||''); maskPhone(phone); });

  // Máscaras en pago (cuando se abra también se añaden)
  const card = document.getElementById('cardNumber');
  const exp  = document.getElementById('exp');
  const cvv  = document.getElementById('cvv');
  if(card){
    card.addEventListener('input', ()=>maskCardNumber(card));
    card.addEventListener('paste', e=>{ e.preventDefault(); card.value=(e.clipboardData.getData('text')||''); maskCardNumber(card); });
  }
  if(exp){
    exp.addEventListener('input', ()=>maskExp(exp));
    exp.addEventListener('paste', e=>{ e.preventDefault(); exp.value=(e.clipboardData.getData('text')||''); maskExp(exp); });
  }
  if(cvv){
    cvv.addEventListener('input', ()=>{ cvv.value = cvv.value.replace(/\D/g,'').slice(0,4); });
  }

  renderMenu(); renderCart(); renderStatus();
  $('#payment').addEventListener('change', renderCart);
  $('#open-cart').addEventListener('click', ()=>{ location.hash='#checkout'; });
  $('#clear-cart').addEventListener('click', clearCart);
  $('#order-form').addEventListener('submit', submitOrder);
  $('#advance').addEventListener('click', advanceStep);
});
