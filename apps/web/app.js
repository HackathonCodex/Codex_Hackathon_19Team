const canvas = document.querySelector("#imageCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const fileInput = document.querySelector("#fileInput");
const sampleBtn = document.querySelector("#sampleBtn");
const detectBtn = document.querySelector("#detectBtn");
const applyBtn = document.querySelector("#applyBtn");
const verifyBtn = document.querySelector("#verifyBtn");
const downloadBtn = document.querySelector("#downloadBtn");
const agentMode = document.querySelector("#agentMode");
const replacementType = document.querySelector("#replacementType");
const intensity = document.querySelector("#intensity");
const selectAllBtn = document.querySelector("#selectAllBtn");
const preserveModeBtn = document.querySelector("#preserveModeBtn");
const clearBtn = document.querySelector("#clearBtn");
const candidateList = document.querySelector("#candidateList");
const candidateCount = document.querySelector("#candidateCount");
const statusText = document.querySelector("#statusText");
const agentBadge = document.querySelector("#agentBadge");
const agentPlan = document.querySelector("#agentPlan");
const resultTab = document.querySelector("#resultTab");
const originalTab = document.querySelector("#originalTab");

let originalImageData = null;
let resultImageData = null;
let sourceImage = null;
let sourceKind = "sample";
let candidates = [];
let showOriginal = false;
let drawing = false;
let startPoint = null;
let draftRect = null;
let latestPlans = [];
let preserveClickMode = false;

const typeLabels = {
  face: "다른 얼굴",
  store_sign: "가짜 간판",
  road_sign: "가짜 표지판",
  license_plate: "무효 번호판",
  landmark: "일반 배경",
};

const fakeNames = {
  store_sign: ["다온밥상", "하루정원", "온기식당", "소담면옥", "모아카페"],
  road_sign: ["해온로", "가람역", "서림길", "모래내", "새봄교차로"],
  license_plate: ["00가 0000", "12무 0000", "가 00나 0000", "99허 9999"],
};

function setStatus(message) {
  statusText.textContent = message;
}

function setAgent(message, badge = "agent") {
  agentBadge.textContent = badge;
  agentPlan.textContent = message;
}

function fitCanvasToImage(width, height) {
  const maxWidth = 1500;
  const maxHeight = 1000;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
}

function captureOriginal() {
  originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  resultImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function restoreResult() {
  if (resultImageData) {
    ctx.putImageData(resultImageData, 0, 0);
  }
}

function renderCanvas() {
  if (showOriginal && originalImageData) {
    ctx.putImageData(originalImageData, 0, 0);
  } else {
    restoreResult();
  }
  drawCandidateOverlays();
  if (draftRect) {
    drawRect(draftRect, "#c7922b", "새 영역");
  }
}

function setPreserveClickMode(enabled) {
  preserveClickMode = enabled;
  preserveModeBtn.classList.toggle("active", preserveClickMode);
  canvas.classList.toggle("preserve-mode", preserveClickMode);
  setStatus(
    preserveClickMode
      ? "유지할 마스크 영역을 이미지에서 클릭하세요. 다시 클릭하면 치환 대상으로 돌아갑니다."
      : "수동 영역을 드래그해 추가하거나 후보를 선택하세요.",
  );
}

function drawSampleScene() {
  sourceKind = "sample";
  fitCanvasToImage(1200, 760);

  const sky = ctx.createLinearGradient(0, 0, 0, 330);
  sky.addColorStop(0, "#a9c5cf");
  sky.addColorStop(1, "#e5d9bd");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#c8b891";
  ctx.fillRect(0, 490, canvas.width, 270);
  ctx.fillStyle = "#6b6f68";
  ctx.beginPath();
  ctx.moveTo(0, 650);
  ctx.lineTo(canvas.width, 590);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.closePath();
  ctx.fill();

  drawBuilding(60, 210, 310, 300, "#d9c7aa");
  drawBuilding(380, 170, 330, 340, "#bab8ad");
  drawBuilding(760, 230, 360, 280, "#c9b7a1");
  drawWindows(90, 245, 245, 3, 3);
  drawWindows(415, 210, 255, 3, 4);
  drawWindows(790, 270, 270, 4, 3);

  drawStoreSign(100, 335, 230, 72, "진미식당", "#a7412f", "#fff2d1");
  drawStoreSign(800, 350, 250, 66, "성수카페", "#185d61", "#f6efe1");
  drawRoadSign(470, 108, 270, 86, "강남역 2km", "테헤란로");
  drawPlate(555, 600, 118, 42, "52가 3108");
  drawPerson(230, 520, 1.0);
  drawPerson(705, 525, 0.78);
  drawCar(500, 570);

  captureOriginal();
  candidates = [];
  setStatus("샘플 이미지가 준비되었습니다. 후보 찾기를 누르세요.");
  renderCandidateList();
  renderCanvas();
}

function drawBuilding(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(x + w - 16, y + 12, 16, h - 12);
}

function drawWindows(x, y, w, cols, rows) {
  const gap = 18;
  const ww = (w - gap * (cols + 1)) / cols;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      ctx.fillStyle = row % 2 === 0 ? "#edf0e6" : "#b8d0cc";
      ctx.fillRect(x + gap + col * (ww + gap), y + gap + row * 48, ww, 28);
    }
  }
}

function drawStoreSign(x, y, w, h, text, bg, fg) {
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(x + 8, y + 8, w - 16, 10);
  ctx.fillStyle = fg;
  ctx.font = "700 36px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 2, w - 22);
}

function drawRoadSign(x, y, w, h, line1, line2) {
  ctx.fillStyle = "#315f4f";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#f6f1df";
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
  ctx.fillStyle = "#f6f1df";
  ctx.font = "700 27px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(line1, x + w / 2, y + 35, w - 28);
  ctx.font = "600 20px sans-serif";
  ctx.fillText(line2, x + w / 2, y + 64, w - 28);
}

function drawPlate(x, y, w, h, text) {
  ctx.fillStyle = "#f1f2ea";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = "#20231f";
  ctx.font = "700 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 1, w - 10);
}

function drawCar(x, y) {
  ctx.fillStyle = "#516474";
  ctx.beginPath();
  ctx.roundRect(x, y, 210, 80, 12);
  ctx.fill();
  ctx.fillStyle = "#9bb2b7";
  ctx.fillRect(x + 52, y + 14, 72, 28);
  ctx.fillRect(x + 130, y + 14, 42, 28);
  ctx.fillStyle = "#1e2426";
  ctx.beginPath();
  ctx.arc(x + 50, y + 78, 22, 0, Math.PI * 2);
  ctx.arc(x + 162, y + 78, 22, 0, Math.PI * 2);
  ctx.fill();
}

function drawPerson(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#2f4b5f";
  ctx.fillRect(-18, 50, 36, 82);
  ctx.fillStyle = "#705039";
  ctx.beginPath();
  ctx.arc(0, 22, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a2019";
  ctx.beginPath();
  ctx.arc(0, 10, 25, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}

function addSampleCandidates() {
  candidates = [
    makeCandidate("face", 206, 497, 48, 48, "선명한 사람 얼굴"),
    makeCandidate("face", 687, 511, 38, 38, "배경 인물 얼굴"),
    makeCandidate("store_sign", 100, 335, 230, 72, "식당 상호 간판"),
    makeCandidate("store_sign", 800, 350, 250, 66, "카페 상호 간판"),
    makeCandidate("road_sign", 470, 108, 270, 86, "지명/도로 표지판"),
    makeCandidate("license_plate", 555, 600, 118, 42, "차량 번호판"),
  ];
  renderCandidateList();
  renderCanvas();
  setStatus("후보를 찾았습니다. 필요한 항목만 선택해서 치환하세요.");
  setAgent("로컬 샘플 후보를 만들었습니다. Agent 서버가 켜져 있으면 실제 이미지 분석과 프롬프트 계획을 요청할 수 있습니다.", "local");
}

function makeCandidate(type, x, y, w, h, reason) {
  return {
    id: `${type}_${crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random()}`,
    type,
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
    reason,
    selected: true,
  };
}

function renderCandidateList() {
  candidateCount.textContent = String(candidates.length);
  candidateList.innerHTML = "";
  candidates.forEach((candidate, index) => {
    const item = document.createElement("li");
    item.className = "candidate";
    item.classList.toggle("preserved", !candidate.selected);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = candidate.selected;
    checkbox.addEventListener("change", () => {
      candidate.selected = checkbox.checked;
      renderCandidateList();
      renderCanvas();
    });

    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${index + 1}. ${typeLabels[candidate.type]}`;
    const meta = document.createElement("span");
    const risk = candidate.risk ? ` · ${candidate.risk}` : "";
    const plan = candidate.plan?.replacementText ? ` → ${candidate.plan.replacementText}` : "";
    meta.textContent = `${candidate.reason}${risk}${plan} · ${candidate.w}x${candidate.h}`;
    body.append(title, meta);
    const state = document.createElement("span");
    state.className = "candidate-state";
    state.textContent = candidate.selected ? "치환" : "유지";
    item.append(checkbox, body, state);
    candidateList.append(item);
  });
}

function drawCandidateOverlays() {
  candidates.forEach((candidate) => {
    const label = candidate.selected ? typeLabels[candidate.type] : `유지: ${typeLabels[candidate.type]}`;
    drawRect(candidate, candidate.selected ? "#146c68" : "#c7922b", label);
  });
}

function drawRect(rect, color, label) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.92;
  ctx.fillRect(rect.x, Math.max(0, rect.y - 25), Math.min(150, rect.w + 20), 23);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff";
  ctx.font = "700 12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, rect.x + 8, Math.max(12, rect.y - 13), Math.min(132, rect.w));
  ctx.restore();
}

async function applySelectedReplacements() {
  if (!resultImageData) return;
  if (agentMode.value !== "local") {
    const aiResult = await requestAgentReplacement();
    if (aiResult) return;
    if (agentMode.value === "plan") return;
  }
  ctx.putImageData(resultImageData, 0, 0);
  candidates.filter((candidate) => candidate.selected).forEach((candidate) => {
    replaceCandidate(candidate);
  });
  resultImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  showOriginal = false;
  syncTabs();
  renderCanvas();
  setStatus("선택한 식별 단서를 자연 치환했습니다.");
}

function replaceCandidate(candidate) {
  const pad = Number(intensity.value) * 4;
  const rect = clampRect({
    x: candidate.x - pad,
    y: candidate.y - pad,
    w: candidate.w + pad * 2,
    h: candidate.h + pad * 2,
  });
  softenPatch(rect);
  if (candidate.type === "face") drawGeneratedFace(rect);
  if (candidate.type === "store_sign") drawGeneratedStoreSign(rect);
  if (candidate.type === "road_sign") drawGeneratedRoadSign(rect);
  if (candidate.type === "license_plate") drawGeneratedPlate(rect);
  if (candidate.type === "landmark") drawBackgroundTexture(rect);
}

function clampRect(rect) {
  const x = Math.max(0, Math.min(canvas.width - 1, rect.x));
  const y = Math.max(0, Math.min(canvas.height - 1, rect.y));
  const w = Math.max(8, Math.min(canvas.width - x, rect.w));
  const h = Math.max(8, Math.min(canvas.height - y, rect.h));
  return { x, y, w, h };
}

function sampleAverage(rect) {
  const sx = Math.max(0, Math.floor(rect.x - 8));
  const sy = Math.max(0, Math.floor(rect.y - 8));
  const sw = Math.min(canvas.width - sx, Math.floor(rect.w + 16));
  const sh = Math.min(canvas.height - sy, Math.floor(rect.h + 16));
  const data = ctx.getImageData(sx, sy, sw, sh).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 16) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    count += 1;
  }
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

function rgb(color, alpha = 1) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function softenPatch(rect) {
  const avg = sampleAverage(rect);
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  gradient.addColorStop(0, rgb(lighten(avg, 18), 0.98));
  gradient.addColorStop(1, rgb(darken(avg, 18), 0.98));
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 45; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? "#fff" : "#111";
    ctx.fillRect(
      rect.x + Math.random() * rect.w,
      rect.y + Math.random() * rect.h,
      1 + Math.random() * 2,
      1 + Math.random() * 2,
    );
  }
  ctx.restore();
}

function lighten(color, amount) {
  return {
    r: Math.min(255, color.r + amount),
    g: Math.min(255, color.g + amount),
    b: Math.min(255, color.b + amount),
  };
}

function darken(color, amount) {
  return {
    r: Math.max(0, color.r - amount),
    g: Math.max(0, color.g - amount),
    b: Math.max(0, color.b - amount),
  };
}

function drawGeneratedFace(rect) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const size = Math.min(rect.w, rect.h);
  const skin = [{ r: 190, g: 133, b: 96 }, { r: 222, g: 170, b: 128 }, { r: 138, g: 91, b: 66 }][
    Math.floor(Math.random() * 3)
  ];
  ctx.save();
  ctx.fillStyle = "rgba(30, 24, 20, 0.34)";
  ctx.beginPath();
  ctx.ellipse(cx, cy - size * 0.16, size * 0.48, size * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgb(skin);
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.38, size * 0.43, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(55, 35, 24, 0.95)";
  ctx.beginPath();
  ctx.ellipse(cx, cy - size * 0.26, size * 0.42, size * 0.19, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#241b17";
  ctx.beginPath();
  ctx.arc(cx - size * 0.13, cy - size * 0.02, Math.max(1.5, size * 0.025), 0, Math.PI * 2);
  ctx.arc(cx + size * 0.13, cy - size * 0.02, Math.max(1.5, size * 0.025), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(92, 45, 44, 0.75)";
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.14, size * 0.12, 0.12, Math.PI - 0.12);
  ctx.stroke();
  ctx.restore();
}

function drawGeneratedStoreSign(rect) {
  const palettes = [
    ["#7e3f2f", "#fff5da"],
    ["#164f55", "#f8f2dc"],
    ["#496033", "#fff3cf"],
    ["#7b6530", "#fff8e8"],
  ];
  const [bg, fg] = palettes[Math.floor(Math.random() * palettes.length)];
  const text = pick(fakeNames.store_sign);
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(rect.x + 8, rect.y + 7, Math.max(8, rect.w - 16), Math.max(5, rect.h * 0.16));
  ctx.fillStyle = fg;
  ctx.font = `700 ${Math.max(16, Math.min(38, rect.h * 0.48))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2 + 2, rect.w - 16);
  addEdgeBlend(rect);
  ctx.restore();
}

function drawGeneratedRoadSign(rect) {
  const text1 = pick(fakeNames.road_sign);
  const text2 = `${Math.ceil(Math.random() * 4)}km`;
  ctx.save();
  ctx.fillStyle = Math.random() > 0.35 ? "#295d51" : "#2f5d82";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = "#f3f2e5";
  ctx.lineWidth = Math.max(2, rect.h * 0.05);
  ctx.strokeRect(rect.x + 6, rect.y + 6, rect.w - 12, rect.h - 12);
  ctx.fillStyle = "#f3f2e5";
  ctx.font = `700 ${Math.max(14, Math.min(30, rect.h * 0.34))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${text1} ${text2}`, rect.x + rect.w / 2, rect.y + rect.h * 0.42, rect.w - 18);
  ctx.font = `600 ${Math.max(11, Math.min(20, rect.h * 0.23))}px sans-serif`;
  ctx.fillText(pick(fakeNames.road_sign), rect.x + rect.w / 2, rect.y + rect.h * 0.72, rect.w - 18);
  addEdgeBlend(rect);
  ctx.restore();
}

function drawGeneratedPlate(rect) {
  ctx.save();
  ctx.fillStyle = "#f5f5ef";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = "#313631";
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  ctx.fillStyle = "#222";
  ctx.font = `700 ${Math.max(12, Math.min(24, rect.h * 0.48))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(pick(fakeNames.license_plate), rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w - 8);
  addEdgeBlend(rect);
  ctx.restore();
}

function drawBackgroundTexture(rect) {
  const avg = sampleAverage(rect);
  ctx.save();
  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  gradient.addColorStop(0, rgb(lighten(avg, 22)));
  gradient.addColorStop(1, rgb(darken(avg, 14)));
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#fff";
  for (let i = 0; i < 5; i += 1) {
    ctx.beginPath();
    ctx.moveTo(rect.x + Math.random() * rect.w, rect.y);
    ctx.lineTo(rect.x + Math.random() * rect.w, rect.y + rect.h);
    ctx.stroke();
  }
  ctx.restore();
}

function addEdgeBlend(rect) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 4;
  ctx.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 5, rect.y + 5, rect.w - 10, rect.h - 10);
  ctx.restore();
}

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function loadFile(file) {
  const image = new Image();
  image.onload = () => {
    sourceKind = "upload";
    sourceImage = image;
    fitCanvasToImage(image.width, image.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    captureOriginal();
    candidates = [];
    showOriginal = false;
    syncTabs();
    renderCandidateList();
    renderCanvas();
    setStatus("이미지를 불러왔습니다. 직접 영역을 드래그하거나 후보 찾기를 누르세요.");
    setAgent("업로드 이미지가 준비되었습니다. Agent 분석을 누르면 RunPod/OpenAI 연결 상태에 따라 후보와 편집 프롬프트를 생성합니다.", "ready");
  };
  image.src = URL.createObjectURL(file);
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function addManualCandidate(rect) {
  const normalized = normalizeRect(rect);
  if (normalized.w < 12 || normalized.h < 12) return;
  candidates.push(
    makeCandidate(
      replacementType.value,
      normalized.x,
      normalized.y,
      normalized.w,
      normalized.h,
      "사용자 선택 영역",
    ),
  );
  renderCandidateList();
  setStatus("수동 치환 영역을 추가했습니다.");
}

function normalizeRect(rect) {
  const x = Math.min(rect.x, rect.x + rect.w);
  const y = Math.min(rect.y, rect.y + rect.h);
  const w = Math.abs(rect.w);
  const h = Math.abs(rect.h);
  return clampRect({ x, y, w, h });
}

function syncTabs() {
  originalTab.classList.toggle("active", showOriginal);
  resultTab.classList.toggle("active", !showOriginal);
}

function canvasDataUrl() {
  const overlayState = showOriginal;
  showOriginal = false;
  restoreResult();
  const url = canvas.toDataURL("image/png");
  showOriginal = overlayState;
  renderCanvas();
  return url;
}

function selectedCandidates() {
  return candidates.filter((candidate) => candidate.selected);
}

function preservedCandidates() {
  return candidates.filter((candidate) => !candidate.selected);
}

async function callAgent(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function requestAgentAnalysis() {
  if (agentMode.value === "local") {
    addSampleCandidates();
    return;
  }
  setStatus("Agent가 이미지 맥락과 식별 단서를 분석하고 있습니다.");
  setAgent("OpenAI vision/RunPod worker 연결을 시도합니다. 연결이 없으면 로컬 후보로 이어집니다.", "running");
  try {
    const data = await callAgent("/api/agent/analyze", {
      imageDataUrl: canvasDataUrl(),
      width: canvas.width,
      height: canvas.height,
      sourceKind,
    });
    candidates = data.candidates.map((candidate) => ({
      ...candidate,
      id: candidate.id || `${candidate.type}_${crypto.randomUUID()}`,
      x: Math.round(candidate.x),
      y: Math.round(candidate.y),
      w: Math.round(candidate.w),
      h: Math.round(candidate.h),
      selected: candidate.selected !== false,
    }));
    latestPlans = data.editPlans || [];
    attachPlansToCandidates(latestPlans);
    renderCandidateList();
    renderCanvas();
    setStatus(`${candidates.length}개 후보를 찾았습니다. 유지 클릭을 켠 뒤 바꾸지 않을 마스크를 클릭하세요.`);
    setAgent(formatAgentOutput(data), data.provider || "agent");
  } catch (error) {
    if (sourceKind === "sample") {
      addSampleCandidates();
    }
    setStatus("Agent 서버 연결이 없어 로컬 데모 후보를 사용합니다.");
    setAgent(`서버 모드로 실행하면 실제 Agent 분석을 사용할 수 있습니다.\n\n${error.message}`, "offline");
  }
}

async function requestAgentReplacement() {
  const targets = selectedCandidates();
  if (!targets.length) {
    setStatus("선택된 치환 후보가 없습니다.");
    return true;
  }
  setStatus("Agent가 후보별 편집 프롬프트와 마스크를 준비하고 있습니다.");
  setAgent("선택 영역의 이미지 분위기, 조명, 거리감에 맞춘 치환 계획을 생성합니다.", "planning");
  const masks = targets.map((candidate) => ({
    id: candidate.id,
    maskDataUrl: createMaskDataUrl(candidate),
  }));
  try {
    const data = await callAgent("/api/agent/replace", {
      imageDataUrl: canvasDataUrl(),
      width: canvas.width,
      height: canvas.height,
      candidates: targets,
      preservedCandidates: preservedCandidates(),
      masks,
      mode: agentMode.value,
    });
    latestPlans = data.editPlans || [];
    attachPlansToCandidates(latestPlans);
    setAgent(formatAgentOutput(data), data.provider || "agent");
    if (data.resultImageDataUrl) {
      await loadResultDataUrl(data.resultImageDataUrl);
      setStatus("OpenAI 이미지 편집 결과를 적용했습니다.");
      return true;
    }
    if (data.editPlans?.length) {
      setStatus("Agent 계획을 만들었습니다. 현재는 로컬 치환으로 미리보기를 적용합니다.");
      applyPlannedLocalReplacements(data.editPlans);
      return true;
    }
  } catch (error) {
    setAgent(`AI 치환 호출에 실패했습니다. 로컬 자연 치환으로 계속합니다.\n\n${error.message}`, "fallback");
    setStatus("AI 치환이 실패해 로컬 치환을 적용합니다.");
  }
  return false;
}

async function requestAgentVerification() {
  setStatus("Agent가 결과 이미지에 식별 단서가 남았는지 검수하고 있습니다.");
  try {
    const data = await callAgent("/api/agent/verify", {
      originalImageDataUrl: originalImageData ? imageDataToDataUrl(originalImageData) : null,
      resultImageDataUrl: canvasDataUrl(),
      candidates,
      editPlans: latestPlans,
    });
    setAgent(formatAgentOutput(data), data.provider || "verify");
    setStatus(data.verdict || "검수가 끝났습니다.");
  } catch (error) {
    setAgent(`서버 검수 대신 로컬 상태를 표시합니다.\n\n선택 후보 ${selectedCandidates().length}개가 치환 대상으로 처리되었습니다.\n${error.message}`, "offline");
    setStatus("로컬 검수 결과를 표시했습니다.");
  }
}

function attachPlansToCandidates(plans) {
  const planById = new Map(plans.map((plan) => [plan.targetId, plan]));
  candidates.forEach((candidate) => {
    candidate.plan = planById.get(candidate.id) || candidate.plan;
  });
  renderCandidateList();
}

function applyPlannedLocalReplacements(plans) {
  plans.forEach((plan) => {
    const candidate = candidates.find((item) => item.id === plan.targetId);
    if (candidate) candidate.plan = plan;
  });
  applyLocalReplacementNow();
}

function applyLocalReplacementNow() {
  ctx.putImageData(resultImageData, 0, 0);
  selectedCandidates().forEach((candidate) => replaceCandidate(candidate));
  resultImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  showOriginal = false;
  syncTabs();
  renderCanvas();
}

function createMaskDataUrl(candidate) {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvas.width;
  maskCanvas.height = canvas.height;
  const maskCtx = maskCanvas.getContext("2d");
  maskCtx.fillStyle = "rgba(0,0,0,1)";
  maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
  const pad = Number(intensity.value) * 4;
  const rect = clampRect({
    x: candidate.x - pad,
    y: candidate.y - pad,
    w: candidate.w + pad * 2,
    h: candidate.h + pad * 2,
  });
  maskCtx.globalCompositeOperation = "destination-out";
  if (candidate.type === "face") {
    maskCtx.beginPath();
    maskCtx.ellipse(
      rect.x + rect.w / 2,
      rect.y + rect.h / 2,
      rect.w * 0.56,
      rect.h * 0.62,
      0,
      0,
      Math.PI * 2,
    );
    maskCtx.fill();
  } else if (candidate.type === "license_plate") {
    roundedMaskCutout(maskCtx, rect, Math.min(10, rect.h * 0.18));
  } else {
    roundedMaskCutout(maskCtx, rect, Math.min(16, rect.h * 0.12));
  }
  return maskCanvas.toDataURL("image/png");
}

function candidateAtPoint(point) {
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (
      point.x >= candidate.x &&
      point.x <= candidate.x + candidate.w &&
      point.y >= candidate.y &&
      point.y <= candidate.y + candidate.h
    ) {
      return candidate;
    }
  }
  return null;
}

function togglePreserveCandidate(candidate) {
  candidate.selected = !candidate.selected;
  renderCandidateList();
  renderCanvas();
  const state = candidate.selected ? "치환 대상" : "유지 대상";
  setStatus(`${typeLabels[candidate.type] || candidate.type} 영역을 ${state}으로 표시했습니다.`);
}

function roundedMaskCutout(maskCtx, rect, radius) {
  const r = Math.max(0, Math.min(radius, rect.w / 2, rect.h / 2));
  maskCtx.beginPath();
  maskCtx.moveTo(rect.x + r, rect.y);
  maskCtx.lineTo(rect.x + rect.w - r, rect.y);
  maskCtx.quadraticCurveTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + r);
  maskCtx.lineTo(rect.x + rect.w, rect.y + rect.h - r);
  maskCtx.quadraticCurveTo(rect.x + rect.w, rect.y + rect.h, rect.x + rect.w - r, rect.y + rect.h);
  maskCtx.lineTo(rect.x + r, rect.y + rect.h);
  maskCtx.quadraticCurveTo(rect.x, rect.y + rect.h, rect.x, rect.y + rect.h - r);
  maskCtx.lineTo(rect.x, rect.y + r);
  maskCtx.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y);
  maskCtx.fill();
}

function imageDataToDataUrl(imageData) {
  const temp = document.createElement("canvas");
  temp.width = imageData.width;
  temp.height = imageData.height;
  temp.getContext("2d").putImageData(imageData, 0, 0);
  return temp.toDataURL("image/png");
}

function loadResultDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resultImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      showOriginal = false;
      syncTabs();
      renderCanvas();
      resolve();
    };
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function formatAgentOutput(data) {
  const parts = [];
  if (data.summary) parts.push(data.summary);
  if (data.scene) parts.push(`Scene: ${data.scene}`);
  if (data.verdict) parts.push(`Verdict: ${data.verdict}`);
  if (data.candidates?.length) {
    parts.push(
      data.candidates
        .slice(0, 8)
        .map((candidate, index) => `${index + 1}. ${typeLabels[candidate.type] || candidate.type}: ${candidate.reason || "식별 단서 후보"}`)
        .join("\n"),
    );
  }
  if (data.editPlans?.length) {
    parts.push(
      data.editPlans
        .slice(0, 6)
        .map((plan, index) => `${index + 1}. ${plan.targetId}\n${plan.editPrompt}`)
        .join("\n\n"),
    );
  }
  if (data.remainingRisks?.length) {
    parts.push(`Remaining risks:\n${data.remainingRisks.join("\n")}`);
  }
  return parts.filter(Boolean).join("\n\n") || "Agent 응답이 비어 있습니다.";
}

fileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) loadFile(file);
});

sampleBtn.addEventListener("click", drawSampleScene);

detectBtn.addEventListener("click", requestAgentAnalysis);

applyBtn.addEventListener("click", applySelectedReplacements);

verifyBtn.addEventListener("click", requestAgentVerification);

downloadBtn.addEventListener("click", () => {
  restoreResult();
  const link = document.createElement("a");
  link.download = "context-replaced-image.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
  renderCanvas();
});

selectAllBtn.addEventListener("click", () => {
  candidates.forEach((candidate) => {
    candidate.selected = true;
  });
  renderCandidateList();
  renderCanvas();
  setStatus("모든 후보를 치환 대상으로 되돌렸습니다.");
});

preserveModeBtn.addEventListener("click", () => {
  setPreserveClickMode(!preserveClickMode);
});

clearBtn.addEventListener("click", () => {
  if (originalImageData) {
    ctx.putImageData(originalImageData, 0, 0);
    resultImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  candidates = [];
  showOriginal = false;
  setPreserveClickMode(false);
  syncTabs();
  renderCandidateList();
  renderCanvas();
  setStatus("작업을 초기화했습니다.");
});

resultTab.addEventListener("click", () => {
  showOriginal = false;
  syncTabs();
  renderCanvas();
});

originalTab.addEventListener("click", () => {
  showOriginal = true;
  syncTabs();
  renderCanvas();
});

canvas.addEventListener("pointerdown", (event) => {
  if (preserveClickMode) {
    const candidate = candidateAtPoint(getCanvasPoint(event));
    if (candidate) {
      togglePreserveCandidate(candidate);
    } else {
      setStatus("클릭한 위치에 후보 마스크가 없습니다.");
    }
    return;
  }
  drawing = true;
  startPoint = getCanvasPoint(event);
  draftRect = { x: startPoint.x, y: startPoint.y, w: 0, h: 0 };
});

canvas.addEventListener("pointermove", (event) => {
  if (!drawing || !startPoint) return;
  const point = getCanvasPoint(event);
  draftRect = { x: startPoint.x, y: startPoint.y, w: point.x - startPoint.x, h: point.y - startPoint.y };
  renderCanvas();
});

canvas.addEventListener("pointerup", () => {
  if (!drawing || !draftRect) return;
  drawing = false;
  addManualCandidate(draftRect);
  draftRect = null;
  renderCanvas();
});

canvas.addEventListener("pointerleave", () => {
  if (drawing && draftRect) {
    drawing = false;
    addManualCandidate(draftRect);
    draftRect = null;
    renderCanvas();
  }
});

drawSampleScene();
