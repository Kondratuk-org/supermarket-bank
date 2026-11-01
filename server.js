const express = require("express");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const app = express();
app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname, "public")));

const DB = path.join(__dirname, "data.json");
const STORE_ACCOUNT = "9000000001";
const initial = {
  users: [],
  products: [
    {id:"p1", name:"Вода", price:18, stock:50},
    {id:"p2", name:"Шоколад", price:42, stock:30},
    {id:"p3", name:"Чипси", price:35, stock:25},
    {id:"p4", name:"Кола", price:42, stock:30},
    {id:"p5", name:"Печиво", price:29, stock:20}
  ],
  store: {account:STORE_ACCOUNT, balance:0},
  payments: [],
  transactions: [],
  applications: [],
  nextId: 1
};
let db;
try { db = JSON.parse(fs.readFileSync(DB, "utf8")); }
catch { db = initial; save(); }
function save(){ fs.writeFileSync(DB, JSON.stringify(db,null,2)); }
function id(prefix="x"){ return prefix + (db.nextId++); }
function userById(uid){ return db.users.find(u=>u.id===uid); }
function auth(req,res,next){
  const u = userById(req.header("x-user-id"));
  if(!u) return res.status(401).json({error:"Увійдіть у свій акаунт"});
  req.user=u; next();
}
function tx(from,to,amount,description){
  db.transactions.unshift({id:id("t"),from,to,amount,description,at:new Date().toISOString()});
}
app.get("/api/health",(req,res)=>res.json({ok:true}));
app.get("/api/state",(req,res)=>{
  const user = userById(req.header("x-user-id"));
  res.json({products:db.products, store:db.store, user:user?{id:user.id,name:user.name,account:user.account,balance:user.balance}:null});
});
app.post("/api/register",(req,res)=>{
  const name=String(req.body.name||"").trim(), password=String(req.body.password||"");
  if(name.length<2 || password.length<4) return res.status(400).json({error:"Вкажи ім'я та пароль від 4 символів"});
  if(db.users.some(u=>u.name.toLowerCase()===name.toLowerCase())) return res.status(409).json({error:"Такий користувач уже є"});
  let account;
  do { account=String(Math.floor(1000000000+Math.random()*9000000000)); } while(db.users.some(u=>u.account===account)||account===STORE_ACCOUNT);
  const user={id:id("u"),name,password,account,balance:1000};
  db.users.push(user); tx("Банк",account,1000,"Стартовий бонус"); save();
  res.json({id:user.id,name:user.name,account,balance:user.balance});
});
app.post("/api/login",(req,res)=>{
  const u=db.users.find(x=>x.name.toLowerCase()===String(req.body.name||"").toLowerCase() && x.password===String(req.body.password||""));
  if(!u) return res.status(401).json({error:"Неправильне ім'я або пароль"});
  res.json({id:u.id,name:u.name,account:u.account,balance:u.balance});
});
app.post("/api/topup",auth,(req,res)=>{
  const amount=Number(req.body.amount);
  if(!Number.isFinite(amount)||amount<=0||amount>100000) return res.status(400).json({error:"Некоректна сума"});
  req.user.balance+=amount; tx("Банк",req.user.account,amount,"Поповнення (демо)"); save();
  res.json({balance:req.user.balance});
});
app.post("/api/transfer",auth,(req,res)=>{
  const account=String(req.body.account||"").trim(), amount=Number(req.body.amount);
  const target=db.users.find(u=>u.account===account);
  if(!target) return res.status(404).json({error:"Рахунок не знайдено"});
  if(target.id===req.user.id) return res.status(400).json({error:"Не можна переказати самому собі"});
  if(!Number.isFinite(amount)||amount<=0||amount>req.user.balance) return res.status(400).json({error:"Перевір суму та баланс"});
  req.user.balance-=amount; target.balance+=amount;
  tx(req.user.account,target.account,amount,"Переказ між користувачами"); save();
  res.json({balance:req.user.balance,target:target.name});
});
app.post("/api/payment/create",async(req,res)=>{
  const items=Array.isArray(req.body.items)?req.body.items:[];
  if(!items.length) return res.status(400).json({error:"Кошик порожній"});
  let total=0, lines=[];
  for(const line of items){
    const p=db.products.find(x=>x.id===line.id), qty=Math.floor(Number(line.qty));
    if(!p||!Number.isInteger(qty)||qty<1||qty>100) return res.status(400).json({error:"Некоректний товар"});
    if(p.stock<qty) return res.status(400).json({error:`Недостатньо товару: ${p.name}`});
    total+=p.price*qty; lines.push({id:p.id,name:p.name,price:p.price,qty});
  }
  const payment={id:id("pay"),total,items:lines,status:"pending",created:new Date().toISOString()};
  db.payments.push(payment); save();
  const payload=JSON.stringify({type:"shop-payment",paymentId:payment.id});
  res.json({id:payment.id,total,qr:await QRCode.toDataURL(payload)});
});
app.get("/api/payment/:id",(req,res)=>{
  const p=db.payments.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:"Платіж не знайдено"});
  res.json({id:p.id,total:p.total,status:p.status});
});
app.post("/api/payment/:id/pay",auth,(req,res)=>{
  const p=db.payments.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:"Платіж не знайдено"});
  if(p.status==="paid") return res.status(409).json({error:"Платіж уже оплачено"});
  if(req.user.balance<p.total) return res.status(400).json({error:"Недостатньо коштів"});
  for(const line of p.items){ const product=db.products.find(x=>x.id===line.id); if(!product||product.stock<line.qty) return res.status(400).json({error:"Товар закінчився"}); }
  req.user.balance-=p.total; db.store.balance+=p.total;
  p.items.forEach(line=>db.products.find(x=>x.id===line.id).stock-=line.qty);
  p.status="paid"; p.paidBy=req.user.account; p.paidAt=new Date().toISOString();
  tx(req.user.account,STORE_ACCOUNT,p.total,"Покупка в магазині"); save();
  res.json({ok:true,balance:req.user.balance});
});
app.get("/api/transactions",auth,(req,res)=>{
  res.json(db.transactions.filter(t=>t.from===req.user.account||t.to===req.user.account).slice(0,100));
});
app.post("/api/jobs/apply",auth,(req,res)=>{
  if(db.applications.some(a=>a.userId===req.user.id&&a.status==="pending")) return res.status(409).json({error:"Заявка вже подана"});
  db.applications.push({id:id("job"),userId:req.user.id,name:req.user.name,status:"pending",salary:500});
  save(); res.json({ok:true});
});
app.get("/api/jobs/status",auth,(req,res)=>{
  res.json(db.applications.filter(a=>a.userId===req.user.id));
});
// Локальна демо-панель власника. Не відкривати в публічний інтернет без захисту.
app.get("/api/admin",(req,res)=>res.json({store:db.store,products:db.products,applications:db.applications.map(a=>({...a,userName:userById(a.userId)?.name||"—"}))}));
app.post("/api/admin/product",(req,res)=>{
  const name=String(req.body.name||"").trim(), price=Number(req.body.price), stock=Math.floor(Number(req.body.stock));
  if(!name||!Number.isFinite(price)||price<0||!Number.isInteger(stock)||stock<0) return res.status(400).json({error:"Перевір назву, ціну та кількість"});
  if(req.body.id){ const p=db.products.find(x=>x.id===req.body.id); if(!p)return res.status(404).json({error:"Товар не знайдено"}); Object.assign(p,{name,price,stock}); }
  else db.products.push({id:id("p"),name,price,stock});
  save(); res.json({ok:true});
});
app.delete("/api/admin/product/:id",(req,res)=>{
  db.products=db.products.filter(p=>p.id!==req.params.id); save(); res.json({ok:true});
});
app.post("/api/admin/job/:id",(req,res)=>{
  const a=db.applications.find(x=>x.id===req.params.id); if(!a)return res.status(404).json({error:"Заявку не знайдено"});
  a.status=req.body.status==="approved"?"approved":"rejected";
  a.salary=Math.max(0,Number(req.body.salary)||500); save(); res.json({ok:true});
});
app.post("/api/admin/salary/:id",(req,res)=>{
  const a=db.applications.find(x=>x.id===req.params.id), u=a&&userById(a.userId);
  if(!a||!u||a.status!=="approved")return res.status(400).json({error:"Працівника не підтверджено"});
  const amount=Math.max(0,Number(req.body.amount)||a.salary);
  db.store.balance-=amount; u.balance+=amount; tx(STORE_ACCOUNT,u.account,amount,"Зарплата"); save();
  res.json({ok:true,storeBalance:db.store.balance});
});
app.get("/events",(req,res)=>{
  res.setHeader("Content-Type","text/event-stream"); res.setHeader("Cache-Control","no-cache"); res.setHeader("Connection","keep-alive");
  const timer=setInterval(()=>res.write(`data: ${JSON.stringify({time:Date.now()})}\n\n`),5000);
  req.on("close",()=>clearInterval(timer));
});
const port=3000;
app.listen(port,"0.0.0.0",()=>console.log(`Сервер запущено: http://localhost:${port}`));
