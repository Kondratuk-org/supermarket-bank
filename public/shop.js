let products=[], cart={};
const $=id=>document.getElementById(id), money=n=>Number(n).toFixed(2)+" ₴";
async function api(url,opts={}){const r=await fetch(url,{headers:{"Content-Type":"application/json",...(opts.headers||{})},...opts});const d=await r.json();if(!r.ok)throw Error(d.error||"Помилка");return d;}
function render(){
  $("products").innerHTML=products.map(p=>`<button class="product" data-id="${p.id}"><b>${p.name}</b><span>${money(p.price)}</span><small>Залишок: ${p.stock}</small></button>`).join("");
  document.querySelectorAll(".product").forEach(b=>b.onclick=()=>{const p=products.find(x=>x.id===b.dataset.id);if(p.stock>(cart[p.id]||0))cart[p.id]=(cart[p.id]||0)+1;renderCart();});
}
function renderCart(){
  const rows=Object.entries(cart).map(([id,q])=>{const p=products.find(x=>x.id===id);return p?`<div class="cartrow"><span>${p.name} × ${q}</span><b>${money(p.price*q)}</b><button class="tiny" data-remove="${id}">−</button></div>`:"";}).join("");
  $("cart").innerHTML=rows||"<p>Кошик порожній</p>";
  document.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{const id=b.dataset.remove;cart[id]--;if(cart[id]<=0)delete cart[id];renderCart();});
  $("total").textContent=money(Object.entries(cart).reduce((s,[id,q])=>s+products.find(p=>p.id===id).price*q,0));
}
async function refresh(){const d=await api("/api/state");products=d.products;$("store").textContent=money(d.store.balance);render();}
$("pay").onclick=async()=>{try{const items=Object.entries(cart).map(([id,qty])=>({id,qty}));if(!items.length)throw Error("Спочатку додай товари");const d=await api("/api/payment/create",{method:"POST",body:JSON.stringify({items})});$("payment").innerHTML=`<h3>Скануй QR у застосунку «Мій Банк»</h3><img alt="QR для оплати" src="${d.qr}"><p>Сума: <b>${money(d.total)}</b></p><small>QR зникне після успішної оплати</small>`;watch(d.id);}catch(e){$("msg").textContent=e.message;}};
async function watch(id){const timer=setInterval(async()=>{try{const p=await api("/api/payment/"+id);if(p.status==="paid"){clearInterval(timer);$("payment").innerHTML="<h3>Оплачено! Дякуємо за покупку.</h3>";cart={};renderCart();await refresh();}}catch{clearInterval(timer);}},2000);}
refresh();renderCart();setInterval(refresh,7000);
