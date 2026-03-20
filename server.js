const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

/* ================= ADMIN CONFIG ================= */

const ADMIN_USER = "admin";
const ADMIN_PASS = "chiduc0705";

/* ================= DATABASE ================= */

const MONGO_URI =
  process.env.MONGO_URL || "mongodb://localhost:27017/key_manager";

mongoose.connect(MONGO_URI).then(() =>
  console.log("✅ DB Connected")
);

const keySchema = new mongoose.Schema({
  key: String,
  expire: Number,
  maxDevice: Number,
  devices: { type: [String], default: [] },
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
  req.session.destroy(() => res.redirect("/admin"));
});

/* ================= AUTH ================= */

const auth = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.status(401).json({ success: false });
};

/* ================= ADMIN API ================= */

app.get("/api/keys", auth, async (req, res) => {
  const now = Date.now();
  const keys = await KeyModel.find().sort({ createdAt: -1 });

  const result = keys.map((k) => ({
    ...k.toObject(),
    status: k.isBanned
      ? "BANNED"
      : now > k.expire
      ? "EXPIRED"
      : "ACTIVE",
  }));

  res.json(result);
});

/* ===== CREATE MULTIPLE KEY ===== */

app.post("/api/createKey", auth, async (req, res) => {
  const { days, maxDevice, note, amount } = req.body;

  const list = [];

  for (let i = 0; i < (amount || 1); i++) {
    const keyString =
      "CDDZ-" +
      Math.random().toString(36).substring(2, 10).toUpperCase();

    const expireDate = Date.now() + Number(days) * 86400000;

    await new KeyModel({
      key: keyString,
      expire: expireDate,
      maxDevice: Number(maxDevice),
      note,
    }).save();

    list.push(keyString);
  }

  res.json({ success: true, keys: list });
});

app.post("/api/toggleBan", auth, async (req, res) => {
  const k = await KeyModel.findOne({ key: req.body.key });
  if (k) {
    k.isBanned = !k.isBanned;
    await k.save();
  }
  res.json({ success: true });
});

app.post("/api/deleteKey", auth, async (req, res) => {
  await KeyModel.deleteOne({ key: req.body.key });
  res.json({ success: true });
});

/* ================= TOOL API ================= */

app.post("/checkKey", async (req, res) => {
  try {
    const { key, deviceId } = req.body;
    const now = Date.now();

    const k = await KeyModel.findOne({ key });

    if (!k)
      return res.json({ success: false, message: "Key không tồn tại" });

    if (k.isBanned)
      return res.json({ success: false, message: "Key bị khóa" });

    if (now > k.expire)
      return res.json({ success: false, message: "Key hết hạn" });

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
    res.json({ success: false, message: "Server error" });
  }
});

/* ================= ADMIN PAGE ================= */

app.get("/admin", (req, res) => {
  if (!req.session.isAdmin) {
    return res.send(`
<body style="background:#0f172a;display:flex;justify-content:center;align-items:center;height:100vh;color:white;font-family:sans-serif">
<form action="/admin/login" method="POST">
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
body{margin:0;background:#0f172a;color:white;font-family:Segoe UI}
.container{max-width:1100px;margin:auto;background:#111827;padding:20px;border-radius:12px;margin-top:20px}
input{padding:10px;background:#020617;border:1px solid #1f2937;color:white;border-radius:6px}
button{padding:8px 12px;border:none;border-radius:6px;font-weight:bold;cursor:pointer}
.btn-add{background:#22c55e;color:white}
.btn-copy{background:#3b82f6;color:white}
.btn-ban{background:#f59e0b}
.btn-del{background:#ef4444;color:white}
table{width:100%;border-collapse:collapse;margin-top:20px}
td,th{padding:12px;border-bottom:1px solid #1f2937}
.active{color:#22c55e}
.expired{color:#ef4444}
.banned{color:#f59e0b}
</style>

</head>

<body>

<div class="container">

<h2>🚀 CDDZ KEY MANAGER</h2>

Ngày <input id="d" type="number" value="1" style="width:60px">
Máy <input id="m" type="number" value="1" style="width:60px">
Số key <input id="a" type="number" value="1" style="width:70px">
<input id="n" placeholder="Ghi chú..." style="width:250px">
<button class="btn-add" onclick="add()">TẠO KEY</button>

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

</div>

<script>

function copy(text){
 navigator.clipboard.writeText(text);
 alert("Đã copy!");
}

async function load(){
 const r=await fetch('/api/keys');
 if(r.status==401) return location.reload();
 const data=await r.json();

 list.innerHTML=data.map(k=>{

 let cls="active",st="ACTIVE";
 if(k.status==="EXPIRED"){cls="expired";st="HẾT HẠN"}
 if(k.status==="BANNED"){cls="banned";st="BANNED"}

 return \`
<tr>
<td><b>\${k.key}</b></td>
<td>\${new Date(k.expire).toLocaleString()}</td>
<td>\${k.devices.join("<br>")||"-"}<br>\${k.devices.length}/\${k.maxDevice}</td>
<td>\${k.note||"-"}</td>
<td class="\${cls}">\${st}</td>
<td>
<button class="btn-copy" onclick="copy('\${k.key}')">COPY</button>
<button class="btn-ban" onclick="toggleBan('\${k.key}')">BAN</button>
<button class="btn-del" onclick="delKey('\${k.key}')">XÓA</button>
</td>
</tr>\`
 }).join('');
}

async function add(){
 const r=await fetch('/api/createKey',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({
   days:d.value,
   maxDevice:m.value,
   note:n.value,
   amount:a.value
  })
 });

 const data=await r.json();
 alert("Tạo thành công:\\n"+data.keys.join("\\n"));
 load();
}

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

</script>

</body>
</html>
`);
});

/* ================= START ================= */

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log("🔥 Admin running: http://localhost:" + PORT + "/admin")
);
