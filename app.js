// VidNova - app.js
// Firebase Auth + Firestore + Razorpay Payment Flow

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── Firebase Init ────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDJD9JGmQEuTXiyGIyu7UR-Yiwq4hDONTo",
  authDomain: "vidnova-main.firebaseapp.com",
  projectId: "vidnova-main",
  storageBucket: "vidnova-main.firebasestorage.app",
  messagingSenderId: "782618029764",
  appId: "1:782618029764:web:bfcbb1458a7afbbde9e391",
  measurementId: "G-06DXR5QV9B"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// ─── Razorpay Payment Links ──────────────────────────────────────────────────
const PAYMENT_LINKS = {
  pro:   "https://rzp.io/rzp/av74Edum",  // ₹199
  ultra: "https://rzp.io/rzp/YS0AEWp"    // ₹499
};

const PLAN_DATA = {
  pro: {
    name: "Pro", price: "₹199/mo", total: "₹597",
    features: ["Unlimited downloads", "MP4 up to 4K", "MP3 320kbps", "Playlist download", "No ads", "3× speed"]
  },
  ultra: {
    name: "Ultra", price: "₹499/mo", total: "₹1497",
    features: ["Everything in Pro", "Bulk batch", "API access", "Browser extension", "Dedicated server", "24/7 support"]
  }
};

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let userPlan = "free";
let currentPaymentPlan = null;
let recentDownloads = JSON.parse(localStorage.getItem("vn_recent") || "[]");
const API_BASE = '/api';

// ─── Auth State ───────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    await loadUserData(user);
    showNavUser(user);
  } else {
    userPlan = "free";
    document.body.classList.remove("is-premium");
    showNavAuth();
    hidePremiumBanner();
  }
  renderRecentDownloads();
});

async function loadUserData(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Create user doc
    await setDoc(ref, {
      name: user.displayName || user.email.split("@")[0],
      email: user.email,
      plan: "free",
      createdAt: serverTimestamp()
    });
    userPlan = "free";
  } else {
    const data = snap.data();
    // Check if premium expired
    if (data.plan !== "free" && data.premiumExpiry) {
      const expiry = data.premiumExpiry.toDate ? data.premiumExpiry.toDate() : new Date(data.premiumExpiry);
      if (new Date() > expiry) {
        // Expired — downgrade
        await updateDoc(ref, { plan: "free", premiumExpired: true });
        userPlan = "free";
        document.body.classList.remove("is-premium");
      } else {
        userPlan = data.plan;
        document.body.classList.add("is-premium");
        showPremiumBanner(data.plan, expiry);
      }
    } else {
      userPlan = data.plan || "free";
      if (userPlan !== "free") {
        document.body.classList.add("is-premium");
      }
    }
  }

  // Update UI
  const nameEl = document.getElementById("udName");
  const planEl = document.getElementById("udPlan");
  const avatarEl = document.getElementById("userAvatar");
  if (nameEl) nameEl.textContent = user.displayName || user.email.split("@")[0];
  if (planEl) planEl.textContent = userPlan === "free" ? "Free Plan" : `${capitalize(userPlan)} Member ⚡`;
  if (avatarEl) avatarEl.textContent = (user.displayName || user.email)[0].toUpperCase();
}

// ─── Nav ───────────────────────────────────────────────────────────────────────
function showNavUser(user) {
  document.getElementById("navUser").classList.remove("hidden");
  document.getElementById("navAuthBtns").classList.add("hidden");
}
function showNavAuth() {
  document.getElementById("navUser").classList.add("hidden");
  document.getElementById("navAuthBtns").classList.remove("hidden");
}

// ─── Premium Banner ────────────────────────────────────────────────────────────
function showPremiumBanner(plan, expiryDate) {
  const banner = document.getElementById("premiumBanner");
  const text = document.getElementById("pbText");
  banner.classList.remove("hidden");
  const d = expiryDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  text.textContent = `${capitalize(plan)} active · Expires ${d}`;
  // Adjust hero padding
  document.querySelector(".hero").style.paddingTop = "130px";
}
function hidePremiumBanner() {
  document.getElementById("premiumBanner").classList.add("hidden");
  document.querySelector(".hero").style.paddingTop = "";
}
window.closePremiumBanner = function() {
  document.getElementById("premiumBanner").classList.add("hidden");
};

// ─── Auth Modal ───────────────────────────────────────────────────────────────
window.showSignin = function() {
  document.getElementById("signinModal").classList.remove("hidden");
  document.getElementById("signupModal").classList.add("hidden");
  document.getElementById("authOverlay").classList.add("active");
};
window.showSignup = function() {
  document.getElementById("signupModal").classList.remove("hidden");
  document.getElementById("signinModal").classList.add("hidden");
  document.getElementById("authOverlay").classList.add("active");
};
window.closeAuth = function() {
  document.getElementById("authOverlay").classList.remove("active");
};
window.closeAuthIfOutside = function(e) {
  if (e.target.id === "authOverlay") closeAuth();
};

// ─── Sign In ──────────────────────────────────────────────────────────────────
window.doSignIn = async function() {
  const email = document.getElementById("si-email").value.trim();
  const pass  = document.getElementById("si-pass").value;
  const errEl = document.getElementById("signinErr");
  const btn   = document.querySelector("#signinModal .btn-auth-primary");
  clearErr(errEl);
  if (!email || !pass) return showErr(errEl, "Please fill all fields.");
  btn.classList.add("loading");
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    closeAuth();
  } catch (e) {
    showErr(errEl, getFriendlyError(e.code));
  }
  btn.classList.remove("loading");
};

// ─── Sign Up ──────────────────────────────────────────────────────────────────
window.doSignUp = async function() {
  const name  = document.getElementById("su-name").value.trim();
  const email = document.getElementById("su-email").value.trim();
  const pass  = document.getElementById("su-pass").value;
  const errEl = document.getElementById("signupErr");
  const btn   = document.querySelector("#signupModal .btn-auth-primary");
  clearErr(errEl);
  if (!name || !email || !pass) return showErr(errEl, "Please fill all fields.");
  if (pass.length < 6) return showErr(errEl, "Password must be at least 6 characters.");
  btn.classList.add("loading");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      name, email,
      plan: "free",
      createdAt: serverTimestamp()
    });
    closeAuth();
  } catch (e) {
    showErr(errEl, getFriendlyError(e.code));
  }
  btn.classList.remove("loading");
};

// ─── Google Sign In ────────────────────────────────────────────────────────────
window.doGoogleSignIn = async function() {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const user = cred.user;
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        name: user.displayName,
        email: user.email,
        plan: "free",
        createdAt: serverTimestamp()
      });
    }
    closeAuth();
  } catch (e) {
    console.error(e);
  }
};

// ─── Sign Out ─────────────────────────────────────────────────────────────────
window.doSignOut = async function() {
  await signOut(auth);
};

// ─── Payment ──────────────────────────────────────────────────────────────────
window.startPayment = function(plan) {
  if (!currentUser) {
    showSignup();
    return;
  }
  currentPaymentPlan = plan;
  const data = PLAN_DATA[plan];
  document.getElementById("payPlanBadge").textContent = data.name.toUpperCase();
  document.getElementById("payPlanName").textContent = data.name;
  document.getElementById("payPrice").textContent = data.price;
  document.getElementById("payTotal").textContent = data.total;
  document.getElementById("payBtn").href = PAYMENT_LINKS[plan];

  // Features
  const featEl = document.getElementById("payFeatures");
  featEl.innerHTML = data.features.map(f => `<span class="pay-feat">✓ ${f}</span>`).join("");

  // Hide "I've paid" until they click pay
  document.getElementById("btnIvePaid").style.display = "none";

  document.getElementById("paymentOverlay").classList.add("active");
};

window.closePayment = function() {
  document.getElementById("paymentOverlay").classList.remove("active");
};
window.closePaymentIfOutside = function(e) {
  if (e.target.id === "paymentOverlay") closePayment();
};

window.handlePayClick = function() {
  // Show "I've paid" after clicking the pay button
  setTimeout(() => {
    document.getElementById("btnIvePaid").style.display = "block";
  }, 2000);
};

window.handleIvePaid = async function() {
  if (!currentUser || !currentPaymentPlan) return;
  const btn = document.getElementById("btnIvePaid");
  btn.textContent = "⏳ Activating…";
  btn.disabled = true;

  try {
    const now = new Date();
    const expiry = new Date(now);
    expiry.setMonth(expiry.getMonth() + 3); // 3 months from now

    await updateDoc(doc(db, "users", currentUser.uid), {
      plan: currentPaymentPlan,
      premiumActivatedAt: serverTimestamp(),
      premiumExpiry: expiry,
      lastPaymentPlan: currentPaymentPlan
    });

    userPlan = currentPaymentPlan;
    document.body.classList.add("is-premium");
    closePayment();
    await loadUserData(currentUser);

    // Toast
    showToast(`⚡ ${capitalize(currentPaymentPlan)} activated! Enjoy premium until ${expiry.toLocaleDateString("en-IN", { day:"numeric",month:"short",year:"numeric" })}`);
  } catch (e) {
    btn.textContent = "❌ Error. Try again.";
    btn.disabled = false;
    console.error(e);
  }
};

// ─── Downloader ────────────────────────────────────────────────────────────────
const SUPPORTED = [
  'youtube.com','youtu.be','instagram.com','twitter.com',
  'x.com','tiktok.com','facebook.com','fb.watch','vimeo.com','dailymotion.com'
];

function isValidUrl(url) {
  try {
    const u = new URL(url);
    return SUPPORTED.some(s => u.hostname.includes(s));
  } catch { return false; }
}

window.pasteFromClipboard = async function() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById("videoUrl").value = text;
    fetchVideo();
  } catch (e) {
    document.getElementById("videoUrl").focus();
  }
};

window.fetchVideo = async function() {
  const url = document.getElementById("videoUrl").value.trim();
  const ra = document.getElementById("resultArea");

  if (!url) {
    setResult(`<div class="msg-card error">⚠️ Please paste a video URL first.</div>`);
    return;
  }
  if (!isValidUrl(url)) {
    setResult(`<div class="msg-card error">⚠️ URL not supported. Try YouTube, Instagram, TikTok, Twitter, or Facebook.</div>`);
    return;
  }

  setResult(`<div class="msg-card loading"><div class="spinner"></div>Fetching video info…</div>`);

  try {
    const res = await fetch(`${API_BASE}/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Server error. Please try again.");
    }
    const data = await res.json();
    renderResult(data, url);
    addToRecent(data, url);
  } catch (err) {
    setResult(`<div class="msg-card error">❌ ${escHtml(err.message)}</div>`);
  }
};

function renderResult(data, url) {
  const thumb = data.thumbnail
    ? `<img src="${escHtml(data.thumbnail)}" alt="thumb" onerror="this.style.display='none'"/>`
    : "▶";
  const duration = escHtml(data.duration || "");
  const platform = escHtml(data.platform || "Video");
  const title = escHtml(data.title || "Video");

  const isPremium = userPlan !== "free";

  // Quality rows
  const mp4Rows = `
    <div class="quality-chips">
      <span class="q-chip" onclick="selectQuality(this)">360p</span>
      <span class="q-chip active" onclick="selectQuality(this)">720p</span>
      ${isPremium
        ? `<span class="q-chip" onclick="selectQuality(this)">1080p</span>
           <span class="q-chip" onclick="selectQuality(this)">4K</span>`
        : `<span class="q-chip premium-chip" onclick="requirePremium()">1080p ⚡</span>
           <span class="q-chip premium-chip" onclick="requirePremium()">4K ⚡</span>`
      }
    </div>
    <a class="btn-dl-row" href="${API_BASE}/download?url=${encodeURIComponent(url)}&format=mp4" target="_blank">
      ⬇ Download
    </a>
  `;

  const mp3Rows = `
    <div class="quality-chips">
      <span class="q-chip active" onclick="selectQuality(this)">128kbps</span>
      ${isPremium
        ? `<span class="q-chip" onclick="selectQuality(this)">320kbps</span>`
        : `<span class="q-chip premium-chip" onclick="requirePremium()">320kbps ⚡</span>`
      }
    </div>
    <a class="btn-dl-row audio" href="${API_BASE}/download?url=${encodeURIComponent(url)}&format=mp3" target="_blank">
      🎵 Audio only
    </a>
  `;

  const webmRows = `
    <div class="quality-chips">
      <span class="q-chip active" onclick="selectQuality(this)">720p</span>
      ${isPremium
        ? `<span class="q-chip" onclick="selectQuality(this)">1080p</span>`
        : `<span class="q-chip premium-chip" onclick="requirePremium()">1080p ⚡</span>`
      }
    </div>
    <a class="btn-dl-row" href="${API_BASE}/download?url=${encodeURIComponent(url)}&format=webm" target="_blank">
      ⬇ Download
    </a>
  `;

  setResult(`
    <div class="result-card">
      <div class="result-top">
        <div class="result-thumb">${thumb}</div>
        <div class="result-info">
          <h4>${title}</h4>
          <div class="result-meta">
            ${duration ? `<span class="result-duration">${duration}</span>` : ""}
            <span class="result-platform">${platform}</span>
          </div>
        </div>
      </div>
      <div class="result-formats">
        <div class="fmt-row">
          <span class="fmt-name">MP4</span>
          ${mp4Rows}
        </div>
        <div class="fmt-row">
          <span class="fmt-name">MP3</span>
          ${mp3Rows}
        </div>
        <div class="fmt-row">
          <span class="fmt-name">WEBM</span>
          ${webmRows}
        </div>
      </div>
    </div>
  `);
}

function setResult(html) {
  document.getElementById("resultArea").innerHTML = html;
}

window.selectQuality = function(el) {
  el.closest(".quality-chips").querySelectorAll(".q-chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
};

window.requirePremium = function() {
  if (!currentUser) { showSignup(); return; }
  showToast("⚡ Upgrade to Pro to unlock 1080p & 4K quality");
  setTimeout(() => {
    document.getElementById("pricing").scrollIntoView({ behavior: "smooth" });
  }, 800);
};

window.showPricing = function() {
  document.getElementById("pricing").scrollIntoView({ behavior: "smooth" });
};

// ─── Recent Downloads ─────────────────────────────────────────────────────────
function addToRecent(data, url) {
  const item = {
    title: data.title || "Video",
    format: "MP4",
    date: "today",
    url
  };
  recentDownloads = [item, ...recentDownloads.filter(r => r.url !== url)].slice(0, 6);
  localStorage.setItem("vn_recent", JSON.stringify(recentDownloads));
  renderRecentDownloads();
}

function renderRecentDownloads() {
  const section = document.getElementById("recentSection");
  const grid = document.getElementById("recentGrid");
  if (!recentDownloads.length) { section.style.display = "none"; return; }
  section.style.display = "block";
  grid.innerHTML = recentDownloads.map(r => `
    <div class="recent-item" onclick="loadRecent('${escHtml(r.url)}')">
      <div class="ri-icon">▶</div>
      <div class="ri-info">
        <div class="ri-title">${escHtml(r.title)}</div>
        <div class="ri-meta">${r.format} · ${r.date}</div>
      </div>
    </div>
  `).join("");
}

window.loadRecent = function(url) {
  document.getElementById("videoUrl").value = url;
  fetchVideo();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

// ─── Contact Form ─────────────────────────────────────────────────────────────
window.submitContact = async function() {
  const name  = document.getElementById("cf-name").value.trim();
  const email = document.getElementById("cf-email").value.trim();
  const msg   = document.getElementById("cf-msg").value.trim();
  const el    = document.getElementById("cf-success");
  if (!name || !email || !msg) {
    el.textContent = "⚠️ Please fill all fields.";
    el.style.color = "#f87171";
    return;
  }
  el.textContent = "✅ Message sent! Chintan will reply soon.";
  el.style.color = "var(--teal)";
  document.getElementById("cf-name").value = "";
  document.getElementById("cf-email").value = "";
  document.getElementById("cf-msg").value = "";
};

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById("vn-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "vn-toast";
    t.style.cssText = `position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);
      background:#1a1a1a;border:1px solid rgba(29,185,84,.4);color:#f2f2f2;
      padding:12px 22px;border-radius:100px;font-size:14px;font-weight:500;
      z-index:9999;opacity:0;transition:all .3s;white-space:nowrap;max-width:90vw;text-align:center;`;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => {
    t.style.opacity = "1";
    t.style.transform = "translateX(-50%) translateY(0)";
    setTimeout(() => {
      t.style.opacity = "0";
      t.style.transform = "translateX(-50%) translateY(20px)";
    }, 4000);
  });
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function showErr(el, msg) { el.textContent = msg; el.classList.add("show"); }
function clearErr(el) { el.textContent = ""; el.classList.remove("show"); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function getFriendlyError(code) {
  const map = {
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/email-already-in-use": "Email already registered. Try signing in.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/invalid-credential": "Invalid email or password."
  };
  return map[code] || "Something went wrong. Please try again.";
}

// ─── Enter key in URL input ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const inp = document.getElementById("videoUrl");
  if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter") fetchVideo(); });
});
