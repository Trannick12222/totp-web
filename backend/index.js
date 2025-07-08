import express from "express";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { authenticator } from "otplib";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT, // phải có dòng này!
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
};

// GET accounts
app.get("/api/accounts", async (req, res) => {
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.query("SELECT * FROM accounts");
  conn.end();
  // Gắn code TOTP mới nhất vào từng account
  res.json(
    rows.map((row) => ({
      ...row,
      code: authenticator.generate(row.secret),
    }))
  );
});

// POST new account
app.post("/api/accounts", async (req, res) => {
  const { label, secret, issuer } = req.body;
  if (!label || !secret) return res.status(400).json({ error: "Thiếu thông tin" });
  const conn = await mysql.createConnection(dbConfig);
  await conn.query(
    "INSERT INTO accounts (label, secret, issuer) VALUES (?, ?, ?)",
    [label, secret, issuer || ""]
  );
  conn.end();
  res.json({ success: true });
});

// DELETE account
app.delete("/api/accounts/:id", async (req, res) => {
  const { id } = req.params;
  const conn = await mysql.createConnection(dbConfig);
  await conn.query("DELETE FROM accounts WHERE id = ?", [id]);
  conn.end();
  res.json({ success: true });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API running at port ${port}`));
