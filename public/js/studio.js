// --- Canvas + state -------------------------------------------------
const pad = document.getElementById("pad");
const ctx = pad.getContext("2d", { willReadFrequently: true });

let tool = "pencil";
let color = "#156f47";
let size  = 6;
let drawing = false;
let strokes = [];
let undone  = [];
let gridOn = false;

// --- UI elements ----------------------------------------------------
const titleEl   = document.getElementById("title");
const sizeEl    = document.getElementById("size");
const sizeLbl   = document.getElementById("sizeLabel");
const colorEl   = document.getElementById("color");
const preview   = document.getElementById("previewDot");
const btnPencil = document.getElementById("pencil");
const btnEraser = document.getElementById("eraser");
const btnUndo   = document.getElementById("undo");
const btnRedo   = document.getElementById("redo");
const btnSave   = document.getElementById("save");
const btnExport = document.getElementById("export");
const btnClear  = document.getElementById("clear");
const gridEl    = document.getElementById("grid");

// enable tooltips
[...document.querySelectorAll("[data-bs-toggle='tooltip']")]
  .forEach(el => new bootstrap.Tooltip(el));

// --- Swatches -------------------------------------------------------
const swatches = [...document.querySelectorAll(".swatch")];
function setSwatchActive(hex) {
  swatches.forEach(s => s.classList.toggle("active", s.dataset.color.toLowerCase() === hex.toLowerCase()));
}
swatches.forEach(s => {
  s.addEventListener("click", () => {
    color = s.dataset.color;
    colorEl.value = color;
    preview.style.background = color;
    setSwatchActive(color);
  });
});
setSwatchActive(color);

// --- Brush UI -------------------------------------------------------
sizeLbl.textContent = `${size} px`;
preview.style.background = color;
preview.style.width = preview.style.height = `${Math.max(8, Math.min(28, size))}px`;

sizeEl.oninput = (e) => {
  size = +e.target.value;
  sizeLbl.textContent = `${size} px`;
  const d = Math.max(8, Math.min(28, size));
  preview.style.width = preview.style.height = `${d}px`;
};

colorEl.oninput = (e) => {
  color = e.target.value;
  preview.style.background = color;
  setSwatchActive(color);
};

// --- Tools ----------------------------------------------------------
function setTool(next) {
  tool = next;
  btnPencil.classList.toggle("active", tool === "pencil");
  btnEraser.classList.toggle("active", tool === "eraser");
}
btnPencil.onclick = () => setTool("pencil");
btnEraser.onclick = () => setTool("eraser");

// --- Grid toggle ----------------------------------------------------
gridEl.onchange = (e) => {
  gridOn = e.target.checked;
  redraw();
};

// --- Undo/Redo/Clear ------------------------------------------------
btnUndo.onclick = () => { if (!strokes.length) return; undone.push(strokes.pop()); redraw(); };
btnRedo.onclick = () => { if (!undone.length) return; strokes.push(undone.pop()); redraw(); };
btnClear.onclick = () => {
  if (!strokes.length) return;
  if (confirm("Clear the canvas? This cannot be undone.")) {
    strokes = []; undone = []; redraw();
  }
};

// --- Drawing --------------------------------------------------------
function canvasPos(e) {
  const r = pad.getBoundingClientRect();
  const t = e.touches?.[0] || e;
  return { x: t.clientX - r.left, y: t.clientY - r.top };
}
function start(e){
  e.preventDefault();
  drawing = true; undone = [];
  const { x, y } = canvasPos(e);
  strokes.push({ tool, color, size, points: [{ x, y }] });
  redraw();
}
function move(e){
  if (!drawing) return;
  e.preventDefault();
  const { x, y } = canvasPos(e);
  const s = strokes[strokes.length - 1];
  s.points.push({ x, y });
  // incremental draw for performance
  drawStroke(s, s.points.length - 2);
}
function end(){ drawing = false; }

["mousedown","touchstart"].forEach(ev => pad.addEventListener(ev, start, { passive:false }));
["mousemove","touchmove"].forEach(ev => pad.addEventListener(ev, move,  { passive:false }));
["mouseup","mouseleave","touchend","touchcancel"].forEach(ev => pad.addEventListener(ev, end));

// --- Redraw ---------------------------------------------------------
function drawGrid() {
  const step = 25;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(0,0,0,.06)";
  for (let x = step; x < pad.width; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, pad.height); ctx.stroke();
  }
  for (let y = step; y < pad.height; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pad.width, y); ctx.stroke();
  }
  ctx.restore();
}

function drawStroke(s, startIndex = 0) {
  ctx.save();
  ctx.strokeStyle = (s.tool === "eraser") ? "#ffffff" : s.color;
  ctx.lineWidth = s.size;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  const pts = s.points;
  for (let i = Math.max(0, startIndex); i < pts.length; i++) {
    const p = pts[i];
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

function redraw() {
  ctx.clearRect(0, 0, pad.width, pad.height);
  if (gridOn) drawGrid();
  for (const s of strokes) drawStroke(s, 0);
}

// --- Load from Gallery ---------------------------------------------
(function bootFromStorage(){
  const raw = localStorage.getItem("butterfly.load");
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    strokes = obj.strokes || [];
    titleEl.value = obj.title || "Loaded drawing";
  } catch {}
  localStorage.removeItem("butterfly.load");
  redraw();
})();

// --- Save & Export --------------------------------------------------
btnSave.onclick = async () => {
  const title = titleEl.value || "Untitled";
  const json  = JSON.stringify({ width: pad.width, height: pad.height, title, strokes });
  const r = await fetch("/api/drawings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, json })
  });
  const out = await r.json();
  if (r.ok) toast(`Saved! ID=${out.id}`); else toast("Save error: " + out.error, true);
};

btnExport.onclick = () => {
  const url = pad.toDataURL("image/png");
  const a = document.createElement("a"); a.href = url; a.download = "butterfly.png"; a.click();
};

// --- Keyboard shortcuts --------------------------------------------
document.addEventListener("keydown", (e) => {
  // prevent interfering with inputs
  if (["INPUT","TEXTAREA"].includes(document.activeElement.tagName)) return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault(); btnUndo.click();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
    e.preventDefault(); btnRedo.click();
  } else if (e.key.toLowerCase() === "p") {
    setTool("pencil");
  } else if (e.key.toLowerCase() === "e") {
    setTool("eraser");
  }
});

// --- Toast helper ---------------------------------------------------
function toast(msg, danger=false){
  const el = document.getElementById("toast");
  el.className = "toast align-items-center text-bg-" + (danger ? "danger" : "success");
  el.querySelector(".toast-body").textContent = msg;
  new bootstrap.Toast(el).show();
}
