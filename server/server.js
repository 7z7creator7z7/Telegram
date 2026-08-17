
const express=require("express"),http=require("http"),path=require("path"),bcrypt=require("bcryptjs"),jwt=require("jsonwebtoken");
const {Server}=require("socket.io");const {Pool}=require("pg");
const app=express(),server=http.createServer(app),io=new Server(server,{cors:{origin:"*"}});
const PORT=Number(process.env.PORT||10000),SECRET=process.env.JWT_SECRET||"change-me",ROOT=path.join(__dirname,"..");
const BOT_TOKEN=process.env.TELEGRAM_BOT_TOKEN||"",ADMIN_CHAT_ID=process.env.TELEGRAM_ADMIN_CHAT_ID||"",DEFAULT_CHANNEL=process.env.DEFAULT_CHANNEL||"@Barcha_Kontent";
const pool=process.env.DATABASE_URL?new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:10}):null;
app.use(express.json({limit:"2mb"}));
const db=(q,p=[])=>{if(!pool)throw Error("DATABASE_URL missing");return pool.query(q,p)};
const tg=async(method,body)=>{if(!BOT_TOKEN) throw Error("TELEGRAM_BOT_TOKEN missing");let r=await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});let d=await r.json();if(!d.ok)throw Error(d.description||"Telegram API error");return d.result};
async function notify(text,chatId=ADMIN_CHAT_ID){if(!BOT_TOKEN||!chatId)return;try{await tg("sendMessage",{chat_id:chatId,text,parse_mode:"HTML"})}catch(e){console.error("notify",e.message)}}
async function init(){
 if(!pool)return;
 await db(`CREATE TABLE IF NOT EXISTS users(
 id BIGSERIAL PRIMARY KEY,username VARCHAR(32) UNIQUE NOT NULL,name VARCHAR(100) NOT NULL,password_hash TEXT NOT NULL,
 avatar TEXT,bio TEXT DEFAULT '',telegram_id BIGINT,telegram_username VARCHAR(64),stars BIGINT DEFAULT 0,stars BIGINT DEFAULT 0,online BOOLEAN DEFAULT FALSE,
 last_seen TIMESTAMPTZ DEFAULT NOW(),created_at TIMESTAMPTZ DEFAULT NOW(),referral_code VARCHAR(40) UNIQUE,referrer_id BIGINT REFERENCES users(id),
 referral_paid BOOLEAN DEFAULT FALSE,created_at2 TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS chats(id BIGSERIAL PRIMARY KEY,type VARCHAR(16) NOT NULL DEFAULT 'private',title VARCHAR(150) NOT NULL,owner_id BIGINT REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS chat_members(chat_id BIGINT REFERENCES chats(id) ON DELETE CASCADE,user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,role VARCHAR(20) DEFAULT 'member',joined_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(chat_id,user_id));
 CREATE TABLE IF NOT EXISTS messages(id BIGSERIAL PRIMARY KEY,chat_id BIGINT REFERENCES chats(id) ON DELETE CASCADE,user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,text TEXT NOT NULL,reply_to BIGINT REFERENCES messages(id),edited BOOLEAN DEFAULT FALSE,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
 CREATE INDEX IF NOT EXISTS messages_chat_id_id ON messages(chat_id,id);
 CREATE TABLE IF NOT EXISTS missions(id BIGSERIAL PRIMARY KEY,owner_id BIGINT REFERENCES users(id),link TEXT NOT NULL,channel VARCHAR(255) DEFAULT '',channel_title VARCHAR(255) DEFAULT '',reward_stars BIGINT NOT NULL DEFAULT 0,reward_stars BIGINT NOT NULL DEFAULT 15,budget_stars BIGINT NOT NULL,max_people INT NOT NULL,completed_people INT DEFAULT 0,status VARCHAR(20) DEFAULT 'active',created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS mission_completions(id BIGSERIAL PRIMARY KEY,mission_id BIGINT REFERENCES missions(id) ON DELETE CASCADE,user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,reward BIGINT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(mission_id,user_id));
 CREATE TABLE IF NOT EXISTS stars_ledger(id BIGSERIAL PRIMARY KEY,user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,amount BIGINT NOT NULL,kind VARCHAR(40) NOT NULL,description TEXT,reference_id TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS gifts(id BIGSERIAL PRIMARY KEY,from_user_id BIGINT REFERENCES users(id),to_user_id BIGINT REFERENCES users(id),gift VARCHAR(80) NOT NULL,stars BIGINT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS premium(id BIGSERIAL PRIMARY KEY,user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE CASCADE,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS bot_subscribers(id BIGSERIAL PRIMARY KEY,telegram_id BIGINT UNIQUE NOT NULL,username VARCHAR(64),first_name VARCHAR(100),start_payload TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),last_seen TIMESTAMPTZ DEFAULT NOW());
 `);
 await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stars BIGINT DEFAULT 0`);
 await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id BIGINT`);
 await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username VARCHAR(64)`);
 await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stars BIGINT DEFAULT 0`);
 await db(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS link TEXT`);
 await db(`ALTER TABLE missions ADD COLUMN IF NOT EXISTS reward_stars BIGINT DEFAULT 15`);
 await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(40)`);
 await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_id BIGINT REFERENCES users(id)`);
 await db(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_paid BOOLEAN DEFAULT FALSE`);
 await db(`UPDATE users SET referral_code='U'||id WHERE referral_code IS NULL`);
 let s=await db("SELECT id FROM missions LIMIT 1");
 if(!s.rows[0]){let u=await db("SELECT id FROM users ORDER BY id LIMIT 1");if(u.rows[0]) await db("INSERT INTO missions(owner_id,link,channel,channel_title,reward_stars,reward_stars,budget_stars,max_people) VALUES($1,'https://t.me/barcha_kontent','barcha_kontent','@Barcha_Kontent',0,30,50,25)",[u.rows[0].id])}
}
const makeToken=u=>jwt.sign({id:String(u.id),username:u.username},SECRET,{expiresIn:"30d"});
function auth(req,res,next){try{let h=req.headers.authorization||"";req.user=jwt.verify(h.replace(/^Bearer /,""),SECRET);next()}catch{res.status(401).json({error:"Unauthorized"})}}
async function addStars(userId,amount,kind,description,referenceId=null){
 await db("UPDATE users SET stars=stars+$1 WHERE id=$2",[amount,userId]);
 await db("INSERT INTO stars_ledger(user_id,amount,kind,description,reference_id) VALUES($1,$2,$3,$4,$5)",[userId,amount,kind,description,referenceId]);
}
async function addStars(userId,amount,kind,description,referenceId=null){
 await db("UPDATE users SET stars=stars+$1 WHERE id=$2",[amount,userId]);
 await db("INSERT INTO stars_ledger(user_id,amount,kind,description,reference_id) VALUES($1,$2,$3,$4,$5)",[userId,amount,kind,description,referenceId]);
}
async function spendStars(userId,amount,kind,description,referenceId=null){
 let r=await db("UPDATE users SET stars=stars-$1 WHERE id=$2 AND stars >= $1 RETURNING id,stars",[amount,userId]);if(!r.rows[0])throw Error("Not enough Stars");
 await db("INSERT INTO stars_ledger(user_id,amount,kind,description,reference_id) VALUES($1,$2,$3,$4,$5)",[userId,-amount,kind,description,referenceId]);return r.rows[0];
}
app.get("/api/health",async(req,res)=>{let database=false;try{if(pool){await db("SELECT 1");database=true}}catch{}res.json({ok:true,server:"online",database,socketio:true,telegramBot:Boolean(BOT_TOKEN)})});
app.post("/api/auth/register",async(req,res)=>{try{
 let u=String(req.body.username||"").trim().toLowerCase().replace(/^@/,""),n=String(req.body.name||"").trim(),p=String(req.body.password||""),ref=String(req.body.ref||"").trim();
 if(!/^[a-z0-9_]{3,32}$/.test(u)||n.length<2||p.length<6)return res.status(400).json({error:"Invalid registration data"});
 let rr=ref?await db("SELECT id FROM users WHERE referral_code=$1",[ref]):{rows:[]};
 let r=await db("INSERT INTO users(username,name,password_hash,referrer_id) VALUES($1,$2,$3,$4) RETURNING id,username,name,avatar,bio,telegram_id,telegram_username,stars,online,last_seen,referral_code",[u,n,await bcrypt.hash(p,12),rr.rows[0]?.id||null]);
 if(rr.rows[0]){await addStars(rr.rows[0].id,15,"referral","Referral bonus for "+u,r.rows[0].id);await db("UPDATE users SET referral_paid=TRUE WHERE id=$1",[r.rows[0].id])}
 await notify(`👤 <b>Yangi foydalanuvchi</b>\n@${u}\nReferral: ${rr.rows[0]?"ha":"yo'q"}`);
 res.json({ok:true,token:makeToken(r.rows[0]),user:r.rows[0]})
 }catch(e){res.status(e.code==="23505"?409:500).json({error:e.code==="23505"?"Username already exists":"Registration failed"})}});
app.post("/api/auth/login",async(req,res)=>{try{let u=String(req.body.username||"").trim().toLowerCase().replace(/^@/,""),r=await db("SELECT * FROM users WHERE username=$1",[u]);if(!r.rows[0]||!(await bcrypt.compare(String(req.body.password||""),r.rows[0].password_hash)))return res.status(401).json({error:"Invalid login"});let x=r.rows[0];await db("UPDATE users SET online=TRUE,last_seen=NOW() WHERE id=$1",[x.id]);delete x.password_hash;res.json({ok:true,token:makeToken(x),user:x})}catch(e){res.status(500).json({error:"Login failed"})}});
app.get("/api/me",auth,async(req,res)=>{let r=await db("SELECT id,username,name,avatar,bio,telegram_id,telegram_username,stars,stars,online,last_seen,referral_code FROM users WHERE id=$1",[req.user.id]);res.json({ok:true,user:r.rows[0]})});
app.patch("/api/me",auth,async(req,res)=>{let tid=req.body.telegram_id?Number(req.body.telegram_id):null,tu=String(req.body.telegram_username||"").replace(/^@/,"").trim();let r=await db("UPDATE users SET telegram_id=$1,telegram_username=$2 WHERE id=$3 RETURNING id,username,name,telegram_id,telegram_username,stars,stars,referral_code",[tid||null,tu||null,req.user.id]);res.json({ok:true,user:r.rows[0]})});
app.get("/api/balance",auth,async(req,res)=>{let r=await db("SELECT stars,stars FROM users WHERE id=$1",[req.user.id]);res.json({ok:true,stars:r.rows[0]?.stars||0,stars:r.rows[0]?.stars||0})});
app.get("/api/stars/history",auth,async(req,res)=>{let r=await db("SELECT amount,kind,description,created_at FROM stars_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 100",[req.user.id]);res.json({ok:true,history:r.rows})});
app.get("/api/users/search",auth,async(req,res)=>{let q=String(req.query.q||"").trim();if(!q)return res.json({ok:true,users:[]});let r=await db("SELECT id,username,name,avatar,bio,online,last_seen FROM users WHERE username ILIKE $1 OR name ILIKE $1 ORDER BY online DESC,name LIMIT 30",[`%${q}%`]);res.json({ok:true,users:r.rows})});
app.get("/api/chats",auth,async(req,res)=>{let r=await db(`SELECT c.id,c.type,c.title,c.created_at,(SELECT text FROM messages m WHERE m.chat_id=c.id ORDER BY m.id DESC LIMIT 1) last_message FROM chats c JOIN chat_members cm ON cm.chat_id=c.id WHERE cm.user_id=$1 ORDER BY c.created_at DESC`,[req.user.id]);res.json({ok:true,chats:r.rows})});
app.post("/api/chats/private",auth,async(req,res)=>{let u=String(req.body.username||"").trim().toLowerCase().replace(/^@/,""),x=await db("SELECT id,username,name FROM users WHERE username=$1",[u]);if(!x.rows[0])return res.status(404).json({error:"User not found"});let old=await db(`SELECT c.id FROM chats c JOIN chat_members a ON a.chat_id=c.id AND a.user_id=$1 JOIN chat_members b ON b.chat_id=c.id AND b.user_id=$2 WHERE c.type='private' LIMIT 1`,[req.user.id,x.rows[0].id]);if(old.rows[0])return res.json({ok:true,chat:old.rows[0]});let c=await db("INSERT INTO chats(type,title,owner_id) VALUES('private',$1,$2) RETURNING id,type,title",[x.rows[0].name,req.user.id]);await db("INSERT INTO chat_members(chat_id,user_id) VALUES($1,$2),($1,$3)",[c.rows[0].id,req.user.id,x.rows[0].id]);res.json({ok:true,chat:c.rows[0]})});
app.get("/api/chats/:id/messages",auth,async(req,res)=>{let id=Number(req.params.id),m=await db("SELECT 1 FROM chat_members WHERE chat_id=$1 AND user_id=$2",[id,req.user.id]);if(!m.rows[0])return res.status(403).json({error:"Not a member"});let r=await db(`SELECT m.id,m.chat_id,m.user_id,m.text,m.reply_to,m.edited,m.created_at,u.username,u.name,u.avatar FROM messages m JOIN users u ON u.id=m.user_id WHERE m.chat_id=$1 ORDER BY m.id DESC LIMIT 100`,[id]);res.json({ok:true,messages:r.rows.reverse()})});
app.post("/api/chats/:id/messages",auth,async(req,res)=>{let id=Number(req.params.id),t=String(req.body.text||"").trim();if(!t)return res.status(400).json({error:"Empty message"});let m=await db("SELECT 1 FROM chat_members WHERE chat_id=$1 AND user_id=$2",[id,req.user.id]);if(!m.rows[0])return res.status(403).json({error:"Not a member"});let r=await db("INSERT INTO messages(chat_id,user_id,text,reply_to) VALUES($1,$2,$3,$4) RETURNING *",[id,req.user.id,t,req.body.reply_to||null]),u=await db("SELECT username,name,avatar FROM users WHERE id=$1",[req.user.id]),msg={...r.rows[0],...u.rows[0]};io.to("chat:"+id).emit("message:new",msg);res.json({ok:true,message:msg})});
app.patch("/api/messages/:id",auth,async(req,res)=>{let t=String(req.body.text||"").trim(),r=await db("UPDATE messages SET text=$1,edited=TRUE,updated_at=NOW() WHERE id=$2 AND user_id=$3 RETURNING *",[t,req.params.id,req.user.id]);if(!r.rows[0])return res.status(404).json({error:"Message not found"});io.to("chat:"+r.rows[0].chat_id).emit("message:edited",r.rows[0]);res.json({ok:true,message:r.rows[0]})});
app.delete("/api/messages/:id",auth,async(req,res)=>{let r=await db("DELETE FROM messages WHERE id=$1 AND user_id=$2 RETURNING id,chat_id",[req.params.id,req.user.id]);if(!r.rows[0])return res.status(404).json({error:"Message not found"});io.to("chat:"+r.rows[0].chat_id).emit("message:deleted",r.rows[0]);res.json({ok:true})});

app.get("/api/missions",auth,async(req,res)=>{let r=await db(`SELECT m.*,u.username owner_username,(SELECT COUNT(*) FROM mission_completions mc WHERE mc.mission_id=m.id AND mc.user_id=$1) AS done FROM missions m JOIN users u ON u.id=m.owner_id WHERE m.status='active' AND m.completed_people<m.max_people ORDER BY m.created_at DESC`,[req.user.id]);res.json({ok:true,missions:r.rows})});
app.post("/api/missions",auth,async(req,res)=>{try{
 let link=String(req.body.link||'').trim(), rewardStars=Math.max(1,Math.floor(Number(req.body.reward_stars || (link.toLowerCase().includes('barcha_kontent')?30:15)))),budget=Math.floor(Number(req.body.stars||0));
 if(!/^https?:\/\//i.test(link))return res.status(400).json({error:"HTTPS link kerak"});
 if(budget<50||budget%2!==0)return res.status(400).json({error:"Minimal 50 Stars va Stars soni juft bo'lishi kerak"});
 let max=Math.floor(budget/2),channel=(link.match(/t\.me\/([^/?]+)/i)?.[1]||'').replace(/^@/,'');
 await spendStars(req.user.id,budget,"mission_create",`Mission: ${link} (${max} users)`);
 let r=await db("INSERT INTO missions(owner_id,link,channel,channel_title,reward_stars,reward_stars,budget_stars,max_people) VALUES($1,$2,$3,$4,0,$5,$6,$7) RETURNING *",[req.user.id,link,channel,channel?`@${channel}`:link,rewardStars,budget,max]);
 await notify(`🎯 <b>Missiya yaratildi</b>\n${link}\n💎 Mukofot: ${rewardStars} Stars\n⭐ Budjet: ${budget} Stars\n👥 Limit: ${max}`);
 res.json({ok:true,mission:r.rows[0]})
 }catch(e){res.status(400).json({error:e.message})}});
app.post("/api/missions/:id/complete",auth,async(req,res)=>{try{
 let id=Number(req.params.id),m=await db("SELECT * FROM missions WHERE id=$1 FOR UPDATE",[id]);if(!m.rows[0]||m.rows[0].status!=="active")return res.status(404).json({error:"Mission unavailable"});let x=m.rows[0];
 if(x.owner_id==req.user.id)return res.status(400).json({error:"O'z missiyangizni bajara olmaysiz"});
 let exists=await db("SELECT id FROM mission_completions WHERE mission_id=$1 AND user_id=$2",[id,req.user.id]);if(exists.rows[0])return res.status(409).json({error:"Already completed"});
 let tguser=await db("SELECT telegram_id FROM users WHERE id=$1",[req.user.id]);
 if(BOT_TOKEN && x.channel && tguser.rows[0]?.telegram_id){let mem=await tg("getChatMember",{chat_id:'@'+x.channel.replace(/^@/,''),user_id:Number(tguser.rows[0].telegram_id)});if(!["member","administrator","creator"].includes(mem.status))return res.status(400).json({error:"Kanalga hali qo'shilmagansiz"})}
 await db("INSERT INTO mission_completions(mission_id,user_id,reward) VALUES($1,$2,$3)",[id,x.reward_stars]);await addStars(req.user.id,x.reward_stars,"mission_reward",`Mission #${id}`,id);
 let completed=Number(x.completed_people)+1,status=completed>=x.max_people?"completed":"active";await db("UPDATE missions SET completed_people=$1,status=$2 WHERE id=$3",[completed,status,id]);
 await notify(`✅ <b>Missiya bajarildi</b>\nMission #${id}\nUser: ${req.user.id}\n+${x.reward_stars} Stars`);
 res.json({ok:true,reward:x.reward_stars,completed,remaining:Math.max(0,x.max_people-completed)})
 }catch(e){res.status(400).json({error:e.message})}});

app.post("/api/chats/create",auth,async(req,res)=>{try{let type=['group','channel'].includes(req.body.type)?req.body.type:'group',title=String(req.body.title||'').trim();if(title.length<2)return res.status(400).json({error:'Nom kiriting'});let c=await db("INSERT INTO chats(type,title,owner_id) VALUES($1,$2,$3) RETURNING id,type,title,owner_id,created_at",[type,title,req.user.id]);await db("INSERT INTO chat_members(chat_id,user_id,role) VALUES($1,$2,'owner')",[c.rows[0].id,req.user.id]);res.json({ok:true,chat:c.rows[0]})}catch(e){res.status(400).json({error:e.message})}});
app.get("/api/referral",auth,async(req,res)=>{let u=await db("SELECT referral_code FROM users WHERE id=$1",[req.user.id]),r=await db("SELECT COUNT(*) n FROM users WHERE referrer_id=$1",[req.user.id]);res.json({ok:true,code:u.rows[0].referral_code,count:Number(r.rows[0].n),reward:15})});
app.post("/api/gifts",auth,async(req,res)=>{try{let to=String(req.body.username||"").replace(/^@/,"").trim().toLowerCase(),gift=String(req.body.gift||"🎁"),cost=Math.max(1,Number(req.body.stars||10)),x=await db("SELECT id,name FROM users WHERE username=$1",[to]);if(!x.rows[0])return res.status(404).json({error:"User topilmadi"});await spendStars(req.user.id,cost,"gift",`Gift ${gift} -> @${to}`);await addStars(x.rows[0].id,cost,"gift_received",`Gift ${gift} from user ${req.user.id}`);await db("INSERT INTO gifts(from_user_id,to_user_id,gift,stars) VALUES($1,$2,$3,$4)",[req.user.id,x.rows[0].id,gift,cost]);res.json({ok:true,gift,stars:cost})}catch(e){res.status(400).json({error:e.message})}});
app.get("/api/premium",auth,async(req,res)=>{let r=await db("SELECT expires_at FROM premium WHERE user_id=$1",[req.user.id]);res.json({ok:true,active:!!r.rows[0]&&new Date(r.rows[0].expires_at)>new Date(),expires_at:r.rows[0]?.expires_at||null,price:500})});
app.post("/api/premium/buy",auth,async(req,res)=>{try{await spendStars(req.user.id,500,"premium","Telegram-style Premium 1 month");let r=await db(`INSERT INTO premium(user_id,expires_at) VALUES($1,NOW()+INTERVAL '1 month') ON CONFLICT(user_id) DO UPDATE SET expires_at=GREATEST(premium.expires_at,NOW())+INTERVAL '1 month' RETURNING expires_at`,[req.user.id]);res.json({ok:true,expires_at:r.rows[0].expires_at})}catch(e){res.status(400).json({error:e.message})}});

app.post("/api/stars/invoice",auth,async(req,res)=>{try{
 let amount=Math.max(1,Math.floor(Number(req.body.amount||100))),payload=`stars:${req.user.id}:${Date.now()}`;
 let link=await tg("createInvoiceLink",{title:`${amount} Telegram Stars`,description:`Telegram Zero balansiga ${amount} Stars`,payload,currency:"XTR",prices:[{label:`${amount} Stars`,amount:amount}]});
 res.json({ok:true,url:link,amount})
 }catch(e){res.status(400).json({error:e.message})}});
app.post("/api/telegram/webhook",async(req,res)=>{try{
 let u=req.body?.message?.from;if(u){let command=String(req.body.message.text||"").trim();if(command==="/balance"){let b=await db("SELECT stars FROM users WHERE telegram_id=$1",[u.id]);await tg("sendMessage",{chat_id:u.id,text:b.rows[0]?`Balansingiz: ★ ${b.rows[0].stars}`:"Telegram ID hali ilovadagi profilingizga bog'lanmagan."});return res.sendStatus(200)}let p=command.match(/^\/start(?:\s+(.+))?/);await db(`INSERT INTO bot_subscribers(telegram_id,username,first_name,start_payload) VALUES($1,$2,$3,$4) ON CONFLICT(telegram_id) DO UPDATE SET username=EXCLUDED.username,first_name=EXCLUDED.first_name,last_seen=NOW(),start_payload=EXCLUDED.start_payload`,[u.id,u.username||null,u.first_name||"",p?.[1]||null]);if(p){await tg("sendMessage",{chat_id:u.id,text:`Salom, ${u.first_name||"do'st"}! 👋\nTelegram Zero botiga xush kelibsiz.\nStars, missiyalar va Premium uchun ilovaga kiring.`})}}
 let sp=req.body?.message?.successful_payment;if(sp){let payload=String(sp.invoice_payload),m=payload.match(/^stars:(\d+):/);if(m){let uid=Number(m[1]);await addStars(uid,Number(sp.total_amount),"purchase","Telegram Stars payment",sp.telegram_payment_charge_id);await notify(`💳 <b>Stars to'lovi</b>\nUser #${uid}\n+${sp.total_amount} Stars`)}}res.sendStatus(200)
 }catch(e){console.error(e);res.sendStatus(200)}});
io.use((s,n)=>{try{s.user=jwt.verify(s.handshake.auth?.token||"",SECRET);n()}catch{n(new Error("Unauthorized"))}});
io.on("connection",s=>{db("UPDATE users SET online=TRUE,last_seen=NOW() WHERE id=$1",[s.user.id]).catch(()=>{});s.on("chat:join",id=>db("SELECT 1 FROM chat_members WHERE chat_id=$1 AND user_id=$2",[id,s.user.id]).then(r=>{if(r.rows[0])s.join("chat:"+id)}).catch(()=>{}));s.on("typing",d=>{if(d?.chatId)s.to("chat:"+d.chatId).emit("typing",{userId:s.user.id})});s.on("disconnect",()=>db("UPDATE users SET online=FALSE,last_seen=NOW() WHERE id=$1",[s.user.id]).catch(()=>{}))});
app.use(express.static(path.join(ROOT,"client")));app.get("/{*splat}",(req,res)=>res.sendFile(path.join(ROOT,"client","index.html")));
init().then(()=>server.listen(PORT,"0.0.0.0",()=>console.log("Telegram Zero on "+PORT))).catch(e=>{console.error(e);process.exit(1)});
