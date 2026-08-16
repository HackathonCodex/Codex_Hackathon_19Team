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
let candidates = [];
let showOriginal = false;
let drawing = false;
let startPoint = null;
let draftRect = null;
let preserveClickMode = false;

const typeLabels = {
  face: "얼굴",
  store_sign: "간판",
  road_sign: "도로 표지판",
  license_plate: "차량 번호판",
  landmark: "위치 단서",
};

function setStatus(message) {
  statusText.textContent = message;
}

function setAgent(message, badge = "cv") {
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
  setAgent("로컬 샘플 후보를 만들었습니다. CV API 분석을 선택하면 서버에 분석을 요청합니다.", "local");
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
    meta.textContent = `${candidate.reason}${risk} · ${candidate.w}x${candidate.h}`;
    body.append(title, meta);
    const state = document.createElement("span");
    state.className = "candidate-state";
    state.textContent = candidate.selected ? "가리기" : "유지";
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
  ctx.putImageData(resultImageData, 0, 0);
  candidates.filter((candidate) => candidate.selected).forEach((candidate) => {
    replaceCandidate(candidate);
  });
  resultImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  showOriginal = false;
  syncTabs();
  renderCanvas();
  setStatus("선택한 영역을 가렸습니다. 원본 탭에서 다시 확인할 수 있습니다.");
}

function replaceCandidate(candidate) {
  const pad = Number(intensity.value) * 4;
  const rect = clampRect({
    x: candidate.x - pad,
    y: candidate.y - pad,
    w: candidate.w + pad * 2,
    h: candidate.h + pad * 2,
  });
  const patch = document.createElement("canvas");
  patch.width = rect.w;
  patch.height = rect.h;
  patch.getContext("2d").drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  ctx.save();
  ctx.filter = `blur(${Math.max(8, Number(intensity.value) * 7)}px)`;
  ctx.drawImage(patch, rect.x, rect.y);
  ctx.restore();
}

function clampRect(rect) {
  const x = Math.max(0, Math.min(canvas.width - 1, rect.x));
  const y = Math.max(0, Math.min(canvas.height - 1, rect.y));
  const w = Math.max(8, Math.min(canvas.width - x, rect.w));
  const h = Math.max(8, Math.min(canvas.height - y, rect.h));
  return { x, y, w, h };
}

function loadFile(file) {
  const image = new Image();
  image.onload = () => {
    fitCanvasToImage(image.width, image.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    captureOriginal();
    candidates = [];
    showOriginal = false;
    syncTabs();
    renderCandidateList();
    renderCanvas();
    setStatus("이미지를 불러왔습니다. 직접 영역을 드래그하거나 AI 분석을 누르세요.");
    setAgent("업로드 이미지가 준비되었습니다. AI 분석을 누르면 CV 서비스가 후보를 찾습니다.", "ready");
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
  setStatus("AI가 이미지의 개인정보 단서를 분석하고 있습니다.");
  setAgent("CV 서비스에 이미지 분석을 요청했습니다.", "running");
  try {
    const data = await callAgent("/api/analyze", {
      imageDataUrl: canvasDataUrl(),
      width: canvas.width,
      height: canvas.height,
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
    renderCandidateList();
    renderCanvas();
    setStatus(
      candidates.length
        ? `${candidates.length}개 후보를 찾았습니다. 가릴 항목만 선택하세요.`
        : "탐지된 개인정보 단서가 없습니다.",
    );
    setAgent(formatAgentOutput(data), data.provider || "cv");
  } catch (error) {
    setStatus("CV 분석에 실패했습니다. 서버 연결을 확인해 주세요.");
    setAgent(`CV 서비스 오류\n\n${error.message}`, "offline");
  }
}

async function requestAgentVerification() {
  const selected = selectedCandidates().length;
  setAgent(`가리기 대상으로 선택된 항목: ${selected}개`, "review");
  setStatus(selected ? "선택한 항목을 가리거나, 원본 탭에서 다시 검토하세요." : "가릴 항목을 먼저 선택하세요.");
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
  const state = candidate.selected ? "가리기 대상" : "유지 대상";
  setStatus(`${typeLabels[candidate.type] || candidate.type} 영역을 ${state}으로 표시했습니다.`);
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
  return parts.filter(Boolean).join("\n\n") || "CV 응답이 비어 있습니다.";
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
