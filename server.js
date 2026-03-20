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
    <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif">
      <form method="POST" action="/admin/login">
        <h2>Admin Login</h2>
        <input name="user" placeholder="User"><br><br>
        <input name="pass" type="password" placeholder="Pass"><br><br>
        <button>Login</button>
      </form>
    </body>
    `);
  }

  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>CDDZ PANEL</title>

<style>
body{background:#0f172a;color:white;font-family:Segoe UI;padding:20px}
.card{background:#1e293b;padding:20px;border-radius:12px;margin:auto;max-width:1100px}
table{width:100%;border-collapse:collapse}
th,td{padding:10px;border-bottom:1px solid #334155;text-align:center}
button{padding:6px 12px;border:none;border-radius:6px;cursor:pointer}
.add{background:#22c55e}
.view{background:#3b82f6}
.del{background:#ef4444}
.copy{background:#06b6d4}
.deviceBox{display:none;background:#020617;padding:15px;margin-top:15px;border-radius:10px}
.key{color:#38bdf8;font-weight:bold}
</style>
</head>

<body>

<div class="card">

<h2>🚀 CDDZ KEY MANAGER</h2>

<input id="d" type="number" value="1">
<input id="m" type="number" value="1">
<input id="n" placeholder="Note">
<button class="add" onclick="add()">Tạo</button>

<table>
<thead>
<tr>
<th>Key</th>
<th>Hạn</th>
<th>Slot</th>
<th>Note</th>
<th>Device</th>
<th>Copy</th>
<th>Xóa</th>
</tr>
</thead>
<tbody id="list"></tbody>
</table>

<div id="deviceBox" class="deviceBox">
<h3>📱 Devices</h3>
<ul id="deviceList"></ul>
</div>

</div>

<script>

async function load(){
 const r=await fetch('/api/keys');
 const data=await r.json();

 list.innerHTML=data.map(k=>\`
 <tr>
   <td class="key">\${k.key}</td>
   <td>\${new Date(k.expire).toLocaleDateString()}</td>
   <td>\${k.devices.length}/\${k.maxDevice}</td>
   <td>\${k.note||'-'}</td>

   <td><button class="view" onclick="viewDevices('\${k.key}')">Xem</button></td>

   <td><button class="copy" onclick="copyKey('\${k.key}')">Copy</button></td>

   <td><button class="del" onclick="delKey('\${k.key}')">Xóa</button></td>
 </tr>\`).join('');
}

async function add(){
 await fetch('/api/createKey',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({days:d.value,maxDevice:m.value,note:n.value})
 });
 load();
}

async function delKey(key){
 if(!confirm("Xóa key?"))return;

 await fetch('/api/deleteKey',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({key})
 });

 load();
}

async function viewDevices(key){
 const r=await fetch('/api/getDevices',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({key})
 });

 const data=await r.json();

 deviceBox.style.display="block";

 deviceList.innerHTML=
 data.devices.length
 ? data.devices.map(d=>\`<li>\${d}</li>\`).join('')
 : "<li>Chưa có thiết bị</li>";
}

function copyKey(k){
 navigator.clipboard.writeText(k);
 alert("Đã copy key");
}

load();

</script>

</body>
</html>`);
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log("🔥 Server running: http://localhost:" + PORT + "/admin")
);
