const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");

const app = express();

app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

const ADMIN_USER = "admin";
const ADMIN_PASS = "chiduc0705";

const MONGO_URI =
  process.env.MONGO_URL || "mongodb://localhost:27017/key_manager";

mongoose.connect(MONGO_URI).then(() => console.log("✅ MongoDB Connected"));

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

app.use(
  session({
    secret: "cddz_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 },
  })
);

const auth = (req, res, next) => {
  if (req.session.isAdmin) return next();
  res.status(401).json({ success: false });
};

app.post("/admin/login", (req, res) => {
  const { user, pass } = req.body;

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    req.session.isAdmin = true;
    return res.redirect("/admin");
  }

  res.send("<script>alert('Sai tài khoản');location='/admin'</script>");
});

app.get("/admin/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/admin");
});

app.get("/api/keys", auth, async (req, res) => {
  const keys = await KeyModel.find().sort({ createdAt: -1 });
  res.json(keys);
});

app.get("/api/overview", auth, async (req, res) => {
  const keys = await KeyModel.find();

  const now = Date.now();
  const totalKeys = keys.length;
  const activeKeys = keys.filter(k => !k.isBanned && now <= k.expire).length;
  const expiredKeys = keys.filter(k => now > k.expire).length;
  const bannedKeys = keys.filter(k => k.isBanned).length;
  const usedDevices = keys.reduce((sum, k) => sum + ((k.devices || []).length), 0);
  const maxDevices = keys.reduce((sum, k) => sum + (Number(k.maxDevice) || 0), 0);

  res.json({
    totalKeys,
    activeKeys,
    expiredKeys,
    bannedKeys,
    usedDevices,
    maxDevices,
  });
});

app.post("/api/createKey", auth, async (req, res) => {
  const { days, maxDevice, note, amount, customKey } = req.body;

  const total = Math.max(1, Number(amount) || 1);
  const keys = [];

  for (let i = 0; i < total; i++) {
    const keyString =
      customKey && i === 0
        ? String(customKey).trim().toUpperCase()
        : "CDDZ-" + Math.random().toString(36).substring(2, 10).toUpperCase();

    const expireDate = Date.now() + Number(days || 1) * 86400000;

    await new KeyModel({
      key: keyString,
      expire: expireDate,
      maxDevice: Number(maxDevice || 1),
      note,
      devices: [],
    }).save();

    keys.push(keyString);
  }

  res.json({ success: true, keys });
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

app.post("/api/getDevices", auth, async (req, res) => {
  const k = await KeyModel.findOne({ key: req.body.key });
  if (!k) return res.json({ success: false });

  res.json({
    success: true,
    devices: k.devices || [],
  });
});

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

app.get("/admin", (req, res) => {
  if (!req.session.isAdmin) {
    return res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Admin Login</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#060914;font-family:Inter,Segoe UI,Arial,sans-serif;color:#fff}
.login{width:360px;background:#0d1224;border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:28px;box-shadow:0 30px 80px rgba(0,0,0,.45)}
.login input{width:100%;height:44px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:#080c1a;color:white;padding:0 14px;margin-bottom:12px}
.login button{width:100%;height:44px;border:0;border-radius:14px;background:#facc15;font-weight:800;cursor:pointer}
</style>
</head>
<body>
<form class="login" action="/admin/login" method="POST">
<h2>🔒 Admin Login</h2>
<input name="user" placeholder="User">
<input name="pass" type="password" placeholder="Pass">
<button>Login</button>
</form>
</body>
</html>
`);
  }

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>CDUCĐZ KEY MANAGER </title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<style>
*{box-sizing:border-box}
:root{--bg:#f6f7fb;--dark:#0d1325;--line:#e5e7eb;--text:#111827;--muted:#6b7280;--yellow:#facc15;--blue:#2563eb;--red:#ef4444;--green:#22c55e;--orange:#f59e0b}
body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;background:var(--bg);color:var(--text)}
.layout{display:flex;min-height:100vh;padding:18px;gap:18px}
.sidebar{width:255px;background:linear-gradient(180deg,#0b1021,#111827);color:white;border-radius:26px;padding:18px;display:flex;flex-direction:column;box-shadow:0 25px 70px rgba(15,23,42,.25)}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:18px}
.logo{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#fff,#f9a8d4);display:flex;align-items:center;justify-content:center;font-size:22px}
.brand b{font-size:14px}.brand span{display:block;font-size:11px;color:#94a3b8;margin-top:3px}
.hello{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);padding:16px;border-radius:20px;font-size:13px;line-height:1.5;margin-bottom:16px}
.menu{border:1px solid rgba(255,255,255,.15);border-radius:22px;padding:10px}
.menu a{display:flex;align-items:center;gap:10px;height:42px;padding:0 14px;border-radius:16px;text-decoration:none;color:#d1d5db;font-size:14px;margin-bottom:6px;cursor:pointer}
.menu a.active{background:white;color:#111827;font-weight:800}
.menu a:hover{background:rgba(255,255,255,.08);color:white}
.logout{margin-top:auto;height:42px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:#0b1021;border:1px solid rgba(255,255,255,.1);color:#d1d5db;text-decoration:none;font-weight:700}
.main{flex:1;background:white;border-radius:18px;border:1px solid #dbe3f0;box-shadow:0 10px 35px rgba(15,23,42,.05);overflow:hidden}
.topbar{padding:20px 26px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}
.topbar h2{margin:0;font-size:22px}.topbar p{margin:5px 0 0;color:var(--muted);font-size:13px}
.content{padding:24px}.page{display:none}.page.active{display:block}
.card{border:1px solid var(--line);border-radius:18px;padding:22px;background:white;box-shadow:0 12px 28px rgba(15,23,42,.04);margin-bottom:20px}
.card h3{margin:0 0 18px;font-size:18px}
label{font-size:13px;font-weight:700;display:block;margin-bottom:8px}
input,select,textarea{width:100%;border:1px solid #d1d5db;border-radius:14px;background:white;height:44px;padding:0 14px;outline:none;font-family:inherit}
textarea{height:96px;padding-top:12px;resize:vertical}
.hint{font-size:12px;color:var(--muted);margin-top:6px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.stat{border-radius:20px;padding:18px;background:#f8fafc;border:1px solid #e5e7eb}
.stat span{font-size:13px;color:#64748b;font-weight:700}
.stat b{display:block;font-size:28px;margin-top:8px}
.field{margin-bottom:16px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px}
button{border:0;border-radius:14px;height:40px;padding:0 16px;cursor:pointer;font-weight:800;font-family:inherit}
.btn-yellow{background:var(--yellow);color:#111827}.btn-gray{background:#e5e7eb;color:#111827}.btn-blue{background:#dbeafe;color:#1d4ed8}.btn-red{background:#fee2e2;color:#b91c1c}.btn-orange{background:#fef3c7;color:#92400e}
.result{margin-top:18px;border:1px solid #eef2f7;border-radius:14px;overflow:hidden;display:none}
.result-head{background:#fafafa;padding:12px 14px;font-size:13px;font-weight:800;color:#6b7280;border-bottom:1px solid #eef2f7}
.result-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;font-size:13px;border-bottom:1px solid #f3f4f6}
.key-text{font-weight:800;letter-spacing:.4px;color:#111827}
.table-wrap{overflow:auto}
table{width:100%;border-collapse:collapse;min-width:880px}
th{font-size:12px;text-align:left;color:#6b7280;background:#fafafa;padding:13px;border-bottom:1px solid var(--line)}
td{padding:13px;border-bottom:1px solid #f1f5f9;font-size:13px;vertical-align:middle}
tr:hover{background:#fafafa}
.badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:900}
.active-badge{background:#dcfce7;color:#166534}.expired-badge{background:#fee2e2;color:#991b1b}.banned-badge{background:#fef3c7;color:#92400e}
.device-box{display:none;position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:50;align-items:center;justify-content:center;padding:20px}
.device-modal{width:460px;max-width:100%;background:white;border-radius:22px;padding:20px;box-shadow:0 30px 90px rgba(0,0,0,.35)}
.device-row{display:flex;align-items:center;justify-content:space-between;border:1px solid #e5e7eb;border-radius:14px;padding:10px 12px;margin-bottom:8px;font-size:13px}
@media(max-width:900px){.layout{flex-direction:column;padding:10px}.sidebar{width:100%}.grid2,.grid4{grid-template-columns:1fr}}
</style>
</head>

<body>
<div class="layout">
<aside class="sidebar">
  <div class="brand">
    <div class="logo">⚡️</div>
    <div><b>CDUCDZ KEY MANAGER</b><span>Điều hướng nhanh tới từng khu quản lý</span></div>
  </div>

  <div class="hello">
    <b>Xin chào, CDUCDZ APP</b><br>
    Chọn đúng mục bạn cần ở menu bên dưới.
  </div>

  <nav class="menu">
    <a class="nav active" onclick="showPage('status',this)">⌂ Trạng thái</a>
    <a class="nav" onclick="showPage('overview',this)">◉ Tổng quan</a>
    <a class="nav" onclick="showPage('create',this)">🔑 Tạo key</a>
    <a class="nav" onclick="showPage('history',this)">↺ Lịch sử key</a>
    <a class="nav" onclick="showPage('account',this)">♙ Tài khoản</a>
  </nav>

  <a class="logout" href="/admin/logout">↪ Đăng xuất</a>
</aside>

<main class="main">
  <div class="topbar">
    <div>
      <h2 id="pageTitle">Trạng thái</h2>
      <p id="pageDesc">Key còn hoạt động sẽ hiển thị tại đây.</p>
    </div>
    <button class="btn-gray" onclick="refreshAll()">Làm mới</button>
  </div>

  <div class="content">

    <section id="status" class="page active">
      <div class="card">
        <h3>🟢 Key còn hoạt động</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Hết hạn</th>
                <th>Thiết bị</th>
                <th>Ghi chú</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody id="activeList"></tbody>
          </table>
        </div>
      </div>
    </section>

    <section id="overview" class="page">
      <div class="grid4">
        <div class="stat"><span>Tổng key</span><b id="totalKeys">0</b></div>
        <div class="stat"><span>Key hoạt động</span><b id="activeKeys">0</b></div>
        <div class="stat"><span>Thiết bị đang dùng</span><b id="usedDevices">0</b></div>
        <div class="stat"><span>Slot thiết bị</span><b id="maxDevices">0</b></div>
      </div>

      <div class="card" style="margin-top:20px">
        <h3>📊 Chi tiết hệ thống</h3>
        <p>Key bị ban: <b id="bannedKeys">0</b></p>
        <p>Key hết hạn: <b id="expiredKeys">0</b></p>
      </div>
    </section>

    <section id="create" class="page">
      <div class="card">
        <h3>🔑 Tạo key kích hoạt</h3>

        <div class="field">
          <label>Key tự nhập, để trống nếu muốn random</label>
          <input id="customKey" placeholder="ABCD-EFGH-IJKL-MNOP">
          <div class="hint">Nếu bỏ trống hệ thống sẽ tạo dạng CDDZ-XXXXXXXX.</div>
        </div>

        <div class="field">
          <label>Ghi chú</label>
          <textarea id="note" placeholder="Ghi chú cho key"></textarea>
        </div>

        <div class="grid2">
          <div class="field">
            <label>Thời lượng</label>
            <input id="days" type="number" value="30" min="1">
          </div>

          <div class="field">
            <label>Đơn vị</label>
            <select><option>Ngày</option></select>
          </div>
        </div>

        <div class="field">
          <label>Số máy tối đa</label>
          <input id="maxDevice" type="number" value="1" min="1">
        </div>

        <div class="field">
          <label>Số lượng</label>
          <input id="amount" type="number" value="1" min="1">
        </div>

        <div class="actions">
          <button class="btn-yellow" onclick="createKey()">Kích hoạt ngay</button>
        </div>

        <div id="resultBox" class="result">
          <div class="result-head">Key vừa tạo</div>
          <div id="createdKeys"></div>
        </div>
      </div>
    </section>

    <section id="history" class="page">
      <div class="card">
        <h3>📜 Lịch sử key</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Hết hạn</th>
                <th>Thiết bị</th>
                <th>Ghi chú</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody id="list"></tbody>
          </table>
        </div>
      </div>
    </section>

    <section id="account" class="page">
      <div class="card">
        <h3>👤 Tài khoản</h3>
        <p><b>Tài khoản:</b> admin</p>
        <p><b>Quyền:</b> Quản trị viên</p>
        <p><b>Phiên đăng nhập:</b> 1 giờ</p>
        <p><b>Cơ sở dữ liệu:</b> MongoDB key_manager</p>
        <div class="actions">
          <a href="/admin/logout"><button class="btn-red">Đăng xuất</button></a>
        </div>
      </div>
    </section>

  </div>
</main>
</div>

<div id="deviceBox" class="device-box">
  <div class="device-modal">
    <h3>📱 Danh sách thiết bị</h3>
    <div id="deviceList"></div>
    <div class="actions">
      <button class="btn-gray" onclick="closeDevices()">Đóng</button>
    </div>
  </div>
</div>

<script>
let allKeys = [];

function showPage(id, el){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');

  document.querySelectorAll('.nav').forEach(n => n.classList.remove('active'));
  el.classList.add('active');

  const titles = {
    status:['Trạng thái','Key còn hoạt động sẽ hiển thị tại đây.'],
    overview:['Tổng quan','Thống kê key và số thiết bị đang dùng.'],
    create:['Tạo key','Tạo key kích hoạt mới.'],
    history:['Lịch sử key','Danh sách toàn bộ key.'],
    account:['Tài khoản','Thông tin tài khoản quản trị.']
  };

  pageTitle.innerText = titles[id][0];
  pageDesc.innerText = titles[id][1];
}

function copy(text){
  navigator.clipboard.writeText(text);
}

function shortID(id){
  if(!id) return "-";
  if(id.length <= 12) return id;
  return id.slice(0,6) + "..." + id.slice(-6);
}

function formatDate(t){
  const d = new Date(t);
  return d.toLocaleDateString() + " " + d.toLocaleTimeString();
}

function rowTemplate(k){
  let badge = '<span class="badge active-badge">ACTIVE</span>';

  if(Date.now() > k.expire){
    badge = '<span class="badge expired-badge">HẾT HẠN</span>';
  }

  if(k.isBanned){
    badge = '<span class="badge banned-badge">BANNED</span>';
  }

  return \`
    <tr>
      <td><span class="key-text">\${k.key}</span></td>
      <td>\${formatDate(k.expire)}</td>
      <td>
        <button class="btn-blue" onclick="viewDevices('\${k.key}')">
          Xem (\${(k.devices || []).length}/\${k.maxDevice})
        </button>
      </td>
      <td>\${k.note || "-"}</td>
      <td>\${badge}</td>
      <td>
        <button class="btn-blue" onclick="copy('\${k.key}')">Sao chép</button>
        <button class="btn-orange" onclick="toggleBan('\${k.key}')">Ban/Unban</button>
        <button class="btn-red" onclick="delKey('\${k.key}')">Xóa</button>
      </td>
    </tr>
  \`;
}

async function load(){
  const r = await fetch('/api/keys');
  if(r.status === 401) return location.reload();

  allKeys = await r.json();

  list.innerHTML = allKeys.map(rowTemplate).join('');

  const active = allKeys.filter(k => !k.isBanned && Date.now() <= k.expire);
  activeList.innerHTML = active.length
    ? active.map(rowTemplate).join('')
    : '<tr><td colspan="6">Không có key nào đang hoạt động</td></tr>';
}

async function loadOverview(){
  const r = await fetch('/api/overview');
  if(r.status === 401) return location.reload();

  const d = await r.json();

  totalKeys.innerText = d.totalKeys;
  activeKeys.innerText = d.activeKeys;
  usedDevices.innerText = d.usedDevices;
  maxDevices.innerText = d.maxDevices;
  bannedKeys.innerText = d.bannedKeys;
  expiredKeys.innerText = d.expiredKeys;
}

async function refreshAll(){
  await load();
  await loadOverview();
}

async function createKey(){
  const payload = {
    days: days.value,
    maxDevice: maxDevice.value,
    note: note.value,
    amount: amount.value,
    customKey: customKey.value.trim()
  };

  const r = await fetch('/api/createKey', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });

  const data = await r.json();

  if(data.keys){
    resultBox.style.display = "block";
    createdKeys.innerHTML = data.keys.map(k => \`
      <div class="result-row">
        <span class="key-text">\${k}</span>
        <button class="btn-gray" onclick="copy('\${k}')">Sao chép</button>
      </div>
    \`).join('');
  }

  customKey.value = "";
  refreshAll();
}

async function toggleBan(key){
  await fetch('/api/toggleBan', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({key})
  });
  refreshAll();
}

async function delKey(key){
  if(confirm("Xóa key này?")){
    await fetch('/api/deleteKey', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({key})
    });
    refreshAll();
  }
}

async function viewDevices(key){
  const r = await fetch('/api/getDevices', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({key})
  });

  const data = await r.json();

  deviceBox.style.display = "flex";

  deviceList.innerHTML =
    data.devices && data.devices.length
      ? data.devices.map(d => \`
        <div class="device-row">
          <span>\${shortID(d)}</span>
          <button class="btn-gray" onclick="copy('\${d}')">📋</button>
        </div>
      \`).join('')
      : "<p style='color:#6b7280'>Chưa có thiết bị</p>";
}

function closeDevices(){
  deviceBox.style.display = "none";
}

refreshAll();
setInterval(refreshAll, 10000);
</script>

</body>
</html>
`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  console.log("🔥 Server running: http://localhost:" + PORT + "/admin")
);
