let user=null, scanner=null, deferredPrompt=null;
const $=id=>document.getElementById(id), money=n=>Number(n).toFixed(2)+" ₴";
async function api(url,opts={}){const headers={"Content-Type":"application/json",...(user?{"x-user-id":user.id}:{}),...(opts.headers||{})};const r=await fetch(url,{...opts,headers});const d=await r.json();if(!r.ok)throw Error(d.error||"Помилка");return d;}
function showUser(u){user=u;$("auth").hidden=true;$("app").hidden=false;$("username").textContent=u.name;$("account").textContent="Рахунок: "+u.account;refresh();}
async function refresh(){if(!user)return;const s=await api("/api/state");$("balance").textContent=money(s.user.balance);user={...user,...s.user};const [hist,jobs]=await Promise.all([api("/api/transactions"),api("/api/jobs/status")]);$("history").innerHTML=hist.map(t=>`<div class="historyrow"><span>${t.description}<small>${new Date(t.at).toLocaleString("uk-UA")}</small></span><b>${t.to===user.account?"+":"−"}${money(t.amount)}</b></div>`).join("")||"<p>Операцій поки немає</p>";$("jobmsg").textContent=jobs.length?jobs.map(j=>`Статус заявки: ${j.status==="approved"?"прийнято":j.status==="rejected"?"відхилено":"очікує"}; зарплата: ${money(j.salary)}`).join(" · "):"";}
$("login").onclick=async()=>{try{showUser(await api("/api/login",{method:"POST",body:JSON.stringify({name:$("name").value,password:$("password").value})}));}catch(e){$("authmsg").textContent=e.message;}};
$("register").onclick=async()=>{try{showUser(await api("/api/register",{method:"POST",body:JSON.stringify({name:$("name").value,password:$("password").value})}));alert("Рахунок створено. Стартовий баланс: 1000 ₴");}catch(e){$("authmsg").textContent=e.message;}};
$("topup").onclick=async()=>{try{await api("/api/topup",{method:"POST",body:JSON.stringify({amount:Number($("topupAmount").value)})});$("topupAmount").value="";await refresh();}catch(e){alert(e.message);}};
$("transfer").onclick=async()=>{try{await api("/api/transfer",{method:"POST",body:JSON.stringify({account:$("toAccount").value,amount:Number($("transferAmount").value)})});$("toAccount").value="";$("transferAmount").value="";alert("Переказ виконано");await refresh();}catch(e){alert(e.message);}};
$("apply").onclick=async()=>{try{await api("/api/jobs/apply",{method:"POST",body:"{}"});$("jobmsg").textContent="Заявку подано!";await refresh();}catch(e){$("jobmsg").textContent=e.message;}};
async function processQrPayment(text){
  try {
    const data = JSON.parse(text);
    if (data.type !== "shop-payment") throw Error("Це не QR магазину");
    const p = await api("/api/payment/" + data.paymentId);
    if (!confirm(`Оплатити ${money(p.total)}?`)) return;
    await api("/api/payment/" + data.paymentId + "/pay", {method:"POST", body:"{}"});
    $("paymsg").textContent = "Оплата успішна!";
    await refresh();
  } catch(e) {
    $("paymsg").textContent = e.message;
  }
}
window.onNativeQrResult = function(text){ processQrPayment(text); };
$("scan").onclick=async()=>{
  try {
    if (window.Android && typeof window.Android.scanQr === "function") {
      $("paymsg").textContent = "Відкриваю камеру…";
      window.Android.scanQr();
      return;
    }
    if (!window.Html5Qrcode) throw Error("Сканер не завантажився. Перевір інтернет.");
    scanner = new Html5Qrcode("reader");
    await scanner.start({facingMode:"environment"},{fps:10,qrbox:{width:230,height:230}},async text=>{
      await scanner.stop(); scanner=null; await processQrPayment(text);
    });
  } catch(e) {
    $("paymsg").textContent = e.message + " Для камери в браузері потрібен HTTPS або localhost.";
  }
};
$("logout").onclick=()=>{user=null;$("auth").hidden=false;$("app").hidden=true;};
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;$("install").hidden=false;});
$("install").onclick=async()=>{if(deferredPrompt){deferredPrompt.prompt();deferredPrompt=null;}};
if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
