import React, { useState, useEffect, useRef } from "react";
import axios from "axios";

function base32Decode(encoded) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = [];
  for (let i = 0; i < encoded.length; i++) {
    const char = encoded[i];
    if (char === "=") break;
    const index = alphabet.indexOf(char.toUpperCase());
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(output);
}

async function hmacSha1(key, message) {
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await window.crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(signature);
}

async function generateTOTP(secret, timeStep = 30) {
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const timeBuffer = new ArrayBuffer(8);
  const timeView = new DataView(timeBuffer);
  timeView.setBigUint64(0, BigInt(time), false);
  const key = base32Decode(secret);
  const hmac = await hmacSha1(key, timeBuffer);
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1000000).toString().padStart(6, "0");
}

// Lấy account từ DB
const fetchAccounts = async () => {
  const res = await axios.get("/api/accounts");
  // Map để đồng bộ key với frontend
  return res.data.map(acc => ({
    id: acc.id,
    name: acc.label,
    secret: acc.secret,
  }));
};

// Thêm account vào DB
const addAccountToDB = async (account) => {
  await axios.post("/api/accounts", {
    label: account.name,
    secret: account.secret,
  });
};

// Xóa account trên DB
const deleteAccountFromDB = async (id) => {
  await axios.delete(`/api/accounts/${id}`);
};

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");
  const [codes, setCodes] = useState([]);
  const [timer, setTimer] = useState(30 - (Math.floor(Date.now() / 1000) % 30));
  const [toast, setToast] = useState("");
  const toastRef = useRef(null);

  // Load account từ DB khi mở trang
  useEffect(() => {
    fetchAccounts().then(setAccounts);
  }, []);

  // Update TOTP codes and timer every second
  useEffect(() => {
    let active = true;
    const updateCodes = async () => {
      if (!active) return;
      const codeList = await Promise.all(
        accounts.map((acc) => generateTOTP(acc.secret))
      );
      setCodes(codeList);
      setTimer(30 - (Math.floor(Date.now() / 1000) % 30));
    };
    updateCodes();
    const interval = setInterval(updateCodes, 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [accounts]);

  // Toast timeout
  useEffect(() => {
    if (toast) {
      toastRef.current = setTimeout(() => setToast(""), 3000);
    }
    return () => clearTimeout(toastRef.current);
  }, [toast]);

  // Thêm account
  const addAccount = async (e) => {
    e.preventDefault();
    if (!name.trim() || !secret.trim()) {
      setToast("Vui lòng nhập đầy đủ thông tin!");
      return;
    }
    try {
      await generateTOTP(secret.trim().replace(/\s/g, ""));
      await addAccountToDB({
        name: name.trim(),
        secret: secret.trim().replace(/\s/g, ""),
      });
      setName("");
      setSecret("");
      setToast("Đã thêm tài khoản thành công!");
      // Reload từ DB
      fetchAccounts().then(setAccounts);
    } catch {
      setToast("Secret key không hợp lệ!");
    }
  };

  // Xóa account
  const removeAccount = async (idx) => {
    try {
      const id = accounts[idx].id;
      await deleteAccountFromDB(id);
      setToast("Đã xóa tài khoản!");
      // Reload từ DB
      fetchAccounts().then(setAccounts);
    } catch {
      setToast("Lỗi khi xóa tài khoản!");
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setToast("Đã sao chép mã vào clipboard!");
  };

  return (
    <div className="container">
      <div className="header">
        <h1>🔐 TOTP Authenticator</h1>
        <p>Quản lý mã xác thực hai yếu tố một cách an toàn</p>
      </div>
      <div className="main-content">
        <form className="add-form" onSubmit={addAccount}>
          <h2 style={{ marginBottom: 20, color: "#374151" }}>
            Thêm tài khoản mới
          </h2>
          <div className="form-group">
            <label htmlFor="account-name">Tên tài khoản:</label>
            <input
              id="account-name"
              type="text"
              placeholder="Ví dụ: Gmail, Facebook, GitHub..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="form-group">
            <label htmlFor="secret-key">Secret Key:</label>
            <input
              id="secret-key"
              type="text"
              placeholder="Nhập secret key từ ứng dụng"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button className="btn" type="submit">
            Thêm tài khoản
          </button>
        </form>
        <div id="accounts-container">
          {accounts.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
              </svg>
              <h3>Chưa có tài khoản nào</h3>
              <p>Thêm tài khoản đầu tiên để bắt đầu tạo mã TOTP</p>
            </div>
          ) : (
            <div className="accounts-grid">
              {accounts.map((acc, idx) => (
                <div className="account-card" key={acc.id}>
                  <div className="account-header">
                    <div className="account-name">{acc.name}</div>
                    <button
                      className="delete-btn"
                      onClick={() => removeAccount(idx)}
                    >
                      Xóa
                    </button>
                  </div>
                  <div className="code-display">
                    <div className="totp-code">{codes[idx] || "------"}</div>
                    <div className="timer-bar">
                      <div
                        className="timer-progress"
                        style={{
                          width: `${(timer / 30) * 100}%`,
                        }}
                      ></div>
                    </div>
                    <div className="timer-text">
                      Thời gian còn lại: <span>{timer}</span>s
                    </div>
                  </div>
                  <button
                    className="copy-btn"
                    onClick={() => copyCode(codes[idx] || "")}
                  >
                    Sao chép mã
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={`toast${toast ? " show" : ""}`}>{toast}</div>
    </div>
  );
}
