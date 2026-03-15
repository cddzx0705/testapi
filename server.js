const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const DB = "./keys.json";

/* ================= LOAD DATABASE ================= */
let data = { keys: [] };

if (fs.existsSync(DB)) {
    try {
        data = JSON.parse(fs.readFileSync(DB));
    } catch (e) {
        data = { keys: [] };
    }
}

function saveDB() {
    fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}

/* ================= TEST ================= */
app.get("/", (req, res) => {
    res.send("KEY API RUNNING - PHIÊN BẢN ĐÃ FIX");
});

/* ================= CREATE KEY ================= */
app.post("/createKey", (req, res) => {
    // Lấy từ body hoặc query, ép kiểu về số (Number)
    const days = Number(req.body.days || req.query.days) || 1;
    const maxDevice = Number(req.body.maxDevice || req.query.maxDevice) || 1;

    const key = "CDDZ-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    const expire = Date.now() + (days * 86400000);

    const newKey = {
        key: key,
        expire: expire,
        maxDevice: maxDevice,
        devices: [],
        toggles: {}
    };

    data.keys.push(newKey);
    saveDB();

    res.json({
        success: true,
        key: key,
        days_set: days, // Trả về để bạn kiểm tra xem đã nhận đúng chưa
        maxDevice_set: maxDevice,
        expire: new Date(expire).toISOString()
    });
});

/* ================= CHECK KEY ================= */
app.post("/checkKey", (req, res) => {
    const { key, deviceId } = req.body;
    const k = data.keys.find(x => x.key === key);

    if (!k) {
        return res.json({ success: false, message: "Invalid key" });
    }

    if (Date.now() > k.expire) {
        return res.json({ success: false, message: "Key expired" });
    }

    if (!k.devices.includes(deviceId)) {
        if (k.devices.length >= k.maxDevice) {
            return res.json({ success: false, message: "Device limit reached" });
        }
        k.devices.push(deviceId);
        saveDB();
    }

    const daysLeft = Math.ceil((k.expire - Date.now()) / 86400000);
    res.json({
        success: true,
        daysLeft: daysLeft,
        toggles: k.toggles || {}
    });
});

/* ================= SAVE TOGGLE ================= */
app.post("/saveToggle", (req, res) => {
    const { key, toggle, value } = req.body;
    const k = data.keys.find(x => x.key === key);

    if (!k) return res.json({ success: false });

    if (!k.toggles) k.toggles = {};
    k.toggles[toggle] = value;
    saveDB();

    res.json({ success: true });
});

/* ================= GET TOGGLE ================= */
app.get("/getToggle", (req, res) => {
    const key = req.query.key;
    const k = data.keys.find(x => x.key === key);

    if (!k) return res.json({ success: false });

    res.json({
        success: true,
        toggles: k.toggles || {}
    });
});

/* ================= LIST KEYS ================= */
app.get("/keys", (req, res) => {
    res.json(data.keys);
});

/* ================= START ================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log("SERVER IS RUNNING ON PORT " + PORT);
});
