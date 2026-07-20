/**
 * Architecture X-Ray — 3D layer (SHOWCASE 1.2, flag: xray3d)
 *
 * ONE continuous pipeline through real 3D space. Seven nodes on a curve with genuine
 * depth, an orbitable camera, and a request packet that travels the actual path.
 *
 * GOVERNING LAW — truth in animation. Each step animates the specific claims its own
 * card makes, and nothing else. Every claim below is in main.py or index.html:
 *   01 posts {messages:[...]}; the API key is NOT sent — it stays server-side
 *   02 hostname resolves, ClientHello/ServerHello, then the connection is encrypted
 *   03 uvicorn listens on $PORT; plain def handlers run in a threadpool, so one slow
 *      Claude call does not block the other requests
 *   04 CORSMiddleware admits the allowlisted origin and blocks a file:// desktop copy
 *   05 body parses into ChatRequest{messages: list[Message]}; malformed -> 422 and the
 *      handler never executes
 *   06 the server holds the key and sends the system prompt; tokens stream back
 *   07 ChatResponse carries reply + usage{input_tokens, output_tokens, cost_usd}
 *
 * Loaded lazily by index.html; never in the critical path.
 */
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const ACCENT = 0x5b8dff;
const SAFE = 0x7ce0c0;
const WARN = 0xff8a7a;
const BG = 0x0b0f18;

const STEPS = [
  { label: "Browser",            aria: "The conversation is posted as JSON. The API key is not included — it never leaves the server." },
  { label: "DNS + HTTPS",        aria: "The API hostname resolves, ClientHello and ServerHello are exchanged, and the connection is encrypted." },
  { label: "uvicorn",            aria: "uvicorn listens on the port. Plain def handlers run in a threadpool, so one slow call does not block other requests." },
  { label: "CORS gate",          aria: "The allowlisted origin is admitted; a file:// desktop copy is blocked." },
  { label: "FastAPI + Pydantic", aria: "The body parses into the typed ChatRequest model. A malformed body returns 422 and the handler never runs." },
  { label: "Claude API",         aria: "The server holds the API key and sends the system prompt, then tokens stream back." },
  { label: "Typed response",     aria: "ChatResponse returns the reply plus usage — input tokens, output tokens, and measured cost." },
];

/** Real depth: the pipeline sweeps through z, not along a flat line. */
const NODE_POS = [
  [-21.0,  0.4,  10.0],
  [-14.0,  1.5,   3.8],
  [ -7.0, -0.2,  -2.2],
  [  0.0,  1.1,  -6.4],
  [  7.0, -0.4,  -2.6],
  [ 14.0,  1.5,   4.0],
  [ 21.0,  0.1,   9.6],
];

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = (k) => k * k * (3 - 2 * k);
const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);   // sub-phase progress

/** Canvas-texture label. High-resolution texture, small in world units. */
function makeLabel(text, color, worldH, weight) {
  // Identifiers, paths and hostnames read as code; prose does not.
  const mono = /[_{}[\]/:$]/.test(text) || (/^[a-z0-9._-]+$/.test(text) && /[-._0-9]/.test(text));
  const el = document.createElement("div");
  el.className = "xr3d-label" + (mono ? " mono" : "");
  el.textContent = text;
  el.style.color = color;                                  // unchanged from the sprite
  el.style.fontWeight = String(weight || 600);
  el.style.fontSize = Math.round(10 + ((worldH || 0.8) - 0.4) * 12) + "px";
  el.style.opacity = "0";

  // A bare Object3D that carries a DOM node. Projected by hand each frame, which
  // avoids pulling in CSS2DRenderer and the import map its bare specifier needs.
  const obj = new THREE.Object3D();
  obj.userData.el = el;
  let op = 0;
  Object.defineProperty(obj, "material", {
    value: {
      get opacity() { return op; },
      set opacity(v) { op = v; el.style.opacity = String(v); },
    },
  });
  obj.userData.dispose = () => { if (el.parentNode) el.parentNode.removeChild(el); };
  return obj;
}

export function init(mount, opts) {
  // Reduced motion no longer blocks the loop — it just decides the initial state of a
  // control the viewer can always flip. A silent still frame is the worst of both.
  const reduced = !!(opts && opts.reducedMotion);
  const onSelect = (opts && opts.onSelect) || function () {};
  const debug = !!(opts && opts.debug);
  const hint = mount.querySelector(".xr-hint");

  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", STEPS[0].aria);
  mount.appendChild(canvas);

  const labelLayer = document.createElement("div");
  labelLayer.className = "xr3d-labels";
  mount.appendChild(labelLayer);
  const labelEls = [];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 15, 66);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(6, 10, 12);
  scene.add(key);
  const rim = new THREE.PointLight(ACCENT, 30, 40);
  scene.add(rim);

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };
  const killLabel = (s) => {
    labelLayer.appendChild(s.userData.el);
    labelEls.push(s);
    disposables.push({ dispose: s.userData.dispose });
    return s;
  };

  // --- Floor grid -------------------------------------------------------------
  const grid = new THREE.GridHelper(120, 60, 0x1d2740, 0x141c2c);
  grid.position.y = -5;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  scene.add(grid);
  disposables.push({ dispose: () => { grid.geometry.dispose(); grid.material.dispose(); } });

  // --- The pipeline curve -----------------------------------------------------
  const ctrl = NODE_POS.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(ctrl, false, "catmullrom", 0.5);
  const at = (i) => ctrl[i];
  const tOf = (i) => i / (STEPS.length - 1);

  const tubeGeo = track(new THREE.TubeGeometry(curve, 240, 0.045, 8, false));
  const tubeMat = track(new THREE.MeshBasicMaterial({ color: 0x30405f, transparent: true, opacity: 0.8 }));
  scene.add(new THREE.Mesh(tubeGeo, tubeMat));

  // --- Nodes: solid core + STATIC wireframe shell -----------------------------
  // The shell does not spin. Orbiting the camera is what reveals its other faces.
  const hitGeo = track(new THREE.SphereGeometry(1.6, 10, 6));
  const hitMat = track(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  const coreGeo = track(new THREE.IcosahedronGeometry(0.62, 1));
  const cageGeo = track(new THREE.IcosahedronGeometry(1.02, 0));
  const nodes = ctrl.map((p, i) => {
    const g = new THREE.Group();
    g.position.copy(p);

    const coreMat = track(new THREE.MeshStandardMaterial({
      color: 0x18202f, emissive: 0x243049, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.35,
    }));
    const core = new THREE.Mesh(coreGeo, coreMat);
    g.add(core);

    const cageMat = track(new THREE.MeshBasicMaterial({ color: 0x2f3d59, wireframe: true, transparent: true, opacity: 0.5 }));
    const cage = new THREE.Mesh(cageGeo, cageMat);
    cage.rotation.set(0.5, i * 0.4, 0.2);   // set once, then left alone
    g.add(cage);

    const label = killLabel(makeLabel(STEPS[i].label, "#eef1f7", 0.8));
    label.position.set(0, 2.15, 0);
    label.userData.prio = 2;                 // yields only to the active step's own labels
    g.add(label);

    const num = killLabel(makeLabel(String(i + 1).padStart(2, "0"), "#7d8ba6", 0.44, 700));
    num.position.set(0, 2.78, 0);
    num.userData.prio = 0;                   // decorative: first to be nudged aside
    g.add(num);

    scene.add(g);
    const hit = new THREE.Mesh(hitGeo, hitMat);   // invisible, generous click target
    g.add(hit);

    return { g, core, coreMat, cage, cageMat, label, num, hit };
  });

  // --- The request packet -----------------------------------------------------
  const packet = new THREE.Group();
  const pGeo = track(new THREE.OctahedronGeometry(0.34, 0));
  const pMat = track(new THREE.MeshStandardMaterial({
    color: 0xbcd4ff, emissive: ACCENT, emissiveIntensity: 1.7, roughness: 0.25, metalness: 0.5,
  }));
  packet.add(new THREE.Mesh(pGeo, pMat));
  const shellGeo = track(new THREE.IcosahedronGeometry(0.62, 0));
  const shellMat = track(new THREE.MeshBasicMaterial({ color: SAFE, wireframe: true, transparent: true, opacity: 0 }));
  packet.add(new THREE.Mesh(shellGeo, shellMat));
  scene.add(packet);

  // Motion trail. Additive points fading to black toward the tail, so the packet
  // reads as travelling rather than jumping between frames.
  const TRAIL = 44;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailCol = new Float32Array(TRAIL * 3);
  for (let i = 0; i < TRAIL; i++) {
    const k = (1 - i / TRAIL) * 0.85;
    trailCol[i * 3] = 0.36 * k; trailCol[i * 3 + 1] = 0.55 * k; trailCol[i * 3 + 2] = k;
  }
  const trailGeo = track(new THREE.BufferGeometry());
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
  const trailMat = track(new THREE.PointsMaterial({
    size: 0.17, vertexColors: true, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(new THREE.Points(trailGeo, trailMat));
  // Collapse the trail so a step change doesn't streak a line across the scene.
  function seedTrail(v) {
    for (let i = 0; i < TRAIL; i++) { trailPos[i * 3] = v.x; trailPos[i * 3 + 1] = v.y; trailPos[i * 3 + 2] = v.z; }
    trailGeo.attributes.position.needsUpdate = true;
  }
  seedTrail(ctrl[0]);

  const pulseGeo = track(new THREE.TorusGeometry(1, 0.018, 6, 44));
  const pulseMat = track(new THREE.MeshBasicMaterial({
    color: ACCENT, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
  scene.add(pulseRing);

  // --- (1) The connection pulse: energy flowing INTO the active node ----------
  const FLOW = 80;
  const flowArr = new Float32Array(FLOW * 3);
  const flowGeo = track(new THREE.BufferGeometry());
  flowGeo.setAttribute("position", new THREE.BufferAttribute(flowArr, 3));
  const flowMat = track(new THREE.PointsMaterial({
    color: ACCENT, size: 0.15, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true,
  }));
  const flowPts = new THREE.Points(flowGeo, flowMat);
  scene.add(flowPts);
  const originIn = new THREE.Vector3();          // where step 01's input comes from
  const flowV = new THREE.Vector3();             // hoisted: no per-frame allocation

  function updateFlow(t) {
    const to = step;
    const from = step - 1;
    const v = flowV;
    for (let i = 0; i < FLOW; i++) {
      const u = ((i / FLOW) + t * 0.3) % 1;
      const k = ease(u);
      if (from < 0) {
        originIn.set(at(0).x - 1.2, at(0).y - 4.4, at(0).z + 2.4);   // the person typing
        v.copy(originIn).lerp(at(0), k);
      } else {
        curve.getPoint(tOf(from) + k * (tOf(to) - tOf(from)), v);
      }
      const w = Math.sin(u * Math.PI) * 0.22;
      flowArr[i * 3]     = v.x;
      flowArr[i * 3 + 1] = v.y + Math.sin(u * 12 + i) * w;
      flowArr[i * 3 + 2] = v.z + Math.cos(u * 9 + i) * w;
    }
    flowGeo.attributes.position.needsUpdate = true;
    flowMat.opacity = 0.5 + Math.sin(t * 2.2) * 0.18;   // a breathing pulse, not a flat glow
  }

  // --- Shared actor factory ---------------------------------------------------
  const miniGeo = track(new THREE.BoxGeometry(0.3, 0.3, 0.3));
  const okMat = track(new THREE.MeshStandardMaterial({ color: 0x9fc0ff, emissive: ACCENT, emissiveIntensity: 1.1, roughness: 0.35, transparent: true, opacity: 0 }));
  const badMat = track(new THREE.MeshStandardMaterial({ color: 0xffb3a6, emissive: WARN, emissiveIntensity: 1.2, roughness: 0.35, transparent: true, opacity: 0 }));
  const mini = (m) => new THREE.Mesh(miniGeo, m);

  const groups = [];
  function stepGroup(i) {
    const g = new THREE.Group();
    g.visible = false;
    scene.add(g);
    const L = (text, color, h, w) => {
      const s = killLabel(makeLabel(text, color, h || 0.42, w || 600));
      s.userData.prio = 3;
      g.add(s); return s;
    };
    groups[i] = { g, L };
    return groups[i];
  }

  const P = [];   // per-step props

  // ===== 01 Browser: the conversation is packed; the API key is NOT sent ======
  {
    const { g, L } = stepGroup(0);
    const a = at(0);
    const msgs = [mini(okMat.clone()), mini(okMat.clone()), mini(okMat.clone())];
    msgs.forEach((m) => { track(m.material); g.add(m); });
    const json = L("{ messages: [...] }", "#9fc0ff", 0.46);
    const post = L("POST /chat", "#9fc0ff", 0.58, 700);
    const keyMesh = new THREE.Mesh(track(new THREE.TorusKnotGeometry(0.2, 0.075, 48, 8)),
      track(new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffae4d, emissiveIntensity: 1.3, roughness: 0.3, transparent: true, opacity: 0 })));
    g.add(keyMesh);
    const keyLab = L("API key — never sent", "#ffc98a", 0.44);
    P[0] = { update(t) {
      const p = (t % 5.4) / 5.4;
      shellMat.opacity = 0;
      keyMesh.position.set(a.x - 1.5, a.y - 1.5, a.z + 0.6);
      keyMesh.rotation.y = t * 1.1; keyMesh.rotation.x = t * 0.5;
      keyMesh.material.opacity = 0.95;
      keyLab.position.set(a.x - 1.5, a.y - 2.3, a.z + 0.6);
      keyLab.material.opacity = 0.9;

      if (p < 0.4) {                                   // three turns converge into one body
        const k = ease(seg(p, 0, 0.4));
        msgs.forEach((m, j) => {
          const ang = (j / 3) * Math.PI * 2;
          const r = (1 - k) * 2.6;
          m.position.set(a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r * 0.6, a.z + Math.sin(ang) * r * 0.5);
          m.material.opacity = 0.9 * (1 - k * 0.85);
          m.rotation.y = t + j;
        });
        packet.position.copy(a);
        packet.scale.setScalar(0.3 + k * 0.7);
        json.position.set(a.x, a.y + 1.05, a.z);
        json.material.opacity = seg(k, 0.55, 1);
        post.material.opacity = 0;
      } else if (p < 0.56) {                           // labelled with the real method + path
        msgs.forEach((m) => { m.material.opacity = 0; });
        packet.position.copy(a); packet.scale.setScalar(1);
        json.position.set(a.x, a.y + 1.05, a.z); json.material.opacity = 1;
        post.position.set(a.x, a.y + 1.75, a.z);
        post.material.opacity = ease(seg(p, 0.4, 0.56));
      } else {                                         // dispatched — the key stays behind
        const k = ease(seg(p, 0.56, 1));
        curve.getPoint(tOf(0) + k * (tOf(1) - tOf(0)), tmp);
        packet.position.copy(tmp); packet.scale.setScalar(1);
        json.position.set(tmp.x, tmp.y + 1.05, tmp.z); json.material.opacity = 1 - k;
        post.position.set(tmp.x, tmp.y + 1.72, tmp.z); post.material.opacity = 1 - k;
        keyLab.material.opacity = 0.9 + Math.sin(t * 4) * 0.1;
      }
    } };
  }

  // ===== 02 DNS + HTTPS: resolve, then a real two-way handshake ===============
  {
    const { g, L } = stepGroup(1);
    const a = at(1), b = at(2);
    const host = L("samuel-ai-api.onrender.com", "#8fa4c8", 0.44);
    const resolved = L("resolved → Render", "#9fc0ff", 0.44);
    const hello = mini(okMat.clone()); track(hello.material); g.add(hello);
    const helloA = L("ClientHello", "#9fc0ff", 0.44);
    const helloB = L("ServerHello + cert", "#7ce0c0", 0.44);
    const enc = L("encrypted", "#7ce0c0", 0.5, 700);
    const ringGeo = track(new THREE.TorusGeometry(0.9, 0.03, 8, 48));
    const ring = new THREE.Mesh(ringGeo, track(new THREE.MeshBasicMaterial({ color: SAFE, transparent: true, opacity: 0 })));
    g.add(ring);
    P[1] = { update(t) {
      const p = (t % 7.0) / 7.0;
      const mid = tmp.copy(a).lerp(b, 0.5);
      packet.position.copy(a); packet.scale.setScalar(1);
      host.position.set(a.x, a.y + 1.75, a.z);
      resolved.position.set(a.x, a.y + 1.05, a.z);
      ring.position.copy(a); ring.rotation.x = Math.PI / 2.4; ring.rotation.y = t * 0.5;

      if (p < 0.2) {                                   // name resolution
        host.material.opacity = 1;
        resolved.material.opacity = ease(seg(p, 0.1, 0.2));
        hello.material.opacity = 0; shellMat.opacity = 0;
      } else if (p < 0.42) {                           // ClientHello travels out
        const k = ease(seg(p, 0.2, 0.42));
        host.material.opacity = 1 - k * 0.6; resolved.material.opacity = 1 - k * 0.6;
        hello.position.copy(a).lerp(b, k * 0.5);
        hello.material.opacity = 1; hello.rotation.y = t * 2;
        helloA.position.copy(hello.position).setY(hello.position.y + 0.7);
        helloA.material.opacity = 1; helloB.material.opacity = 0;
      } else if (p < 0.64) {                           // ServerHello comes back
        const k = ease(seg(p, 0.42, 0.64));
        hello.position.copy(mid).lerp(a, k);
        hello.material.opacity = 1; hello.rotation.y = t * 2;
        helloA.material.opacity = 0;
        helloB.position.copy(hello.position).setY(hello.position.y + 0.7);
        helloB.material.opacity = 1;
      } else if (p < 0.8) {                            // keys agreed; the channel closes over
        const k = ease(seg(p, 0.64, 0.8));
        hello.material.opacity = 1 - k; helloB.material.opacity = 1 - k;
        ring.scale.setScalar(1.8 - k * 1.1);
        ring.material.opacity = Math.sin(k * Math.PI) * 0.95;
        shellMat.opacity = k * 0.9;
        enc.position.set(a.x, a.y + 1.05, a.z);
        enc.material.opacity = k;
      } else {                                         // encrypted from here on
        const k = ease(seg(p, 0.8, 1));
        curve.getPoint(tOf(1) + k * (tOf(2) - tOf(1)), tmp);
        packet.position.copy(tmp);
        shellMat.opacity = 0.9;
        enc.position.set(tmp.x, tmp.y + 1.15, tmp.z);
        enc.material.opacity = 1 - k;
        ring.material.opacity = 0;
        host.material.opacity = 0; resolved.material.opacity = 0;
      }
    } };
  }

  // ===== 03 uvicorn: listens on $PORT; a slow call does not block the others ==
  {
    const { g, L } = stepGroup(2);
    const a = at(2);
    const port = L(":$PORT listening", "#9fc0ff", 0.46);
    const pool = L("threadpool", "#8fa4c8", 0.44);
    const slow = L("slow Claude call — others keep flowing", "#7ce0c0", 0.44);
    const ear = new THREE.Mesh(track(new THREE.TorusGeometry(1.25, 0.025, 8, 48)),
      track(new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0 })));
    ear.rotation.x = Math.PI / 2;
    g.add(ear);
    // three worker lanes — plain def handlers are run in a threadpool
    const LANE_Z = [-1.5, 0, 1.5];
    const lanes = LANE_Z.map((dz) => {
      const geo = track(new THREE.BoxGeometry(5.2, 0.02, 0.02));
      const m = new THREE.Mesh(geo, track(new THREE.MeshBasicMaterial({ color: 0x2b3a56, transparent: true, opacity: 0 })));
      m.position.set(a.x, a.y - 0.1, a.z + dz);
      g.add(m);
      return m;
    });
    const others = [mini(okMat.clone()), mini(okMat.clone())];
    others.forEach((m) => { track(m.material); m.scale.setScalar(0.75); g.add(m); });
    P[2] = { update(t) {
      const p = (t % 6.4) / 6.4;
      shellMat.opacity = 0.9;
      ear.position.copy(a);
      ear.scale.setScalar(1 + Math.sin(t * 3) * 0.14);          // listening, continuously
      ear.material.opacity = 0.35 + Math.sin(t * 3) * 0.18;
      port.position.set(a.x, a.y + 1.75, a.z);
      port.material.opacity = 1;
      lanes.forEach((m) => { m.material.opacity = 0.75; });
      pool.position.set(a.x, a.y - 1.5, a.z);
      pool.material.opacity = 0.85;

      // The other two lanes never stop, whatever our request is doing.
      others.forEach((m, j) => {
        const u = ((t * 0.34) + j * 0.5) % 1;
        m.position.set(a.x - 2.6 + u * 5.2, a.y - 0.1, a.z + LANE_Z[j === 0 ? 0 : 2]);
        m.material.opacity = Math.sin(u * Math.PI) * 0.95;
        m.rotation.y = t * 1.6;
      });

      if (p < 0.2) {                                   // handed to a worker
        const k = ease(seg(p, 0, 0.2));
        packet.position.set(a.x - 2.6 + k * 2.6, a.y - 0.1, a.z + LANE_Z[1]);
        slow.material.opacity = 0;
      } else if (p < 0.76) {                           // it stalls here — waiting on Claude
        packet.position.set(a.x, a.y - 0.1 + Math.sin(t * 2) * 0.06, a.z + LANE_Z[1]);
        packet.scale.setScalar(1 + Math.sin(t * 2) * 0.05);
        slow.position.set(a.x, a.y - 2.35, a.z);
        slow.material.opacity = ease(seg(p, 0.2, 0.32));
      } else {                                         // resumes and moves on
        const k = ease(seg(p, 0.76, 1));
        packet.scale.setScalar(1);
        curve.getPoint(tOf(2) + k * (tOf(3) - tOf(2)), tmp);
        packet.position.copy(tmp);
        slow.material.opacity = 1 - k;
      }
    } };
  }

  // ===== 04 CORS gate: the allowlisted origin passes, a file:// copy is blocked
  {
    const { g, L } = stepGroup(3);
    const a = at(3);
    const gateGeo = track(new THREE.BoxGeometry(0.12, 1.5, 2.4));
    const gateMat = track(new THREE.MeshStandardMaterial({
      color: 0x1b2438, emissive: 0x2b3a5c, emissiveIntensity: 0.8, roughness: 0.5, transparent: true, opacity: 0,
    }));
    const gA = new THREE.Mesh(gateGeo, gateMat), gB = new THREE.Mesh(gateGeo, gateMat);
    g.add(gA); g.add(gB);
    const okOrigin = L("living-portfolio-chi.vercel.app", "#7ce0c0", 0.44);
    const okWord = L("allowed", "#7ce0c0", 0.5, 700);
    const badOrigin = L("file:// desktop copy", "#ff9d8c", 0.44);
    const badWord = L("blocked", "#ff9d8c", 0.5, 700);
    const intruder = mini(badMat.clone()); track(intruder.material); g.add(intruder);
    P[3] = { update(t) {
      const p = (t % 8.0) / 8.0;
      shellMat.opacity = 0.9;
      gA.position.set(a.x, a.y, a.z); gB.position.set(a.x, a.y, a.z);
      gateMat.opacity = 0.92;

      if (p < 0.42) {                                  // our origin is on the allowlist
        const k = seg(p, 0.06, 0.26);
        const open = ease(k) * 1.35;
        gA.position.y = a.y + 0.85 + open; gB.position.y = a.y - 0.85 - open;
        packet.position.copy(a).setZ(a.z + 2.2 * (1 - ease(seg(p, 0.1, 0.42))));
        okOrigin.position.set(a.x, a.y + 1.75, a.z);
        okOrigin.material.opacity = ease(seg(p, 0, 0.12));
        okWord.position.set(a.x, a.y - 1.9, a.z);
        okWord.material.opacity = ease(seg(p, 0.16, 0.3));
        intruder.material.opacity = 0;
        badOrigin.material.opacity = 0; badWord.material.opacity = 0;
      } else if (p < 0.78) {                           // a copy from somewhere else arrives
        gA.position.y = a.y + 0.85; gB.position.y = a.y - 0.85;   // stays shut
        okOrigin.material.opacity = 0; okWord.material.opacity = 0;
        packet.position.copy(a).setZ(a.z - 1.6);
        const k = seg(p, 0.42, 0.62), back = seg(p, 0.62, 0.78);
        const z = a.z + 3.4 - ease(k) * 2.6 + ease(back) * 3.0;
        intruder.position.set(a.x, a.y, z);
        intruder.material.opacity = 0.95;
        intruder.rotation.y = t * 2;
        badOrigin.position.set(a.x, a.y + 1.75, z);
        badOrigin.material.opacity = 0.95;
        badWord.position.set(a.x, a.y - 1.9, a.z);
        badWord.material.opacity = back > 0 ? 1 : ease(seg(p, 0.56, 0.64));
      } else {                                         // ours continues
        const k = ease(seg(p, 0.78, 1));
        gA.position.y = a.y + 0.85 + 1.35; gB.position.y = a.y - 0.85 - 1.35;
        curve.getPoint(tOf(3) + k * (tOf(4) - tOf(3)), tmp);
        packet.position.copy(tmp);
        intruder.material.opacity = 0;
        badOrigin.material.opacity = 0;
        badWord.material.opacity = 1 - k;
      }
    } };
  }

  // ===== 05 FastAPI + Pydantic: typed parse, and a 422 that never reaches the handler
  {
    const { g, L } = stepGroup(4);
    const a = at(4);
    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(2.3, 2.3, 2.3)),
      track(new THREE.MeshBasicMaterial({ color: 0x3d517a, wireframe: true, transparent: true, opacity: 0 })));
    g.add(frame);
    const f1 = mini(okMat.clone()), f2 = mini(okMat.clone());
    track(f1.material); track(f2.material); g.add(f1); g.add(f2);
    const l1 = L("role", "#9fc0ff", 0.4);
    const l2 = L("content", "#9fc0ff", 0.4);
    const model = L("ChatRequest", "#8fa4c8", 0.46);
    const valid = L("valid → handler runs", "#7ce0c0", 0.46);
    const bad = mini(badMat.clone()); track(bad.material); g.add(bad);
    const err = L("422 — handler never runs", "#ff9d8c", 0.48, 700);
    P[4] = { update(t) {
      const p = (t % 8.0) / 8.0;
      shellMat.opacity = 0.9;
      frame.position.copy(a);
      frame.rotation.y = t * 0.25;
      model.position.set(a.x, a.y + 1.75, a.z);

      if (p < 0.44) {                                  // unpacks into the model's real fields
        const k = ease(seg(p, 0.05, 0.34));
        frame.material.opacity = 0.5;
        frame.material.color.setHex(0x3d517a);
        model.material.opacity = 1;
        packet.position.copy(a);
        packet.scale.setScalar(1 - k * 0.5);
        f1.position.set(a.x, a.y + k * 0.95, a.z + k * 0.5);
        f2.position.set(a.x, a.y - k * 0.95, a.z - k * 0.5);
        f1.rotation.y = t; f2.rotation.y = -t;
        f1.material.opacity = k * 0.95; f2.material.opacity = k * 0.95;
        l1.position.copy(f1.position).setY(f1.position.y + 0.42);
        l2.position.copy(f2.position).setY(f2.position.y - 0.42);
        l1.material.opacity = seg(k, 0.5, 1); l2.material.opacity = l1.material.opacity;
        valid.position.set(a.x, a.y - 2.35, a.z);
        valid.material.opacity = ease(seg(p, 0.32, 0.44));
        bad.material.opacity = 0; err.material.opacity = 0;
      } else if (p < 0.78) {                           // a malformed body is refused at the door
        f1.material.opacity = 0; f2.material.opacity = 0;
        l1.material.opacity = 0; l2.material.opacity = 0;
        valid.material.opacity = 0;
        packet.position.copy(a); packet.scale.setScalar(0.5);
        const inK = seg(p, 0.44, 0.58), out = seg(p, 0.6, 0.78);
        const x = a.x - 5.5 + ease(inK) * 4.0 - ease(out) * 4.4;
        bad.position.set(x, a.y, a.z);
        bad.material.opacity = 0.95;
        bad.rotation.y = t * 2.4;
        frame.material.opacity = 0.5 + (out > 0 ? 0.4 : 0);
        frame.material.color.setHex(out > 0 ? WARN : 0x3d517a);
        err.position.set(a.x, a.y - 2.35, a.z);
        err.material.opacity = ease(seg(p, 0.58, 0.68));
      } else {                                         // the valid one carries on
        const k = ease(seg(p, 0.78, 1));
        frame.material.color.setHex(0x3d517a);
        frame.material.opacity = 0.5 * (1 - k);
        packet.scale.setScalar(0.5 + k * 0.5);
        curve.getPoint(tOf(4) + k * (tOf(5) - tOf(4)), tmp);
        packet.position.copy(tmp);
        bad.material.opacity = 0;
        err.material.opacity = 1 - k;
        model.material.opacity = 1 - k;
      }
    } };
  }

  // ===== 06 Claude API: the server holds the key; the system prompt goes with it
  {
    const { g, L } = stepGroup(5);
    const a = at(5), b = at(6);
    const keyMesh = new THREE.Mesh(track(new THREE.TorusKnotGeometry(0.2, 0.075, 48, 8)),
      track(new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffae4d, emissiveIntensity: 1.3, roughness: 0.3, transparent: true, opacity: 0 })));
    g.add(keyMesh);
    const keyLab = L("API key — held server-side", "#ffc98a", 0.44);
    const sys = mini(okMat.clone()); track(sys.material); sys.scale.setScalar(1.3); g.add(sys);
    const sysLab = L("system prompt", "#9fc0ff", 0.44);
    const model = L("claude-haiku-4-5", "#9fc0ff", 0.5, 700);
    const TOK = 90;
    const tokArr = new Float32Array(TOK * 3);
    const tokGeo = track(new THREE.BufferGeometry());
    tokGeo.setAttribute("position", new THREE.BufferAttribute(tokArr, 3));
    const tokMat = track(new THREE.PointsMaterial({ color: 0xbcd4ff, size: 0.16, transparent: true, opacity: 0, depthWrite: false }));
    const tokens = new THREE.Points(tokGeo, tokMat);
    g.add(tokens);
    P[5] = { update(t) {
      const p = (t % 7.0) / 7.0;
      shellMat.opacity = 0.9;
      packet.position.copy(a);
      model.position.set(a.x, a.y + 1.75, a.z);
      model.material.opacity = 1;

      const join = ease(seg(p, 0.05, 0.3));
      keyMesh.position.set(a.x - 2.2 + join * 2.2, a.y - 1.4 + join * 1.4, a.z + 1.2 - join * 1.2);
      keyMesh.rotation.y = t * 1.2; keyMesh.rotation.x = t * 0.6;
      keyMesh.material.opacity = 0.95;
      keyLab.position.copy(keyMesh.position).setY(keyMesh.position.y - 0.75);
      keyLab.material.opacity = 0.9 * (1 - join * 0.55);

      sys.position.set(a.x + 2.2 - join * 2.2, a.y + 1.4 - join * 1.4, a.z - 1.2 + join * 1.2);
      sys.rotation.y = t * 1.4;
      sys.material.opacity = 0.95 * (1 - join * 0.7);
      sysLab.position.copy(sys.position).setY(sys.position.y + 0.65);
      sysLab.material.opacity = 0.9 * (1 - join);

      packet.scale.setScalar(p < 0.3 ? 1 : 0.8 + Math.sin(t * 5) * 0.09);   // the model working

      const flowK = ease(seg(p, 0.4, 0.95));           // tokens stream back, they don't appear at once
      for (let i = 0; i < TOK; i++) {
        const u = ((i / TOK) + t * 0.24) % 1;
        const s = u * flowK;
        tokArr[i * 3]     = a.x + (b.x - a.x) * s;
        tokArr[i * 3 + 1] = a.y + (b.y - a.y) * s + Math.sin(u * 9 + i) * 0.3;
        tokArr[i * 3 + 2] = a.z + (b.z - a.z) * s + Math.cos(u * 7 + i) * 0.3;
      }
      tokGeo.attributes.position.needsUpdate = true;
      tokMat.opacity = flowK * 0.95;
    } };
  }

  // ===== 07 Typed response: reply + measured usage travels the whole way back =
  {
    const { g, L } = stepGroup(6);
    const a = at(6);
    const ok = L("200", "#7ce0c0", 0.56, 700);
    const c1 = L("input_tokens", "#9fc0ff", 0.4);
    const c2 = L("output_tokens", "#9fc0ff", 0.4);
    const c3 = L("cost_usd — measured", "#7ce0c0", 0.4);
    const chips = [c1, c2, c3];
    P[6] = { update(t) {
      const p = (t % 8.0) / 8.0;
      shellMat.opacity = 0.9;
      if (p < 0.34) {                                  // the typed envelope assembles
        const k = seg(p, 0, 0.34);
        packet.position.copy(a);
        packet.scale.setScalar(0.5 + ease(k) * 0.5);
        ok.position.set(a.x, a.y + 1.75, a.z);
        ok.material.opacity = ease(seg(p, 0, 0.1));
        chips.forEach((c, j) => {
          c.position.set(a.x, a.y - 1.15 - j * 0.78, a.z);
          c.material.opacity = ease(seg(k, 0.2 + j * 0.22, 0.45 + j * 0.22));
        });
      } else {                                         // back along the real path to the browser
        const k = ease(seg(p, 0.34, 1));
        curve.getPoint(1 - k, tmp);
        packet.position.copy(tmp);
        packet.scale.setScalar(1);
        ok.position.set(tmp.x, tmp.y + 1.75, tmp.z);
        ok.material.opacity = 1 - k * 0.7;
        chips.forEach((c, j) => {
          c.position.set(tmp.x, tmp.y - 1.15 - j * 0.78, tmp.z);
          c.material.opacity = 1 - k * 0.7;
        });
      }
    } };
  }

  // --- State ------------------------------------------------------------------
  let step = 0, running = false, visible = false, raf = 0, stepT = 0, paused = false;
  let yaw = 0, pitch = 0, dragging = false, lastX = 0, lastY = 0, hover = -1;
  const BASE_YAW = 0.48;
  const camTarget = new THREE.Vector3().copy(at(0));
  const camPos = new THREE.Vector3();
  const clock = new THREE.Clock();

  function setStep(i) {
    if (i == null || i < 0 || i >= STEPS.length || i === step) return;
    step = i; stepT = 0;
    canvas.setAttribute("aria-label", STEPS[i].aria);
    groups.forEach((gr, j) => { gr.g.visible = j === i; });
    seedTrail(at(i));
    packet.scale.setScalar(1);
    if (paused) renderOnce();
  }

  // --- Interaction ------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const hitTargets = nodes.map((n) => n.hit);

  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(hitTargets, false);
    return hits.length ? hitTargets.indexOf(hits[0].object) : -1;
  }

  const onDown = (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  };
  const onMove = (e) => {
    if (dragging) {
      yaw += (e.clientX - lastX) * 0.006;
      pitch = clamp(pitch + (e.clientY - lastY) * 0.004, -0.35, 0.75);
      lastX = e.clientX; lastY = e.clientY;
      if (paused) renderOnce();
      return;
    }
    hover = pick(e);
    canvas.style.cursor = hover >= 0 ? "pointer" : "grab";
  };
  const onUp = (e) => {
    dragging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
  };
  const onClick = (e) => { const i = pick(e); if (i >= 0 && i !== step) onSelect(i); };

  canvas.style.cursor = "grab";
  canvas.style.touchAction = "pan-y";
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointerleave", () => { dragging = false; hover = -1; });
  canvas.addEventListener("click", onClick);

  // --- Frame ------------------------------------------------------------------
  const tmp = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const AX_Y = new THREE.Vector3(0, 1, 0);
  const AX_X = new THREE.Vector3(1, 0, 0);
  const RIM_OFF = new THREE.Vector3(0, 2, 4);
  const lv = new THREE.Vector3();
  let lw = 1, lh = 1;

  // Hand-rolled CSS2D: project each label to screen space and place the DOM node.
  // Ancestor visibility is walked explicitly, so a hidden step can't strand a label.
  function shown(o) {
    let p = o;
    while (p) { if (p.visible === false) return false; p = p.parent; }
    return true;
  }
  // Reused slot records; measuring is cached, so this allocates nothing per frame.
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
      // offsetWidth forces layout, so measure once per label and reuse.
      if (!o.userData.w) { o.userData.w = el.offsetWidth || 1; o.userData.h = el.offsetHeight || 1; }
      const s = slotAt(nSlots++);
      s.el = el; s.w = o.userData.w; s.h = o.userData.h;
      s.x = (lv.x * 0.5 + 0.5) * lw;
      s.y = (-lv.y * 0.5 + 0.5) * lh;
      s.prio = o.userData.prio === undefined ? 1 : o.userData.prio;
    }

    // Highest priority holds its exact spot; lower ones step vertically out of the way.
    // No fixed 3D offset can do this, because which labels collide depends on the
    // camera angle the viewer happens to have dragged to.
    const order = slots.slice(0, nSlots).sort((a, b) => b.prio - a.prio);
    for (let i = 0; i < order.length; i++) {
      const s = order[i];
      for (let guard = 0; guard < 12; guard++) {
        let hit = null;
        for (let j = 0; j < i; j++) {
          const p = order[j];
          if (Math.abs(s.x - p.x) < (s.w + p.w) / 2 + 8 && Math.abs(s.y - p.y) < (s.h + p.h) / 2 + 4) { hit = p; break; }
        }
        if (!hit) break;
        s.y = hit.y + (s.y >= hit.y ? 1 : -1) * ((s.h + hit.h) / 2 + 5);
      }
      s.el.style.transform = "translate(-50%,-50%) translate(" +
        Math.round(s.x) + "px," + Math.round(s.y) + "px)";
    }
  }

  function draw(dt, t) {
    camTarget.lerp(at(step), 1 - Math.pow(0.001, dt));
    // A slow idle orbit keeps the scene alive; it yields the moment the viewer drags.
    const idle = dragging ? 0 : Math.sin(t * 0.19) * 0.055;
    offset.set(0, 3.6 + Math.sin(t * 0.27) * 0.22, 12.5);
    offset.applyAxisAngle(AX_X, pitch);
    offset.applyAxisAngle(AX_Y, BASE_YAW + yaw + idle);
    camPos.copy(camTarget).add(offset);
    camera.position.lerp(camPos, 1 - Math.pow(0.002, dt));
    camera.lookAt(camTarget);
    rim.position.copy(camTarget).add(RIM_OFF);

    nodes.forEach((n, i) => {
      const on = i === step, hot = i === hover;
      n.coreMat.emissive.setHex(on ? ACCENT : 0x243049);
      n.coreMat.emissiveIntensity = on ? 1.5 : hot ? 1.0 : 0.6;
      n.cageMat.color.setHex(on ? ACCENT : hot ? 0x46577d : 0x2f3d59);
      n.cageMat.opacity = on ? 0.8 : hot ? 0.7 : 0.42;
      // no cage rotation — the camera is what shows you its other faces
      const s = on ? 1.18 : hot ? 1.08 : 1;
      n.g.scale.lerp(scl.set(s, s, s), 1 - Math.pow(0.005, dt));
      const d = camera.position.distanceTo(n.g.position);
      const o = clamp(1 - (d - 12) / 22, 0.06, 1);
      n.label.material.opacity = o;
      n.num.material.opacity = o * 0.85;
    });

    updateFlow(t);
    P[step].update(t);

    trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);          // newest sample first
    trailPos[0] = packet.position.x;
    trailPos[1] = packet.position.y;
    trailPos[2] = packet.position.z;
    trailGeo.attributes.position.needsUpdate = true;

    const pr = (t % 2.4) / 2.4;                          // a ring leaving the active node
    pulseRing.position.copy(at(step));
    pulseRing.quaternion.copy(camera.quaternion);        // always face the viewer
    pulseRing.scale.setScalar(0.7 + pr * 2.2);
    pulseMat.opacity = (1 - pr) * 0.45;
    packet.rotation.y = t * 0.8;
    packet.rotation.x = t * 0.4;
    renderer.render(scene, camera);
    renderLabels();
  }

  // Frame counter — so "is it actually animating?" is a measurement, not an opinion.
  let frames = 0, fpsMark = 0, fps = 0, quality = 2, lowStreak = 0;

  function applyQuality() {
    const cap = quality >= 2 ? 2 : quality === 1 ? 1.5 : 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    resize();
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    stepT += dt;
    try {
      draw(dt, stepT);
    } catch (err) {
      // A throw here would otherwise kill the loop silently and look like a still image.
      stop();
      if (hint) hint.textContent = "3D layer stopped: " + (err && err.message ? err.message : "error");
      console.error("[xray3d]", err);
      return;
    }
    frames++;
    fpsMark += dt;
    if (fpsMark >= 0.5) {
      fps = Math.round(frames / fpsMark);
      frames = 0; fpsMark = 0;
      // Degrade instead of assuming the viewer has the machine this was built on.
      if (fps < 45 && quality > 0) {
        if (++lowStreak >= 4) { quality--; lowStreak = 0; applyQuality(); }
      } else lowStreak = 0;
      if (debug && hint) hint.textContent = "drag to orbit · click a node · " + fps + " fps · q" + quality;
    }
    raf = requestAnimationFrame(frame);
  }

  function renderOnce() { try { draw(0.9, 1.6); } catch (err) { console.error("[xray3d]", err); } }

  function start() {
    if (running || paused) return;
    running = true; clock.getDelta();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function resize() {
    const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
    lw = w; lh = h;
    labelEls.forEach((o) => { o.userData.w = 0; });   // re-measure after a resize
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!running) renderOnce();
  }

  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      visible = e.isIntersecting;
      if (visible && !document.hidden) start(); else stop();
    });
  }, { threshold: 0.05 });
  io.observe(mount);

  const onVis = () => { if (document.hidden || !visible) stop(); else start(); };
  document.addEventListener("visibilitychange", onVis);
  const ro = new ResizeObserver(resize);
  ro.observe(mount);

  // Motion control. It animates by default; anyone who wants it still can stop it.
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "xr-3d-btn";
  const syncBtn = () => {
    btn.textContent = paused ? "Play" : "Pause";
    btn.setAttribute("aria-label", paused ? "Play the animation" : "Pause the animation");
  };
  btn.addEventListener("click", () => {
    paused = !paused;
    syncBtn();
    if (paused) { stop(); renderOnce(); } else { start(); }
  });
  syncBtn();
  mount.appendChild(btn);

  // Arrows walk the pipeline, space toggles motion. The canvas takes focus so the
  // visualisation is reachable without a pointer.
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight Space");
  const onKey = (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") onSelect(Math.min(STEPS.length - 1, step + 1));
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") onSelect(Math.max(0, step - 1));
    else if (e.key === " " || e.key === "Spacebar") btn.click();
    else return;
    e.preventDefault();
  };
  canvas.addEventListener("keydown", onKey);

  groups.forEach((gr, j) => { gr.g.visible = j === 0; });
  resize();

  // Start now rather than waiting on the observer — if the section is already on screen
  // when the module loads, the observer may not fire again and nothing would ever move.
  visible = true;
  start();

  return {
    setStep,
    reducedMotion: reduced,
    play() { if (running) return; running = true; clock.getDelta(); raf = requestAnimationFrame(frame); },
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
