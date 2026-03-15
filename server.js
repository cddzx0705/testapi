const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session"); // Thêm session để quản lý đăng nhập

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// --- CẤU HÌNH ADMIN (Thay đổi ở đây) ---
const ADMIN_USER = "admin"; 
const ADMIN_PASS = "123456"; 

// --- CẤU HÌNH DATABASE ---
const MONGO_URI = process.env.MONGO_URL || "mongodb://localhost:27017/key_manager";
mongoose.connect(MONGO_URI).then(() => console.log("✅ DB Connected"));

const keySchema = new mongoose.Schema({
    key: String,
    expire: Number,
    maxDevice: Number,
    devices: [String],
    toggles: { type: Object, default: {} },
    isBanned: { type: Boolean, default: false },
    note: String,
    createdAt: { type: Date, default: Date.now }
});
const KeyModel = mongoose.model("Key", keySchema);

// Cấu hình Session để lưu trạng thái đăng nhập
app.use(session({
    secret: "cddz_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // Hết hạn sau 1 tiếng
}));

/* ================= LOGIN LOGIC ================= */
app.post("/admin/login", (req, res) => {
    const { user, pass } = req.body;
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        req.session.isAdmin = true;
        return res.redirect("/admin");
    }
    res.send("<script>alert('Sai tài khoản!'); window.location='/admin';</script>");
});

app.get("/admin/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/admin");
});

/* ================= API (CHỈ ADMIN MỚI GỌI ĐƯỢC) ================= */
const auth = (req, res, next) => {
    if (req.session.isAdmin) return next();
    res.status(401).json({ success: false, message: "Unauthorized" });
};

app.get("/api/keys", auth, async (req, res) => {
    const keys = await KeyModel.find().sort({ createdAt: -1 });
    res.json(keys);
});

app.post("/api/createKey", auth, async (req, res) => {
    const { days, maxDevice, note } = req.body;
    const keyString = "CDDZ-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    const expireDate = Date.now() + (Number(days) * 86400000);
    await new KeyModel({ key: keyString, expire: expireDate, maxDevice: Number(maxDevice), note }).save();
    res.json({ success: true, key: keyString });
});

app.post("/api/toggleBan", auth, async (req, res) => {
    const k = await KeyModel.findOne({ key: req.body.key });
    if (k) { k.isBanned = !k.isBanned; await k.save(); res.json({ success: true }); }
});

app.post("/api/deleteKey", auth, async (req, res) => {
    await KeyModel.deleteOne({ key: req.body.key });
    res.json({ success: true });
});

/* ================= API CHO TOOL (KHÔNG CẦN LOGIN) ================= */
app.post("/checkKey", async (req, res) => {
    const { key, deviceId } = req.body;
    const k = await KeyModel.findOne({ key });
    if (!k) return res.json({ success: false, message: "Key không tồn tại!" });
    if (k.isBanned) return res.json({ success: false, message: "Key bị khóa!" });
    if (Date.now() > k.expire) return res.json({ success: false, message: "Key hết hạn!" });

    if (!k.devices.includes(deviceId)) {
        if (k.devices.length >= k.maxDevice) return res.json({ success: false, message: "Hết slot máy!" });
        k.devices.push(deviceId);
        await k.save();
    }
    res.json({ success: true, daysLeft: Math.ceil((k.expire - Date.now()) / 86400000), toggles: k.toggles });
});

/* ================= GIAO DIỆN ADMIN ================= */
app.get("/admin", (req, res) => {
    if (!req.session.isAdmin) {
        return res.send(`
            <body style="font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f2f5;">
                <form action="/admin/login" method="POST" style="background:white; padding:30px; border-radius:10px; box-shadow:0 5px 15px rgba(0,0,0,0.1)">
                    <h2>🔒 Admin Login</h2>
                    <input type="text" name="user" placeholder="Username" required style="display:block; width:100%; margin-bottom:10px; padding:10px;"><br>
                    <input type="password" name="pass" placeholder="Password" required style="display:block; width:100%; margin-bottom:10px; padding:10px;"><br>
                    <button type="submit" style="width:100%; padding:10px; background:#007bff; color:white; border:none; cursor:pointer;">Đăng nhập</button>
                </form>
            </body>
        `);
    }

    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8"><title>CDDZ Admin</title>
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; padding: 20px; }
            .container { max-width: 1000px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .nav { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; margin-bottom: 20px; }
            .form-box { display: flex; gap: 10px; margin-bottom: 20px; background: #e9ecef; padding: 15px; border-radius: 5px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
            input { padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
            button { cursor: pointer; padding: 8px 15px; border: none; border-radius: 4px; font-weight: bold; }
            .btn-add { background: #28a745; color: white; }
            .btn-ban { background: #ffc107; color: #333; }
            .btn-del { background: #dc3545; color: white; }
            .btn-out { background: #6c757d; color: white; text-decoration: none; padding: 5px 10px; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="nav">
                <h2>🚀 Quản lý Key CDDZ</h2>
                <a href="/admin/logout" class="btn-out">Đăng xuất</a>
            </div>
            <div class="form-box">
                <input type="number" id="d" placeholder="Ngày" style="width:60px" value="1">
                <input type="number" id="m" placeholder="Máy" style="width:60px" value="1">
                <input type="text" id="n" placeholder="Ghi chú khách hàng..." style="flex:1">
                <button class="btn-add" onclick="add()">TẠO KEY</button>
            </div>
            <table>
                <thead><tr><th>Mã Key</th><th>Hạn dùng</th><th>Thiết bị</th><th>Ghi chú</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
                <tbody id="list"></tbody>
            </table>
        </div>
        <script>
            async function load() {
                const r = await fetch('/api/keys');
                if(r.status === 401) return window.location.reload();
                const data = await r.json();
                document.getElementById('list').innerHTML = data.map(k => \`
                    <tr>
                        <td><b style="color:#007bff">\${k.key}</b></td>
                        <td>\${new Date(k.expire).toLocaleDateString()}</td>
                        <td>\${k.devices.length}/\${k.maxDevice}</td>
                        <td>\${k.note || '-'}</td>
                        <td>\${k.isBanned ? '<span style="color:red">BANNED</span>' : '<span style="color:green">ACTIVE</span>'}</td>
                        <td>
                            <button class="btn-ban" onclick="toggleBan('\${k.key}')">Ban/Unban</button>
                            <button class="btn-del" onclick="del('\${k.key}')">Xóa</button>
                        </td>
                    </tr>\`).join('');
            }
            async function add() {
                await fetch('/api/createKey', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ days: document.getElementById('d').value, maxDevice: document.getElementById('m').value, note: document.getElementById('n').value })
                });
                load();
            }
            async function toggleBan(key) {
                await fetch('/api/toggleBan', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key }) });
                load();
            }
            async function del(key) {
                if(confirm('Xóa vĩnh viễn?')) {
                    await fetch('/api/deleteKey', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ key }) });
                    load();
                }
            }
            load();
        </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Admin: http://localhost:" + PORT + "/admin"));
