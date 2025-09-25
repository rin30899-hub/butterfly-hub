const path = require("path");
const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 3000;

// view + static
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// sessions
app.use(session({
  secret: "butterfly-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { sameSite: "lax", maxAge: 60 * 60 * 1000 }
}));

// DB
const DB_FILE = path.join(__dirname, "club.sqlite3");
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) console.error("DB open error:", err.message);
  else console.log("DB connected:", DB_FILE);
});

// expose globals to views
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.siteTitle = "Butterfly Hub";
  next();
});

function ensureLoggedIn(req, res, next) {
  if (req.session.user) return next();
  res.redirect("/login?next=" + encodeURIComponent(req.originalUrl));
}

/* -------------------------
   PAGE ROUTES (UI)
------------------------- */
// 1
app.get("/", (req, res) => res.render("home", { title: "Home" }));
// 2
app.get("/products", (req, res) => res.render("products", { title: "Products" }));
// 3
app.get("/donate", (req, res) => res.render("donate", { title: "Donate" }));
// 4
app.get("/news", (req, res) => res.render("news", { title: "News" }));
// 5
app.get("/contact", (req, res) => res.render("contact", { title: "Contact" }));
// 6
app.get("/login", (req, res) => res.render("login", { title: "Login", error: null, next: req.query.next || "/" }));
// 7
app.post("/login", (req, res) => {
  const { username, password, next } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, row) => {
    if (err) return res.status(500).render("login", { title: "Login", error: "DB error.", next: next || "/" });
    if (!row) return res.status(401).render("login", { title: "Login", error: "Invalid username or password.", next: next || "/" });
    const ok = await bcrypt.compare(password, row.password);
    if (!ok) return res.status(401).render("login", { title: "Login", error: "Invalid username or password.", next: next || "/" });
    req.session.user = { id: row.id, username: row.username, display: row.display };
    res.redirect(next || "/");
  });
});
// 8
app.post("/logout", (req, res) => { req.session.destroy(() => res.redirect("/")); });

// Feedback UI
// 9
app.get("/feedback", (req, res) => res.render("feedback", { title: "Customer Feedback" }));
// 10
app.post("/store-feedback", (req, res) => {
  const { name, email, itemName, datePurchased, rating, message } = req.body;
  const iso = new Date(datePurchased || Date.now()).toISOString();
  const sql = `INSERT INTO feedback (name, item, email, date, rating, message) VALUES (?,?,?,?,?,?)`;
  db.run(sql, [name||"", itemName||"", email, iso, parseInt(rating,10), message||""], function(err){
    if (err) return res.status(500).send("Insert error: "+err.message);
    db.all("SELECT * FROM feedback ORDER BY id DESC", (e, rows)=>{
      if (e) return res.status(500).send("Query error: "+e.message);
      res.render("storefeedback", { title: "Feedback Saved", rows });
    });
  });
});
// 11 (admin list)
app.get("/all-feedbacks", ensureLoggedIn, (req, res) => {
  db.all("SELECT * FROM feedback ORDER BY id DESC", (err, rows)=>{
    if (err) return res.status(500).send("Query error: "+err.message);
    const total = rows.length || 1;
    const counts = {1:0,2:0,3:0,4:0,5:0};
    rows.forEach(r=>{ if (counts[r.rating]!=null) counts[r.rating]++; });
    const dist = [5,4,3,2,1].map(star => ({ star, count: counts[star], pct: Math.round((counts[star]||0)*100/total) }));
    res.render("all-feedbacks", { title: "All Feedbacks", rows, dist });
  });
});

// Sketch Studio UI
// 12
app.get("/studio", (req, res) => res.render("studio", { title: "Sketch Studio" }));
// 13
app.get("/gallery", (req, res) => res.render("gallery", { title: "Gallery" }));
// 14
app.get("/docs", (req, res) => res.render("docs", { title: "How It Works" }));

/* -------------------------
   API ROUTES (JSON)
------------------------- */
// 15
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Drawings
// 16
app.get("/api/drawings", (req, res) => {
  db.all("SELECT id, title, created, updated FROM drawings ORDER BY id DESC", (e, rows)=>{
    if (e) return res.status(500).json({ error: e.message });
    res.json(rows);
  });
});
// 17
app.get("/api/drawings/:id", (req, res) => {
  db.get("SELECT * FROM drawings WHERE id=?", [req.params.id], (e, row)=>{
    if (e) return res.status(500).json({ error: e.message });
    if (!row) return res.status(404).json({ error: "not_found" });
    res.json(row);
  });
});
// 18
app.post("/api/drawings", (req, res) => {
  const { title, json, pngPath } = req.body;
  if (!title || !json) return res.status(400).json({ error: "title and json required" });
  const now = new Date().toISOString();
  db.run(
    "INSERT INTO drawings (user_id, title, json, png_path, created, updated) VALUES (?,?,?,?,?,?)",
    [req.session.user?.id || null, title, json, pngPath || null, now, now],
    function(e){
      if (e) return res.status(500).json({ error: e.message });
      res.status(201).json({ id: this.lastID });
    }
  );
});
// 19
app.put("/api/drawings/:id", (req, res) => {
  const { title, json } = req.body;
  const now = new Date().toISOString();
  db.run(
    "UPDATE drawings SET title=?, json=?, updated=? WHERE id=?",
    [title, json, now, req.params.id],
    function(e){
      if (e) return res.status(500).json({ error: e.message });
      if (!this.changes) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    }
  );
});
// 20
app.delete("/api/drawings/:id", (req, res) => {
  db.run("DELETE FROM drawings WHERE id=?", [req.params.id], function(e){
    if (e) return res.status(500).json({ error: e.message });
    if (!this.changes) return res.status(404).json({ error: "not_found" });
    res.json({ ok: true });
  });
});

/* -------------------------
   ERRORS
------------------------- */
app.use((req, res) => res.status(404).render("404", { title: "Not Found" }));
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).render("500", { title: "Server Error" });
});

app.listen(PORT, () => console.log(`Butterfly Hub running at http://localhost:${PORT}`));
db.get("SELECT username, password FROM users WHERE username = 'admin'", (err, row) => {
  if (err) {
    console.error("Check error:", err);
  } else {
    console.log("Admin in DB:", row);
  }
});
