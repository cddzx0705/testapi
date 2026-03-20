const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

/* ================= ADMIN ================= */
const ADMIN_USER = "admin";
const ADMIN_PASS = "chiduc0705";

/* ================= DATABASE ================= */
const MONGO_URI =
  process.env.MONGO_URL || "mongodb://localhost:27017/key_manager";

mongoose.connect(MONGO_URI).then(() =>
  console.log("✅ MongoDB Connected")
);

const keySchema = new mongoose.Schema({
  key: String,
  expire: Number,
  maxDevice: Number,
  devices: [String],
  toggles: { type: Object, default: {} },
  isBanned: { type: Boolean, default: false },
  note: String,
  createdAt: { type: Date, default: Date.now },
});

const KeyModel = mongoose.model("Key", keySchema);

/* ================= SESSION ================= */
app.use(
  session({
    secret: "cddz_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 },
  })
);

/* ================= AUTH ================= */
const auth = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.status(401).json({ success: false });
};

/* ================= LOGIN ================= */
app.post("/admin/login", (req, res) => {
  const { user, pass } = req.body;

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }

  res.send(
    "<script>alert('Sai tài khoản');location='/admin'</script>"
  );
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/admin");
});

/* ================= ADMIN API ================= */

app.get("/api/keys", auth, async (req, res) => {
  const keys = await KeyModel.find().sort({ createdAt: -1 });
  res.json(keys);
});

app.post("/api/createKey", auth, async (req, res) => {
  const { days, maxDevice, note } = req.body;

  const keyString =
    "CDDZ-" +
    Math.random().toString(36).substring(2, 10).toUpperCase();

  const expireDate =
    Date.now() + Number(days) * 86400000;

  await new KeyModel({
    key: keyString,
    expire: expireDate,
    maxDevice: Number(maxDevice),
    note,
  }).save();

  res.json({ success: true });
});

app.post("/api/deleteKey", auth, async (req, res) => {
  await KeyModel.deleteOne({ key: req.body.key });
  res.json({ success: true });
});

app.post("/api/toggleBan", auth, async (req, res) => {
  const k = await KeyModel.findOne({ key: req.body.key });
  if (!k) return res.json({ success: false });

  k.isBanned = !k.isBanned;
  await k.save();

  res.json({ success: true });
});

/* ===== DEVICE LIST ===== */
app.post("/api/getDevices", auth, async (req, res) => {
  const k = await KeyModel.findOne({ key: req.body.key });
  if (!k) return res.json({ success: false });

  res.json({
    success: true,
    devices: k.devices || [],
  });
});

/* ================= TOOL API ================= */
app.post("/checkKey", async (req, res) => {
  try {
    const { key, deviceId } = req.body;
    const now = Date.now();

    const k = await KeyModel.findOne({ key });

    if (!k)
      return res.json({
        success: false,
        message: "Key không tồn tại",
      });

    if (k.isBanned)
      return res.json({
        success: false,
        message: "Key bị khóa",
      });

    if (now > k.expire)
      return res.json({
        success: false,
        message: "Key hết hạn",
      });

    if (!k.devices.includes(deviceId)) {
      if (k.devices.length >= k.maxDevice)
        return res.json({
          success: false,
          message: "Hết slot máy",
        });

      k.devices.push(deviceId);
      await k.save();
    }

    res.json({
      success: true,
      expireAt: k.expire,
      serverTime: now,
      toggles: k.toggles,
    });
  } catch {
    res.json({ success: false });
  }
});

/* ================= ADMIN PAGE ================= */
app.get("/admin", (req, res) => {

if (!req.session.isAdmin) {
return res.send(`
<body style="background:#020617;color:white;
display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif">

<form action="/admin/login" method="POST"
style="background:#0f172a;padding:30px;border-radius:12px">

<h2>🔒 Admin Login</h2>
<input name="user" placeholder="User"><br><br>
<input name="pass" type="password" placeholder="Pass"><br><br>
<button>Login</button>

</form>
</body>`);
}

res.send(`

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>CDDZ ADMIN</title>

<style>

*{box-sizing:border-box}

body{
margin:0;
font-family:Inter,Segoe UI,sans-serif;
background:#020617;
color:white;
}

.container{
max-width:1200px;
margin:30px auto;
padding:25px;
background:#0f172a;
border-radius:16px;
box-shadow:0 0 40px rgba(0,0,0,.6);
}

input{
background:#020617;
border:1px solid #1e293b;
color:white;
padding:10px;
border-radius:8px;
}

button{
border:none;
padding:8px 14px;
border-radius:8px;
cursor:pointer;
font-weight:600;
}

.btn-add{background:#22c55e;color:white}
.btn-copy{background:#3b82f6;color:white}
.btn-ban{background:#f59e0b}
.btn-del{background:#ef4444;color:white}

table{
width:100%;
border-collapse:collapse;
margin-top:20px;
}

th{
text-align:left;
font-size:13px;
color:#94a3b8;
padding:12px;
border-bottom:1px solid #1e293b;
}

td{
padding:14px 12px;
border-bottom:1px solid #020617;
}

tr:hover{background:#020617}

.active{color:#22c55e;font-weight:600}
.expired{color:#ef4444;font-weight:600}
.banned{color:#f59e0b;font-weight:600}

.key{
color:#60a5fa;
font-weight:600;
}

/* DEVICE BOX */
#deviceBox{
display:none;
margin-top:20px;
background:#020617;
border:1px solid #1e293b;
padding:15px;
border-radius:12px;
}

.device-row{
display:flex;
justify-content:space-between;
padding:6px 0;
border-bottom:1px solid #1e293b;
font-size:13px;
}

</style>
</head>

<body>

<div class="container">

<h2>🚀 CDDZ KEY MANAGER</h2>

Ngày <input id="d" type="number" value="1" style="width:60px">
Máy <input id="m" type="number" value="1" style="width:60px">
Số key <input id="a" type="number" value="1" style="width:70px">
<input id="n" placeholder="Ghi chú..." style="width:260px">

<button class="btn-add" onclick="add()">TẠO KEY</button>
<a href="/admin/logout" style="float:right;color:#94a3b8">Đăng xuất</a>

<table>
<thead>
<tr>
<th>Key</th>
<th>Hết hạn</th>
<th>Thiết bị</th>
<th>Note</th>
<th>Status</th>
<th>Action</th>
</tr>
</thead>

<tbody id="list"></tbody>
</table>

<!-- DEVICE LIST -->
<div id="deviceBox">
<h3>📱 Danh sách thiết bị</h3>
<div id="deviceList"></div>
</div>

</div>

<script>

/* ===== HELPER ===== */

function copy(text){
 navigator.clipboard.writeText(text);
}

function shortID(id){
 return id.slice(0,4)+"..."+id.slice(-4);
}

/* ===== LOAD ===== */

async function load(){

const r = await fetch('/api/keys');
if(r.status==401) return location.reload();

const data = await r.json();

list.innerHTML = data.map(k=>{

let cls="active",st="ACTIVE";

if(Date.now()>k.expire){
 cls="expired";
 st="HẾT HẠN";
}

if(k.isBanned){
 cls="banned";
 st="BANNED";
}

return \`
<tr>

<td class="key">\${k.key}</td>

<td>
\${new Date(k.expire).toLocaleDateString()}<br>
<span style="opacity:.6;font-size:12px">
\${new Date(k.expire).toLocaleTimeString()}
</span>
</td>

<td>
<button class="btn-copy"
onclick="viewDevices('\${k.key}')">
Xem (\${k.devices.length}/\${k.maxDevice})
</button>
</td>

<td>\${k.note||"-"}</td>

<td class="\${cls}">\${st}</td>

<td>
<button class="btn-copy" onclick="copy('\${k.key}')">Copy</button>
<button class="btn-ban" onclick="toggleBan('\${k.key}')">Ban</button>
<button class="btn-del" onclick="delKey('\${k.key}')">Xóa</button>
</td>

</tr>\`;
}).join('');

}

/* ===== VIEW DEVICE ===== */

async function viewDevices(key){

const r = await fetch('/api/getDevices',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({key})
});

const data = await r.json();

deviceBox.style.display="block";

deviceList.innerHTML =
data.devices.length
? data.devices.map(d=>\`
<div class="device-row">
<span>\${shortID(d)}</span>
<button onclick="copy('\${d}')">📋</button>
</div>\`).join('')
: "Chưa có thiết bị";

}

/* ===== CREATE KEY ===== */

async function add(){

const r = await fetch('/api/createKey',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
days:d.value,
maxDevice:m.value,
note:n.value,
amount:a.value
})
});

const data = await r.json();

if(data.keys)
alert("Tạo thành công:\\n"+data.keys.join("\\n"));

load();
}

/* ===== ACTION ===== */

async function toggleBan(key){
await fetch('/api/toggleBan',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({key})
});
load();
}

async function delKey(key){
if(confirm("Xóa key?")){
await fetch('/api/deleteKey',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({key})
});
load();
}
}

load();
setInterval(load,10000);

</script>

</body>
</html>
`);
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log("🔥 Server running: http://localhost:" + PORT + "/admin")
);
