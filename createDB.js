// createDB.js
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcrypt");

const DB_FILE = path.join(__dirname, "club.sqlite3");
const db = new sqlite3.Database(DB_FILE);

async function seed() {
  db.serialize(async () => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        display  TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS feedback (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        name    TEXT,
        item    TEXT,
        email   TEXT NOT NULL,
        date    TEXT NOT NULL,
        rating  INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        message TEXT
      )
    `);

    const username = "admin";
    const plain = "butterfly";
    const display = "Site Admin";
    const hash = await bcrypt.hash(plain, 10);

    // force reset admin user
    db.run("DELETE FROM users WHERE username = ?", [username], (err) => {
      if (err) console.error("Delete error:", err.message);
    });

    db.run(
      `INSERT INTO users (username, password, display) VALUES (?, ?, ?)`,
      [username, hash, display],
      (err) => {
        if (err) {
          console.error("Seed admin error:", err.message);
        } else {
          console.log(`DB ready at ${DB_FILE}`);
          console.log(`Seed admin login: ${username} / ${plain}`);
        }
        db.close();
      }
    );
  });
}

seed();
