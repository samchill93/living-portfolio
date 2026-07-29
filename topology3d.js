/**
 * Deployment Topology — 3D layer (flag: topology3d)
 *
 * Where the system LIVES, as opposed to the Architecture X-Ray, which shows when
 * things happen during one request. This is space, not time: six real services and
 * the real edges between them, including the fan-out where a single push deploys two
 * separate clouds in parallel — the one thing a linear request trace cannot express.
 *
 * GOVERNING LAW — truth in animation. Verified against main.py and the deploy setup:
 *   - psycopg connects with os.environ["DATABASE_URL"]  (main.py:170)
 *   - endpoints are /health, /version, /inquiry, /chat
 *   - CORS_ORIGINS and RENDER_GIT_COMMIT are read from the environment
 *   - the Anthropic key is read server-side only; it is never sent to the browser
 *   - all six services and their edges are live in production, including the Neon
 *     write path (/inquiry validates, then stores a message and returns 201)
 *
 * Loaded lazily by index.html; never in the critical path.
 */
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const ACCENT = 0x5b8dff;
const GOLD = 0xffae4d;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (k) => k * k * (3 - 2 * k);
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);

/** Six real services. Nothing here is aspirational except where it says so. */
const NODES = [
  { id: "github",    label: "GitHub",        sub: "2 repos · source of truth",   pos: [  0.0,  6.5,  0.0] },
  { id: "vercel",    label: "Vercel",        sub: "static site · CDN",           pos: [-11.0,  1.0,  3.0] },
  { id: "render",    label: "Render",        sub: "FastAPI · Starter tier",      pos: [  9.5,  1.0, -3.0] },
  { id: "browser",   label: "Your browser",  sub: "no framework",                pos: [ -4.0, -5.5,  8.5] },
  { id: "anthropic", label: "Anthropic API", sub: "claude-haiku-4-5",            pos: [ 18.0,  2.5, -9.5] },
  { id: "neon",      label: "Neon Postgres", sub: "live · stores inquiries", pos: [ 14.5, -4.5,  1.5] },
];
const N = {}; NODES.forEach((n, i) => { N[n.id] = i; });

/** Every edge is a real connection in the running system, or explicitly pending. */
const EDGES = [
  { from: "github",  to: "vercel",    note: "push → build → CDN",      lift:  2.5 },
  { from: "github",  to: "render",    note: "push → build → container", lift: 2.5 },
  { from: "browser", to: "vercel",    note: "GET / — HTML, CSS, JS",   lift:  1.6 },
  { from: "browser", to: "render",    note: "POST /chat",              lift: -2.0 },
  { from: "render",  to: "anthropic", note: "messages.create()",       lift:  1.6 },
  { from: "render",  to: "neon",      note: "INSERT inquiry",          lift:  1.2 },
];
const E = {};
EDGES.forEach((e, i) => { E[e.from + ">" + e.to] = i; });

const ARIA = [
  "One push to GitHub deploys two separate clouds in parallel: Vercel rebuilds the site and Render rebuilds the API container.",
  "The browser loads the site itself from Vercel. It is plain HTML, CSS and JavaScript with no framework.",
  "The browser calls the API on Render, which calls Anthropic and returns a typed response carrying token counts and cost.",
  "The Anthropic key exists only in Render's environment. It is not in the repository, not on Vercel, and never reaches the browser.",
  "The inquiry endpoint validates with Pydantic, then writes to Neon Postgres — a valid message is stored and returns 201.",
];

function makeLabel(text, color, worldH, weight) {
  const mono = /[_{}[\]/:$()]/.test(text) || (/^[a-z0-9._-]+$/.test(text) && /[-._0-9]/.test(text));
  const el = document.createElement("div");
  el.className = "xr3d-label" + (mono ? " mono" : "");
  el.textContent = text;
  el.style.color = color;
  el.style.fontWeight = String(weight || 600);
  el.style.fontSize = Math.round(10 + ((worldH || 0.8) - 0.4) * 12) + "px";
  el.style.opacity = "0";
  const obj = new THREE.Object3D();
  obj.userData.el = el;
  let op = 0;
  Object.defineProperty(obj, "material", {
    value: { get opacity() { return op; }, set opacity(v) { op = v; el.style.opacity = String(v); } },
  });
  obj.userData.dispose = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  return obj;
}

export function init(mount, opts) {
  const onSelect = (opts && opts.onSelect) || function () {};
  const debug = !!(opts && opts.debug);
  const hint = mount.querySelector(".xr-hint");

  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", ARIA[0]);
  mount.appendChild(canvas);

  const labelLayer = document.createElement("div");
  labelLayer.className = "xr3d-labels";
  mount.appendChild(labelLayer);
  const labelEls = [];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0f18, 26, 92);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 260);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(6, 12, 14);
  scene.add(keyLight);
  const rim = new THREE.PointLight(ACCENT, 26, 60);
  rim.position.set(0, 4, 10);
  scene.add(rim);

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };
  const killLabel = (s) => {
    labelLayer.appendChild(s.userData.el);
    labelEls.push(s);
    disposables.push({ dispose: s.userData.dispose });
    return s;
  };

  const grid = new THREE.GridHelper(150, 50, 0x1d2740, 0x141c2c);
  grid.position.y = -9;
  grid.material.transparent = true;
  grid.material.opacity = 0.4;
  scene.add(grid);
  disposables.push({ dispose: () => { grid.geometry.dispose(); grid.material.dispose(); } });

  // --- Nodes ------------------------------------------------------------------
  const coreGeo = track(new THREE.IcosahedronGeometry(0.85, 1));
  const cageGeo = track(new THREE.IcosahedronGeometry(1.45, 0));
  const hitGeo = track(new THREE.SphereGeometry(2.2, 10, 6));
  const hitMat = track(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));

  const nodes = NODES.map((spec, i) => {
    const g = new THREE.Group();
    g.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);

    const coreMat = track(new THREE.MeshStandardMaterial({
      color: 0x18202f, emissive: spec.pending ? 0x2a3040 : 0x243049,
      emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.3,
    }));
    g.add(new THREE.Mesh(coreGeo, coreMat));

    const cageMat = track(new THREE.MeshBasicMaterial({
      color: 0x2f3d59, wireframe: true, transparent: true, opacity: spec.pending ? 0.3 : 0.5,
    }));
    const cage = new THREE.Mesh(cageGeo, cageMat);
    cage.rotation.set(0.5, i * 0.5, 0.2);      // set once; the camera reveals the rest
    g.add(cage);

    const label = killLabel(makeLabel(spec.label, spec.pending ? "#8b93a5" : "#eef1f7", 0.78));
    label.position.set(0, 2.4, 0);
    label.userData.prio = 5;   // permanent node labels win position; transient notes yield to them
    g.add(label);

    const sub = killLabel(makeLabel(spec.sub, spec.pending ? "#6f7787" : "#7d8ba6", 0.44));
    sub.position.set(0, 1.78, 0);
    sub.userData.prio = 4;
    g.add(sub);

    const hit = new THREE.Mesh(hitGeo, hitMat);
    g.add(hit);

    scene.add(g);
    return { g, coreMat, cageMat, label, sub, hit, pending: !!spec.pending };
  });
  const hitTargets = nodes.map((n) => n.hit);
  const posOf = (id) => nodes[N[id]].g.position;

  // --- Edges: arced tubes so overlapping runs stay readable --------------------
  const edges = EDGES.map((spec) => {
    const a = posOf(spec.from), b = posOf(spec.to);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += spec.lift;
    const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
    const geo = track(new THREE.TubeGeometry(curve, 48, 0.035, 6, false));
    const mat = track(new THREE.MeshBasicMaterial({ color: 0x2b3a56, transparent: true, opacity: 0.5 }));
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    const note = killLabel(makeLabel(spec.note, "#8fa4c8", 0.42));
    note.position.copy(curve.getPoint(0.5));
    note.userData.prio = 3;
    scene.add(note);

    return { curve, mat, note, pending: !!spec.pending };
  });
  const edgeAt = (fromId, toId) => edges[E[fromId + ">" + toId]];

  // --- Travelling packets (two, because Deploy fans out in parallel) -----------
  const pktGeo = track(new THREE.OctahedronGeometry(0.42, 0));
  const packets = [0, 1].map(() => {
    const m = track(new THREE.MeshStandardMaterial({
      color: 0xbcd4ff, emissive: ACCENT, emissiveIntensity: 1.6, roughness: 0.25,
      metalness: 0.45, transparent: true, opacity: 0,
    }));
    const mesh = new THREE.Mesh(pktGeo, m);
    scene.add(mesh);
    return mesh;
  });
  const ride = (p, edge, k, reverse) => {
    edge.curve.getPoint(reverse ? 1 - k : k, p.position);
    p.material.opacity = 1;
  };

  // --- The API key: one object, and it only ever sits on Render ----------------
  const keyMesh = new THREE.Mesh(
    track(new THREE.TorusKnotGeometry(0.26, 0.095, 56, 8)),
    track(new THREE.MeshStandardMaterial({
      color: 0xffd9a0, emissive: GOLD, emissiveIntensity: 1.3, roughness: 0.3,
      transparent: true, opacity: 0,
    })));
  scene.add(keyMesh);
  const keyLab = killLabel(makeLabel("ANTHROPIC_API_KEY", "#ffc98a", 0.44));
  keyLab.userData.prio = 3;
  scene.add(keyLab);

  // "no key here" markers for the three places the secret never reaches
  const absent = ["github", "vercel", "browser"].map((id) => {
    const l = killLabel(makeLabel("no key here", "#7ce0c0", 0.42));
    l.userData.prio = 3;
    const p = posOf(id);
    l.position.set(p.x, p.y - 1.6, p.z);
    scene.add(l);
    return l;
  });

  const pushLab = killLabel(makeLabel("git push", "#9fc0ff", 0.5, 700));
  pushLab.userData.prio = 3; scene.add(pushLab);
  const parallelLab = killLabel(makeLabel("both clouds rebuild in parallel", "#7ce0c0", 0.48, 700));
  parallelLab.userData.prio = 3; scene.add(parallelLab);
  const pendLab = killLabel(makeLabel("validated · stored (201)", "#7ce0c0", 0.48, 700));
  pendLab.userData.prio = 3; scene.add(pendLab);

  function resetActors() {
    packets.forEach((p) => { p.material.opacity = 0; });
    keyMesh.material.opacity = 0;
    keyLab.material.opacity = 0;
    absent.forEach((l) => { l.material.opacity = 0; });
    pushLab.material.opacity = 0;
    parallelLab.material.opacity = 0;
    pendLab.material.opacity = 0;
    edges.forEach((e) => { e.note.material.opacity = 0; });
  }

  /** Which edges each flow uses. Everything else dims, so the path is unambiguous. */
  const FLOW_EDGES = [
    ["github>vercel", "github>render"],
    ["browser>vercel"],
    ["browser>render", "render>anthropic"],
    ["render>anthropic"],
    ["browser>render", "render>neon"],
  ];

  const FLOW = [
    // 0 — Deploy: ONE push, TWO clouds, at the same time.
    function (t) {
      const p = (t % 6.0) / 6.0;
      const gh = posOf("github");
      pushLab.position.set(gh.x, gh.y + 3.2, gh.z);
      pushLab.material.opacity = p < 0.18 ? ease(seg(p, 0, 0.1)) : 1 - ease(seg(p, 0.7, 0.95));
      if (p >= 0.16) {
        const k = ease(seg(p, 0.16, 0.78));
        ride(packets[0], edgeAt("github", "vercel"), k);
        ride(packets[1], edgeAt("github", "render"), k);   // identical k: genuinely parallel
        packets.forEach((q) => { q.rotation.y = t * 1.6; q.material.opacity = 1; });
      }
      const done = seg(p, 0.72, 0.88);
      parallelLab.position.set(gh.x, gh.y - 2.6, gh.z);
      parallelLab.material.opacity = done * (1 - ease(seg(p, 0.94, 1)));
      edges.forEach((e, i) => { if (i < 2) e.note.material.opacity = ease(seg(p, 0.2, 0.4)); });
    },

    // 1 — Page load: the site itself comes from Vercel.
    function (t) {
      const p = (t % 4.6) / 4.6;
      const e = edgeAt("browser", "vercel");
      e.note.material.opacity = 1;
      if (p < 0.45) ride(packets[0], e, ease(p / 0.45));
      else ride(packets[0], e, 1 - ease(seg(p, 0.5, 1)));
      packets[0].rotation.y = t * 1.6;
    },

    // 2 — Chat: browser to Render to Anthropic and back. The key never moves.
    function (t) {
      const p = (t % 8.0) / 8.0;
      const toApi = edgeAt("browser", "render"), toClaude = edgeAt("render", "anthropic");
      toApi.note.material.opacity = 1; toClaude.note.material.opacity = 1;
      const r = posOf("render");
      keyMesh.position.set(r.x - 1.9, r.y - 1.5, r.z + 1.0);
      keyMesh.rotation.y = t * 1.1; keyMesh.rotation.x = t * 0.5;
      keyMesh.material.opacity = 0.95;
      keyLab.position.set(r.x - 1.9, r.y - 2.4, r.z + 1.0);
      keyLab.material.opacity = 0.9;

      if (p < 0.25) ride(packets[0], toApi, ease(p / 0.25));
      else if (p < 0.5) ride(packets[0], toClaude, ease(seg(p, 0.25, 0.5)));
      else if (p < 0.75) ride(packets[0], toClaude, 1 - ease(seg(p, 0.5, 0.75)));
      else ride(packets[0], toApi, 1 - ease(seg(p, 0.75, 1)));
      packets[0].rotation.y = t * 1.6;
    },

    // 3 — Where the key lives: present on Render, absent everywhere else.
    function (t) {
      const r = posOf("render");
      keyMesh.position.set(r.x, r.y - 2.2 + Math.sin(t * 1.6) * 0.12, r.z);
      keyMesh.rotation.y = t * 0.9; keyMesh.rotation.x = t * 0.45;
      keyMesh.material.opacity = 0.95;
      keyLab.position.set(r.x, r.y - 3.1, r.z);
      keyLab.material.opacity = 0.85 + Math.sin(t * 2.4) * 0.15;
      absent.forEach((l, i) => { l.material.opacity = 0.55 + Math.sin(t * 1.8 + i * 1.1) * 0.28; });
    },

    // 4 — Inquiry: validated by Pydantic, then stored in Neon (live).
    function (t) {
      const p = (t % 6.4) / 6.4;
      const toApi = edgeAt("browser", "render"), toDb = edgeAt("render", "neon");
      toApi.note.material.opacity = 0.85; toDb.note.material.opacity = 0.85;
      const nz = posOf("neon");
      pendLab.position.set(nz.x, nz.y - 1.9, nz.z);
      pendLab.material.opacity = 0.6 + Math.sin(t * 2.2) * 0.3;
      if (p < 0.45) ride(packets[0], toApi, ease(p / 0.45));
      else ride(packets[0], toDb, ease(seg(p, 0.5, 0.95)));
      packets[0].material.opacity = 1;
      packets[0].rotation.y = t * 1.6;
    },
  ];

  // --- State ------------------------------------------------------------------
  let flow = 0, running = false, visible = false, raf = 0, flowT = 0, paused = false;
  let yaw = 0, pitch = 0, dragging = false, lastX = 0, lastY = 0, hover = -1;
  const BASE_YAW = 0.42;
  const CENTER = new THREE.Vector3(3.5, 0.5, 0);
  const camTarget = new THREE.Vector3().copy(CENTER);
  const camPos = new THREE.Vector3();
  const clock = new THREE.Clock();

  function setFlow(i) {
    if (i == null || i < 0 || i >= FLOW.length || i === flow) return;
    flow = i; flowT = 0;
    canvas.setAttribute("aria-label", ARIA[i]);
    resetActors();
    if (paused) renderOnce();
  }

  // --- Interaction ------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(hitTargets, false);
    return hits.length ? hitTargets.indexOf(hits[0].object) : -1;
  }
  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} };
  const onMove = (e) => {
    if (dragging) {
      yaw += (e.clientX - lastX) * 0.006;
      pitch = clamp(pitch + (e.clientY - lastY) * 0.004, -0.3, 0.75);
      lastX = e.clientX; lastY = e.clientY;
      if (paused) renderOnce();
      return;
    }
    hover = pick(e);
    canvas.style.cursor = hover >= 0 ? "pointer" : "grab";
  };
  const onUp = (e) => { dragging = false; try { canvas.releasePointerCapture(e.pointerId); } catch (err) {} };
  // Clicking a service jumps to the first flow that actually uses it.
  const onClick = (e) => {
    const i = pick(e);
    if (i < 0) return;
    const id = NODES[i].id;
    for (let f = 0; f < FLOW_EDGES.length; f++) {
      if (FLOW_EDGES[f].some((k) => k.indexOf(id) >= 0)) { onSelect(f); return; }
    }
  };

  canvas.style.cursor = "grab";
  canvas.style.touchAction = "pan-y";
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", () => { dragging = false; hover = -1; });
  canvas.addEventListener("click", onClick);

  // --- Frame ------------------------------------------------------------------
  const AX_Y = new THREE.Vector3(0, 1, 0);
  const AX_X = new THREE.Vector3(1, 0, 0);
  const offset = new THREE.Vector3();
  const lv = new THREE.Vector3();
  let lw = 1, lh = 1;

  function shown(o) { let p = o; while (p) { if (p.visible === false) return false; p = p.parent; } return true; }

  const slots = [];
  let nSlots = 0;
  const slotAt = (i) => (slots[i] || (slots[i] = { el: null, w: 0, h: 0, x: 0, y: 0, prio: 1 }));

  function renderLabels() {
    nSlots = 0;
    for (let i = 0; i < labelEls.length; i++) {
      const o = labelEls[i], el = o.userData.el;
      if (o.material.opacity <= 0.004 || !shown(o)) { el.style.display = "none"; continue; }
      o.getWorldPosition(lv).project(camera);
      if (lv.z > 1 || lv.z < -1) { el.style.display = "none"; continue; }
      el.style.display = "";
      if (!o.userData.w) { o.userData.w = el.offsetWidth || 1; o.userData.h = el.offsetHeight || 1; }
      const s = slotAt(nSlots++);
      s.el = el; s.w = o.userData.w; s.h = o.userData.h;
      s.x = (lv.x * 0.5 + 0.5) * lw;
      s.y = (-lv.y * 0.5 + 0.5) * lh;
      s.prio = o.userData.prio === undefined ? 1 : o.userData.prio;
    }
    const order = slots.slice(0, nSlots).sort((a, b) => b.prio - a.prio);
    for (let i = 0; i < order.length; i++) {
      const s = order[i];
      for (let guard = 0; guard < 12; guard++) {
        let hit = null;
        for (let j = 0; j < i; j++) {
          const q = order[j];
          if (Math.abs(s.x - q.x) < (s.w + q.w) / 2 + 12 && Math.abs(s.y - q.y) < (s.h + q.h) / 2 + 6) { hit = q; break; }
        }
        if (!hit) break;
        s.y = hit.y + (s.y >= hit.y ? 1 : -1) * ((s.h + hit.h) / 2 + 7);
      }
      s.el.style.transform = "translate(-50%,-50%) translate(" + Math.round(s.x) + "px," + Math.round(s.y) + "px)";
    }
  }

  function draw(dt, t) {
    // The whole topology stays framed; only the viewer moves the camera.
    const idle = dragging ? 0 : Math.sin(t * 0.16) * 0.05;
    offset.set(0, 7.0 + Math.sin(t * 0.24) * 0.4, 34);
    offset.applyAxisAngle(AX_X, pitch);
    offset.applyAxisAngle(AX_Y, BASE_YAW + yaw + idle);
    camPos.copy(camTarget).add(offset);
    camera.position.lerp(camPos, 1 - Math.pow(0.002, dt));
    camera.lookAt(camTarget);

    const active = FLOW_EDGES[flow];
    edges.forEach((e, i) => {
      const on = active.indexOf(EDGES[i].from + ">" + EDGES[i].to) >= 0;
      e.mat.color.setHex(on ? (e.pending ? 0x7a5a52 : ACCENT) : 0x2b3a56);
      e.mat.opacity = on ? (e.pending ? 0.55 : 0.9) : 0.22;
    });

    nodes.forEach((n, i) => {
      const touched = active.some((k) => k.indexOf(NODES[i].id) >= 0);
      const hot = i === hover;
      n.coreMat.emissive.setHex(touched ? (n.pending ? 0x6a4a42 : ACCENT) : 0x243049);
      n.coreMat.emissiveIntensity = touched ? 1.35 : hot ? 0.95 : 0.55;
      n.cageMat.color.setHex(touched ? (n.pending ? 0x8a6a5a : ACCENT) : hot ? 0x46577d : 0x2f3d59);
      n.cageMat.opacity = touched ? 0.75 : n.pending ? 0.28 : 0.42;
      const d = camera.position.distanceTo(n.g.position);
      const o = clamp(1 - (d - 24) / 40, 0.1, 1);
      n.label.material.opacity = o;
      n.sub.material.opacity = o * 0.8;
    });

    resetActors();
    FLOW[flow](t);
    renderer.render(scene, camera);
    renderLabels();
  }

  let frames = 0, fpsMark = 0, fps = 0, quality = 2, lowStreak = 0;
  function applyQuality() {
    const cap = quality >= 2 ? 2 : quality === 1 ? 1.5 : 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    resize();
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    flowT += dt;
    try { draw(dt, flowT); } catch (err) {
      stop();
      if (hint) hint.textContent = "3D layer stopped: " + (err && err.message ? err.message : "error");
      console.error("[topology3d]", err);
      return;
    }
    frames++; fpsMark += dt;
    if (fpsMark >= 0.5) {
      fps = Math.round(frames / fpsMark);
      frames = 0; fpsMark = 0;
      if (fps < 45 && quality > 0) { if (++lowStreak >= 4) { quality--; lowStreak = 0; applyQuality(); } }
      else lowStreak = 0;
      if (debug && hint) hint.textContent = "drag to orbit · click a service · " + fps + " fps · q" + quality;
    }
    raf = requestAnimationFrame(frame);
  }

  function renderOnce() { try { draw(0.9, 2.2); } catch (err) { console.error("[topology3d]", err); } }
  function start() { if (running || paused) return; running = true; clock.getDelta(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  function resize() {
    const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
    lw = w; lh = h;
    labelEls.forEach((o) => { o.userData.w = 0; });
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!running) renderOnce();
  }

  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => { visible = e.isIntersecting; if (visible && !document.hidden) start(); else stop(); });
  }, { threshold: 0.05 });
  io.observe(mount);
  const onVis = () => { if (document.hidden || !visible) stop(); else start(); };
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(resize);
  ro.observe(mount);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "xr-3d-btn";
  const syncBtn = () => {
    btn.textContent = paused ? "Play" : "Pause";
    btn.setAttribute("aria-label", paused ? "Play the animation" : "Pause the animation");
  };
  btn.addEventListener("click", () => {
    paused = !paused; syncBtn();
    if (paused) { stop(); renderOnce(); } else { start(); }
  });
  syncBtn();
  mount.appendChild(btn);

  canvas.tabIndex = 0;
  canvas.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight Space");
  const onKey = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") onSelect(Math.min(FLOW.length - 1, flow + 1));
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") onSelect(Math.max(0, flow - 1));
    else if (e.key === " " || e.key === "Spacebar") btn.click();
    else return;
    e.preventDefault();
  };
  canvas.addEventListener("keydown", onKey);

  resize();
  visible = true;
  start();

  return {
    setStep: setFlow,
    destroy() {
      stop();
      io.disconnect(); ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("keydown", onKey);
      disposables.forEach((o) => { try { o.dispose(); } catch (e) {} });
      renderer.dispose();
      if (btn.parentNode) btn.parentNode.removeChild(btn);
      if (labelLayer.parentNode) labelLayer.parentNode.removeChild(labelLayer);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}
