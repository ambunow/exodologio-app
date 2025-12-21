"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { auth, db } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

/** =========================
 *  Defaults
 *  ========================= */
const EXPENSE_CATEGORY_TREE = [
  {
    name: "Ψώνια",
    items: [
      { name: "Σούπερ Μάρκετ" },
      { name: "Φούρνος" },
      { name: "Κρεοπωλείο" },
      { name: "Μανάβικο" },
      { name: "Λαϊκή" },
      { name: "Ψαράδικο" },
      { name: "Ρούχα" },
      { name: "Παπούτσια" },
      { name: "Τεχνολογία" },
      { name: "Άλλα Ψώνια", other: true },
    ],
  },
  {
    name: "Πάγια Έξοδα Σπιτιού",
    items: [
      { name: "Λογαριασμός Ρεύματος" },
      { name: "Λογαριασμός Νερού" },
      { name: "Λογαριασμός Κινητού" },
      { name: "Λογαριασμός Σταθερού/Ιντερνετ" },
      { name: "ΕΝΦΙΑ" },
      { name: "Ενοίκιο" },
      { name: "Κοινόχρηστα" },
      { name: "Δόση Δανείου" },
      { name: "Άλλα Έξοδα Σπιτιού", other: true },
    ],
  },
  {
    name: "Διασκέδαση",
    items: [
      { name: "Φαγητό έξω" },
      { name: "Καφετέρια" },
      { name: "Μπαρ/Club" },
      { name: "Μπουζούκια" },
      { name: "Παιδότοπος" },
      { name: "Γενέθλια/Γιορτή" },
    ],
  },
  {
    name: "Αυτοκίνητο",
    items: [
      { name: "Βενζίνη" },
      { name: "Υγραέριο" },
      { name: "Πετρέλαιο" },
      { name: "Διόδια" },
      { name: "Τέλη Κυκλοφορίας" },
      { name: "Ασφάλεια" },
      { name: "Επισκευή" },
      { name: "Service" },
      { name: "Δόση Δανείου" },
      { name: "Πλύσιμο Αυτοκινήτου" },
    ],
  },
  {
    name: "Ταξίδια",
    items: [
      { name: "Αεροπορικό Εισιτήριο" },
      { name: "Εισιτήριο Πλοίου" },
      { name: "Εισιτήριο ΚΤΕΛ" },
      { name: "Εισιτήριο Τρένου" },
      { name: "Ξενοδοχείο" },
      { name: "Διάφορες Δραστηριότητες" },
    ],
  },
  {
    name: "Παιδιά",
    items: [
      {
        name: "Ξένες Γλώσσες",
        items: [
          { name: "Αγγλικά" },
          { name: "Γαλλικά" },
          { name: "Ιταλικά" },
          { name: "Γερμανικά" },
          { name: "Άλλες Γλώσσες", other: true },
        ],
      },
      {
        name: "Αθλητικές Δραστηριότητες",
        items: [
          { name: "Ποδόσφαιρο" },
          { name: "Μπάσκετ" },
          { name: "Βόλεϊ" },
          { name: "Τέννις" },
          { name: "Αναρρίχηση/Ορειβασία" },
          { name: "Πολεμικές Τέχνες" },
          { name: "Ωδείο" },
        ],
      },
      { name: "Ιδιωτικό Σχολείο" },
      { name: "Άλλες Δραστηριότητες", other: true },
    ],
  },
  {
    name: "Υγεία",
    items: [{ name: "Νοσηλεία σε Νοσοκομείο" }, { name: "Εξετάσεις" }],
  },
  {
    name: "Προσωπική Φροντίδα",
    items: [{ name: "Κομμωτήριο" }, { name: "Μανικιούρ" }, { name: "Πεντικιούρ" }],
  },
  {
    name: "Κατοικίδια",
    items: [
      { name: "Τροφή" },
      { name: "Κτηνίατρος" },
      { name: "Διάφορα Αξεσουάρ" },
      { name: "Μεταφορές" },
      { name: "Φιλοξενία" },
    ],
  },
  { name: "Άλλα έξοδα", other: true },
];

function findExpenseMainNode(main) {
  return EXPENSE_CATEGORY_TREE.find((x) => x.name === main) || null;
}

function findExpenseSub1Node(main, sub1) {
  const m = findExpenseMainNode(main);
  if (!m?.items) return null;
  return m.items.find((x) => x.name === sub1) || null;
}

function getExpenseSub1Options(main) {
  const m = findExpenseMainNode(main);
  if (!m || m.other) return [];
  return (m.items || []).map((x) => x.name);
}

function getExpenseSub2Options(main, sub1) {
  const s1 = findExpenseSub1Node(main, sub1);
  if (!s1?.items) return [];
  return (s1.items || []).map((x) => x.name);
}

function isExpenseOtherSelection(main, sub1, sub2) {
  const m = findExpenseMainNode(main);
  if (m?.other) return true;

  if (!sub1) return false;
  const s1 = findExpenseSub1Node(main, sub1);
  if (s1?.other) return true;

  if (!sub2) return false;
  const s2 = (s1?.items || []).find((x) => x.name === sub2) || null;
  return !!s2?.other;
}

function buildExpenseCategoryPath({ main, sub1, sub2, otherText }) {
  const parts = [main, sub1, sub2].filter(Boolean);
  let path = parts.join(" / ");

  if (isExpenseOtherSelection(main, sub1, sub2)) {
    const t = String(otherText || "").trim();
    if (t) path = path ? `${path} / ${t}` : t;
  }
  return path;
}

const EXPENSE_PAYMENT_METHODS = [
  "Μετρητά",
  "Χρεωστική κάρτα",
  "Πιστωτική κάρτα",
  "Λογαριασμός Τράπεζας",
  "Άλλο",
];

const DEFAULT_BANK_WALLETS = [
  "Alpha Bank",
  "Eurobank",
  "Τράπεζα Πειραιώς",
  "Εθνική Τράπεζα",
  "Revolut Bank",
  "N26 Bank",
  "Binance",
  "Nexo",
  "Kucoin",
  "ByBit",
  "Kast",
];

const DEFAULT_INCOME_RECEIPT_METHODS = ["Alpha Bank", "Μετρητά στο χέρι"];
const INCOME_SOURCES = [
  "Μισθός",
  "Σύνταξη",
  "Από Επενδύσεις",
  "Ενοίκιο",
  "Επιστροφή χρημάτων",
  "Δώρο",
  "Άλλο",
];


function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function isIOS() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

function formatCurrency(value) {
  const v = Number(value || 0);
  return v.toLocaleString("el-GR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getMonthLabel(monthStr) {
  const [y, m] = monthStr.split("-");
  return `${m}/${y}`;
}

// ✅ γράμματα/αριθμοί/παύλες, normalize σε lowercase
function normalizeInviteCode(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidInviteCode(code) {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) && code.length >= 3 && code.length <= 32
  );
}

function randomSuffix(len = 4) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function proposeInviteCode(nameLike = "home") {
  const base = normalizeInviteCode(nameLike) || "home";
  const trimmed = base.slice(0, 20);
  const code = `${trimmed}-${randomSuffix(4)}`;
  return code.slice(0, 32);
}

function getInviteFromURL() {
  if (typeof window === "undefined") return "";
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get("invite") || "";
    return normalizeInviteCode(raw);
  } catch {
    return "";
  }
}

function firebaseErrorToGreek(err) {
  const code = err?.code || "";
  if (code === "auth/invalid-email") return "Το email δεν είναι έγκυρο.";
  if (code === "auth/missing-password") return "Βάλε κωδικό.";
  if (code === "auth/weak-password") return "Ο κωδικός είναι αδύναμος. Βάλε τουλάχιστον 6 χαρακτήρες.";
  if (code === "auth/user-not-found") return "Δεν βρέθηκε λογαριασμός με αυτό το email.";
  if (code === "auth/wrong-password") return "Λάθος κωδικός.";
  if (code === "auth/invalid-credential") return "Λάθος στοιχεία σύνδεσης.";
  if (code === "auth/email-already-in-use") return "Υπάρχει ήδη λογαριασμός με αυτό το email.";
  if (code === "auth/operation-not-allowed")
    return "Δεν είναι ενεργοποιημένο το Email/Password στο Firebase Authentication (Sign-in method).";
  if (code === "permission-denied")
    return "Απόρριψη πρόσβασης (Firestore rules). Έλεγξε ότι έκανες Publish τους rules.";
  return err?.message || "Κάτι πήγε στραβά.";
}

function asYYYYMM(dateStr) {
  return String(dateStr || "").slice(0, 7);
}

function inRange(dateStr, start, end) {
  if (!dateStr) return false;
  const d = String(dateStr);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

/** =====================
 *  UI helpers
 * ===================== */
function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const UI = {
  card: "rounded-2xl bg-white shadow-sm border border-slate-200",
  cardPad: "p-4 sm:p-6",
  sectionTitle: "text-lg font-semibold text-slate-900",
  label: "text-sm font-medium text-slate-700",
  input:
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
    "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400",
  select:
    "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 " +
    "focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400",
  btnPrimary:
    "rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60",
  btnSecondary:
    "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60",
  btnGhost:
    "rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60",
  hint: "text-xs text-slate-500",
  error: "text-sm text-rose-700",
  success: "text-sm text-emerald-700",
  badge:
    "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700",
  divider: "h-px w-full bg-slate-200",
};

/** =========================
 *  PWA Install bar
 *  ========================= */
function InstallPWABar() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (dismissed || installed) return null;

  const showIOSHint = isIOS() && !isStandalone();
  const canInstall = !!deferredPrompt;

  if (!showIOSHint && !canInstall) return null;

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch {}
    setDeferredPrompt(null);
  }

  return (
    <div className="fixed bottom-3 left-0 right-0 z-[60] px-3">
      <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-lg p-3 flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black">
          €
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Εγκατάσταση Exodologio</div>
          {showIOSHint ? (
            <div className="text-xs text-slate-600 mt-0.5">
              iPhone/iPad: πάτα <b>Share</b> → <b>Add to Home Screen</b>.
            </div>
          ) : (
            <div className="text-xs text-slate-600 mt-0.5">
              Πάτησε “Εγκατάσταση” για να ανοίγει σαν κανονική εφαρμογή.
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canInstall && (
            <button
              onClick={handleInstall}
              className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
            >
              Εγκατάσταση
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"
          >
            Κλείσιμο
          </button>
        </div>
      </div>
    </div>
  );
}

function EyeButton({ shown, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 active:scale-[0.99]"
      aria-label={shown ? "Hide password" : "Show password"}
      title={shown ? "Απόκρυψη" : "Εμφάνιση"}
    >
      {shown ? "🙈" : "👁️"}
    </button>
  );
}

// =====================
//  App background (€ pattern)
// =====================
const EURO_PATTERN = [
  { x: 6, y: 10, s: 26, o: 0.08, r: -10 },
  { x: 18, y: 22, s: 18, o: 0.06, r: 12 },
  { x: 32, y: 14, s: 40, o: 0.07, r: 18 },
  { x: 44, y: 28, s: 22, o: 0.06, r: -18 },
  { x: 58, y: 16, s: 28, o: 0.07, r: 8 },
  { x: 70, y: 26, s: 46, o: 0.06, r: -8 },
  { x: 84, y: 12, s: 20, o: 0.05, r: 10 },
  { x: 92, y: 30, s: 30, o: 0.06, r: -14 },

  { x: 8, y: 52, s: 44, o: 0.05, r: 16 },
  { x: 20, y: 62, s: 22, o: 0.06, r: -8 },
  { x: 34, y: 54, s: 18, o: 0.05, r: 10 },
  { x: 48, y: 66, s: 36, o: 0.06, r: -18 },
  { x: 60, y: 56, s: 24, o: 0.06, r: 12 },
  { x: 74, y: 64, s: 18, o: 0.05, r: -6 },
  { x: 88, y: 54, s: 40, o: 0.06, r: 18 },
  { x: 96, y: 68, s: 22, o: 0.05, r: -12 },

  { x: 10, y: 86, s: 20, o: 0.05, r: -12 },
  { x: 22, y: 80, s: 34, o: 0.06, r: 14 },
  { x: 36, y: 90, s: 18, o: 0.05, r: -6 },
  { x: 50, y: 82, s: 46, o: 0.06, r: 10 },
  { x: 64, y: 92, s: 24, o: 0.05, r: -16 },
  { x: 76, y: 84, s: 18, o: 0.05, r: 8 },
  { x: 90, y: 90, s: 38, o: 0.06, r: -10 },
];

function EuroPatternBg() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      {/* soft color blobs */}
      <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-emerald-300/25 blur-3xl" />
      <div className="absolute -bottom-44 -right-40 h-[520px] w-[520px] rounded-full bg-rose-300/20 blur-3xl" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full bg-sky-300/15 blur-3xl" />

      {/* € pattern */}
      <div className="absolute inset-0">
        {EURO_PATTERN.map((p, i) => (
          <span
            key={i}
            className="absolute font-black text-slate-900 select-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              fontSize: `${p.s}px`,
              opacity: p.o,
              transform: `rotate(${p.r}deg)`,
            }}
          >
            €
          </span>
        ))}
      </div>

      {/* subtle vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/20 to-white/70" />
    </div>
  );
}

/** =========================
 *  Firestore helpers (households)
 *  ========================= */
async function ensureMembership({ uid, householdId, displayName, email }) {
  const memberRef = doc(db, "households", householdId, "members", uid);

  // IMPORTANT: Με τους rules σου, ο απλός χρήστης ΔΕΝ επιτρέπεται να κάνει update στο members doc.
  // Άρα: δημιουργούμε μόνο αν ΔΕΝ υπάρχει. Αν υπάρχει, δεν πειράζουμε τίποτα.
  const existing = await getDoc(memberRef);
  if (existing.exists()) return;

  await setDoc(memberRef, {
    uid,
    displayName: displayName || null,
    email: email || null,
    joinedAt: serverTimestamp(),
  });
}

async function loadUserHouseholdId(uid) {
  const uref = doc(db, "users", uid);
  const snap = await getDoc(uref);
  return snap.exists() ? snap.data().householdId || null : null;
}

async function setUserHouseholdId(uid, householdId) {
  const uref = doc(db, "users", uid);
  await setDoc(uref, { householdId, updatedAt: serverTimestamp() }, { merge: true });
}

async function resolveHouseholdIdByInviteCode(invite) {
  const code = normalizeInviteCode(invite);
  if (!isValidInviteCode(code)) return null;

  const ref = doc(db, "inviteCodes", code);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const hid = snap.data()?.householdId;
  return typeof hid === "string" ? hid : null;
}

async function createHouseholdWithInvite({ uid, displayName }) {
  const base = displayName || "home";
  let invite = proposeInviteCode(base);

  for (let i = 0; i < 5; i++) {
    const code = normalizeInviteCode(invite);
    const inviteRef = doc(db, "inviteCodes", code);
    const existing = await getDoc(inviteRef);
    if (!existing.exists()) break;
    invite = proposeInviteCode(base);
  }

  let finalCode = normalizeInviteCode(invite);
  if (!isValidInviteCode(finalCode)) {
    finalCode = normalizeInviteCode(`home-${randomSuffix(6)}`.slice(0, 32));
  }

  // 1) Create household
  const h = await addDoc(collection(db, "households"), {
    createdAt: serverTimestamp(),
    createdBy: uid,
    inviteCode: finalCode,
    inviteCodeLower: finalCode,
    inviteUpdatedAt: serverTimestamp(),
    inviteUpdatedBy: uid,
  });

  // 2) FIRST: set membership (για να περνάνε τα rules στα subcollections)
  await ensureMembership({ uid, householdId: h.id, displayName, email: null });

  // 3) Store householdId on user (ώστε να μη χρειάζεται να το ξαναγράφει ποτέ)
  await setUserHouseholdId(uid, h.id);

  // 4) Now safe: default settings per household
  await setDoc(
    doc(db, "households", h.id, "meta", "settings"),
    {
      bankWallets: DEFAULT_BANK_WALLETS,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true }
  );

  // 5) Create invite code mapping (rules: μόνο owner)
  await setDoc(doc(db, "inviteCodes", finalCode), {
    householdId: h.id,
    createdByUid: uid,
    createdAt: serverTimestamp(),
  });

  return { householdId: h.id, inviteCode: finalCode };
}


async function loadHouseholdSettings(householdId) {
  const ref = doc(db, "households", householdId, "meta", "settings");
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    return {
      bankWallets: DEFAULT_BANK_WALLETS,
    };
  }
  const data = snap.data() || {};
  return {
    bankWallets: Array.isArray(data.bankWallets) ? data.bankWallets : DEFAULT_BANK_WALLETS,
  };
}

async function addBankWallet({ householdId, uid, value }) {
  const v = String(value || "").trim();
  if (!v) return;

  const ref = doc(db, "households", householdId, "meta", "settings");
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const arr = Array.isArray(data?.bankWallets) ? data.bankWallets : DEFAULT_BANK_WALLETS;
    const next = Array.from(new Set([...arr, v]));
    tx.set(
      ref,
      { bankWallets: next, updatedAt: serverTimestamp(), updatedBy: uid },
      { merge: true }
    );
  });
}

/** =========================
 *  MAIN PAGE
 *  ========================= */
export default function HomePage() {
  const [user, setUser] = useState(null);
  const [householdId, setHouseholdId] = useState(null);

  const [householdInvite, setHouseholdInvite] = useState("");
  const [loadingHouseholdMeta, setLoadingHouseholdMeta] = useState(false);

  // household settings (per household)
  const [bankWallets, setBankWallets] = useState(DEFAULT_BANK_WALLETS);

  // members (per household) for dropdown
  const [members, setMembers] = useState([]);
  const [txMemberUid, setTxMemberUid] = useState("");

  // auth
  const [authMode, setAuthMode] = useState("login"); // login | register
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [inviteFromLink, setInviteFromLink] = useState("");

  const [showPassLogin, setShowPassLogin] = useState(false);
  const [showPassRegister, setShowPassRegister] = useState(false);
  const [showPassRegister2, setShowPassRegister2] = useState(false);

  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  
  // missing household fix
  const [fixInvite, setFixInvite] = useState("");
  const [fixError, setFixError] = useState("");

  // invite edit
  const [inviteEditOpen, setInviteEditOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState("");
  const [inviteEditError, setInviteEditError] = useState("");

  // filters
  const [filterMode, setFilterMode] = useState("month"); // month | range
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  // transactions
  const [transactions, setTransactions] = useState([]);

  // tx form
  const [editingId, setEditingId] = useState(null);
  const [date, setDate] = useState(getToday());
  const [type, setType] = useState("expense"); // income | expense
  const [amount, setAmount] = useState("");

  // expense fields
  const [expenseMainCategory, setExpenseMainCategory] = useState("Ψώνια");
  const [expenseSubCategory, setExpenseSubCategory] = useState("Σούπερ Μάρκετ");
  const [expenseSubCategory2, setExpenseSubCategory2] = useState("");
  const [expenseOtherText, setExpenseOtherText] = useState("");

  const [expensePaymentMethod, setExpensePaymentMethod] = useState("Μετρητά");
  const [expenseBankWallet, setExpenseBankWallet] = useState("Alpha Bank");

  // income fields
  const [incomeSource, setIncomeSource] = useState("Μισθός"); // Μισθός | Άλλο
  const [incomeSourceOther, setIncomeSourceOther] = useState("");
  const [incomeReceiptMethod, setIncomeReceiptMethod] = useState(DEFAULT_BANK_WALLETS[0] || "Alpha Bank"); // use bank list

  // adders for household settings (single shared list)
  const [addBankWalletOpen, setAddBankWalletOpen] = useState(false);
  const [newBankWallet, setNewBankWallet] = useState("");

  const [notes, setNotes] = useState("");

  // ✅ invite link auto-fill (?invite=...)
  useEffect(() => {
  const inv = getInviteFromURL();
  if (!inv) return;
  setInviteFromLink(inv);
  setJoinInviteCode((prev) => (prev ? prev : inv));
  setFixInvite((prev) => (prev ? prev : inv));
  setAuthMode("register");
}, []);

  // auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);
      setHouseholdId(null);
      setHouseholdInvite("");
      setTransactions([]);
      setEditingId(null);
      setAuthError("");
      setFixError("");
      setInviteEditError("");
      setInviteEditOpen(false);

      if (!u) return;

      const hid = await loadUserHouseholdId(u.uid);

if (hid) {
  try {
    await ensureMembership({
          uid: u.uid,
          householdId: hid,
          displayName: u.displayName,
          email: u.email,
        });
  } catch {
    // δεν μπλοκάρουμε το login αν κάτι πάει στραβά εδώ
  }
}

setHouseholdId(hid || null);
    });

    return () => unsub();
  }, []);

  // load household meta + settings
  useEffect(() => {
    if (!user || !householdId) return;

    (async () => {
      setLoadingHouseholdMeta(true);
      try {
        const hSnap = await getDoc(doc(db, "households", householdId));
        const inv = hSnap.exists() ? hSnap.data()?.inviteCodeLower || "" : "";
        setHouseholdInvite(typeof inv === "string" ? inv : "");
        setInviteDraft(typeof inv === "string" ? inv : "");

        const settings = await loadHouseholdSettings(householdId);
        setBankWallets(settings.bankWallets);

        // ensure defaults for selects
        setExpenseBankWallet((prev) =>
          settings.bankWallets.includes(prev) ? prev : settings.bankWallets[0] || "Alpha Bank"
        );
        setIncomeReceiptMethod((prev) =>
          settings.bankWallets.includes(prev) ? prev : settings.bankWallets[0] || "Alpha Bank"
        );
      } catch {
        setHouseholdInvite("");
      } finally {
        setLoadingHouseholdMeta(false);
      }
    })();
  }, [user, householdId]);

  // realtime household members (for dropdown)
  useEffect(() => {
    if (!user || !householdId) return;

    const q = query(collection(db, "households", householdId, "members"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMembers(list);

        // default selection: current user
        if (!txMemberUid) setTxMemberUid(user.uid);
      },
      (err) => console.error("members onSnapshot error:", err)
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, householdId]);

  // realtime transactions
  useEffect(() => {
    if (!user || !householdId) return;

    const q = query(
      collection(db, "households", householdId, "transactions"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("onSnapshot error:", err)
    );

    return () => unsub();
  }, [user, householdId]);

  function resetForm() {
    setEditingId(null);
    setDate(getToday());
    setType("expense");
    setAmount("");

    setExpenseMainCategory("Ψώνια");
    setExpenseSubCategory("Σούπερ Μάρκετ");
    setExpenseSubCategory2("");
    setExpenseOtherText("");
    setExpensePaymentMethod("Μετρητά");
    setExpenseBankWallet(bankWallets[0] || "Alpha Bank");

    setIncomeSource("Μισθός");
    setIncomeSourceOther("");
    setIncomeReceiptMethod(bankWallets[0] || "Alpha Bank");

    setTxMemberUid(user?.uid || "");

    setNotes("");
  }

  // ✅ Keep fields consistent when switching type
  useEffect(() => {
    if (type === "income") {
      if (!incomeReceiptMethod && bankWallets.length) setIncomeReceiptMethod(bankWallets[0]);
    } else {
      if (!expenseBankWallet && bankWallets.length) setExpenseBankWallet(bankWallets[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  async function handleAuth(e) {
    e.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setBusy(true);

    try {
      if (!email || !password) throw new Error("Συμπλήρωσε email και κωδικό.");

      if (authMode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
        return;
      }

      // register
      if (password2 !== password) throw new Error("Οι κωδικοί δεν ταιριάζουν.");

      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const name = displayName.trim();
      if (name) await updateProfile(cred.user, { displayName: name });

      const inviteInput = normalizeInviteCode(joinInviteCode);

      if (inviteInput) {
        if (!isValidInviteCode(inviteInput)) {
          throw new Error("Το Invite code δεν είναι έγκυρο (γράμματα/αριθμοί/παύλες).");
        }
        const hid = await resolveHouseholdIdByInviteCode(inviteInput);
        if (!hid) throw new Error("Το Invite code δεν βρέθηκε.");

        await setUserHouseholdId(cred.user.uid, hid);
        await ensureMembership({
          uid: cred.user.uid,
          householdId: hid,
          displayName: name,
          email: cred.user.email,
        });
        setHouseholdId(hid);
      } else {
        const { householdId: hid } = await createHouseholdWithInvite({
          uid: cred.user.uid,
          displayName: name || "home",
        });
        setHouseholdId(hid);
      }
    } catch (err) {
      setAuthError(firebaseErrorToGreek(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
  setAuthError("");
  setAuthNotice("");

  const mail = (email || "").trim();
  if (!mail) {
    setAuthError("Γράψε πρώτα το email σου και μετά πάτα «Ξέχασα τον κωδικό μου».");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, mail);
    setAuthNotice("Σου στείλαμε email επαναφοράς κωδικού. Έλεγξε και τα Ανεπιθύμητα (Spam).");
  } catch (e) {
    const msg =
      e?.code === "auth/user-not-found"
        ? "Δεν βρέθηκε χρήστης με αυτό το email."
        : e?.code === "auth/invalid-email"
        ? "Το email δεν είναι σωστό."
        : "Αποτυχία αποστολής email επαναφοράς. Δοκίμασε ξανά.";
    setAuthError(msg);
  }
}

  async function handleLogout() {
    await signOut(auth);
    setEmail("");
    setPassword("");
    setPassword2("");
    setDisplayName("");
    setJoinInviteCode(getInviteFromURL() || "");
    setFixInvite(getInviteFromURL() || "");
    setAuthMode(getInviteFromURL() ? "register" : "login");
    setShowPassLogin(false);
    setShowPassRegister(false);
    setShowPassRegister2(false);
  }

  async function handleCreateHouseholdNow() {
    if (!user) return;
    setFixError("");
    setBusy(true);
    try {
      const { householdId: hid } = await createHouseholdWithInvite({
        uid: user.uid,
        displayName: user.displayName || "home",
      });
      setHouseholdId(hid);
    } catch (err) {
      setFixError(firebaseErrorToGreek(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleJoinHouseholdNow() {
    if (!user) return;
    setFixError("");
    setBusy(true);

    try {
      const code = normalizeInviteCode(fixInvite);
      if (!code) throw new Error("Βάλε Invite code.");
      if (!isValidInviteCode(code)) {
        throw new Error("Μη έγκυρο Invite code (γράμματα/αριθμοί/παύλες).");
      }

      const hid = await resolveHouseholdIdByInviteCode(code);
      if (!hid) throw new Error("Το Invite code δεν βρέθηκε.");

      await setUserHouseholdId(user.uid, hid);
      await ensureMembership({
        uid: user.uid,
        householdId: hid,
        displayName: user.displayName,
        email: user.email,
      });
      setHouseholdId(hid);
    } catch (err) {
      setFixError(firebaseErrorToGreek(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveInviteCodeChange() {
    if (!user || !householdId) return;

    setInviteEditError("");
    setBusy(true);

    try {
      const nextCode = normalizeInviteCode(inviteDraft);

      if (!isValidInviteCode(nextCode)) {
        throw new Error(
          "Invite code: 3–32 χαρακτ., μόνο γράμματα/αριθμοί/παύλες (π.χ. petroulis-family)."
        );
      }

      await runTransaction(db, async (tx) => {
        const householdRef = doc(db, "households", householdId);
        const householdSnap = await tx.get(householdRef);
        if (!householdSnap.exists()) throw new Error("Δεν βρέθηκε household.");

        const oldCode = String(householdSnap.data()?.inviteCodeLower || "");
        const nextInviteRef = doc(db, "inviteCodes", nextCode);

        const nextSnap = await tx.get(nextInviteRef);
        if (nextSnap.exists()) {
          const existingHid = nextSnap.data()?.householdId;
          if (existingHid && existingHid !== householdId) {
            throw new Error("Αυτό το Invite code χρησιμοποιείται ήδη.");
          }
        }

        tx.set(nextInviteRef, {
          householdId,
          createdByUid: user.uid,
          createdAt: serverTimestamp(),
        });

        tx.update(householdRef, {
          inviteCode: nextCode,
          inviteCodeLower: nextCode,
          inviteUpdatedAt: serverTimestamp(),
          inviteUpdatedBy: user.uid,
        });

        if (oldCode && oldCode !== nextCode) {
          tx.delete(doc(db, "inviteCodes", oldCode));
        }
      });

      setHouseholdInvite(normalizeInviteCode(inviteDraft));
      setInviteEditOpen(false);
    } catch (err) {
      setInviteEditError(firebaseErrorToGreek(err));
    } finally {
      setBusy(false);
    }
  }

  function inviteLink() {
    const code = householdInvite || "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/?invite=${encodeURIComponent(code)}`;
  }

  // ✅ Fix: buttons were disabled because householdInvite was empty until household doc read.
  // Now: allow clicking if householdId exists; we fetch invite if missing.
  async function ensureInviteLoaded() {
    if (householdInvite) return householdInvite;
    if (!householdId) return "";
    try {
      const snap = await getDoc(doc(db, "households", householdId));
      const inv = snap.exists() ? snap.data()?.inviteCodeLower || "" : "";
      if (inv) setHouseholdInvite(inv);
      return inv || "";
    } catch {
      return "";
    }
  }

  async function copyCode() {
    const code = await ensureInviteLoaded();
    if (!code) return alert("Δεν βρέθηκε invite code ακόμα.");
    try {
      await navigator.clipboard?.writeText(code);
      alert("Αντιγράφηκε το invite code ✅");
    } catch {
      alert(code);
    }
  }

  async function copyInviteLink() {
    const code = await ensureInviteLoaded();
    if (!code) return alert("Δεν βρέθηκε invite code ακόμα.");
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/?invite=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard?.writeText(link);
      alert("Αντιγράφηκε το invite link ✅");
    } catch {
      alert(link);
    }
  }

  async function handleAddBankWallet() {
    if (!user || !householdId) return;
    const v = String(newBankWallet || "").trim();
    if (!v) return;

    setBusy(true);
    try {
      await addBankWallet({ householdId, uid: user.uid, value: v });
      const settings = await loadHouseholdSettings(householdId);
      setBankWallets(settings.bankWallets);

      // set the new value to whichever dropdown is active
      if (type === "income") setIncomeReceiptMethod(v);
      else setExpenseBankWallet(v);

      setNewBankWallet("");
      setAddBankWalletOpen(false);
    } catch (err) {
      alert(firebaseErrorToGreek(err));
    } finally {
      setBusy(false);
    }
  }

  function normalizeAmountInput(val) {
    return String(val || "").replace(",", ".");
  }

  // When should we show bank/wallet dropdown for expense?
  const expenseNeedsBank =
    expensePaymentMethod === "Χρεωστική κάρτα" ||
    expensePaymentMethod === "Πιστωτική κάρτα" ||
    expensePaymentMethod === "Λογαριασμός Τράπεζας";

  function buildTxPayload() {
  const numericAmount = parseFloat(normalizeAmountInput(amount));
  if (!date) return { ok: false, message: "Συμπλήρωσε ημερομηνία." };
  if (isNaN(numericAmount) || numericAmount <= 0)
    return { ok: false, message: "Το ποσό πρέπει να είναι θετικός αριθμός." };

  const memberUid = (txMemberUid || user?.uid || "").trim();
  if (!memberUid) return { ok: false, message: "Διάλεξε μέλος νοικοκυριού." };

  if (type === "income") {
    const src =
  incomeSource === "Άλλο"
    ? (incomeSourceOther || "").trim()
    : (incomeSource || "Μισθός");

    if (incomeSource === "Άλλο" && !src) {
      return { ok: false, message: "Γράψε την “πηγή εσόδου”." };
    }
    if (!incomeReceiptMethod) {
      return { ok: false, message: "Διάλεξε “τρόπο λήψης εσόδου”." };
    }

    return {
      ok: true,
      payload: {
        date,
        month: asYYYYMM(date),
        type: "income",
        amount: numericAmount,

        memberUid,

        // legacy display fields
        category: incomeReceiptMethod,
        paymentMethod: incomeSource || "Μισθός",

        // new fields
        incomeSource,
        incomeSourceOther: incomeSource === "Άλλο" ? src : "",
        incomeReceiptMethod,

        // expense-only fields
        expenseCategoryOther: "",
        expenseBankWallet: "",
        expensePaymentMethod: "",

        notes: (notes || "").trim(),
        updatedAt: serverTimestamp(),
      },
    };
  }

    // expense
  const main = (expenseMainCategory || "").trim();
  if (!main) return { ok: false, message: "Διάλεξε κατηγορία εξόδου." };

  const sub1Options = getExpenseSub1Options(main);
  const sub1 = (expenseSubCategory || "").trim();

  if (sub1Options.length > 0 && !sub1) {
    return { ok: false, message: "Διάλεξε υποκατηγορία." };
  }

  const sub2Options = getExpenseSub2Options(main, sub1);
  const sub2 = (expenseSubCategory2 || "").trim();

  if (sub2Options.length > 0 && !sub2) {
    return { ok: false, message: "Διάλεξε επιλογή (3ο επίπεδο)." };
  }

  const otherText = (expenseOtherText || "").trim();
  const needsOther = isExpenseOtherSelection(main, sub1, sub2);

  if (needsOther && !otherText) {
    return { ok: false, message: 'Γράψε τι είναι το "Άλλα".' };
  }

  const path = buildExpenseCategoryPath({
    main,
    sub1: sub1Options.length ? sub1 : "",
    sub2: sub2Options.length ? sub2 : "",
    otherText,
  });

  if (expenseNeedsBank && !expenseBankWallet) {
    return { ok: false, message: "Διάλεξε τράπεζα/wallet." };
  }

  return {
    ok: true,
    payload: {
      date,
      month: asYYYYMM(date),
      type: "expense",
      amount: numericAmount,

      memberUid,

      // legacy (κρατάμε main για να δουλεύουν τα παλιά)
      category: main,
      paymentMethod: expensePaymentMethod,

      // νέα πεδία κατηγοριοποίησης
      expenseMainCategory: main,
      expenseSubCategory: sub1Options.length ? sub1 : "",
      expenseSubCategory2: sub2Options.length ? sub2 : "",
      expenseOtherText: needsOther ? otherText : "",
      expenseCategoryPath: path,

      // payment
      expensePaymentMethod,
      expenseBankWallet: expenseNeedsBank ? expenseBankWallet : "",

      // compatibility
      expenseCategoryOther: (expenseOtherText || "").trim(),

      // income-only fields
      incomeSource: "",
      incomeSourceOther: "",
      incomeReceiptMethod: "",

      notes: (notes || "").trim(),
      updatedAt: serverTimestamp(),
    },
  };


  if (expenseNeedsBank && !expenseBankWallet) {
    return { ok: false, message: "Διάλεξε τράπεζα/wallet." };
  }

  return {
    ok: true,
    payload: {
      date,
      month: asYYYYMM(date),
      type: "expense",
      amount: numericAmount,

      memberUid,

      category: expenseCategory,
      paymentMethod: expensePaymentMethod,
      
      // new fields
      expensePaymentMethod,
      expenseBankWallet: expenseNeedsBank ? expenseBankWallet : "",
      expenseCategoryOther: (expenseOtherText || "").trim(),

      // income-only fields
      incomeSource: "",
      incomeSourceOther: "",
      incomeReceiptMethod: "",

      notes: (notes || "").trim(),
      updatedAt: serverTimestamp(),
    },
  };
}

  async function handleSaveTransaction(e) {
    e.preventDefault();
    if (!user || !householdId) return;

    const built = buildTxPayload();
    if (!built.ok) return alert(built.message);

    try {
      setBusy(true);
      if (editingId) {
        await updateDoc(doc(db, "households", householdId, "transactions", editingId), built.payload);
      } else {
        await addDoc(collection(db, "households", householdId, "transactions"), {
          ...built.payload,
          createdAt: serverTimestamp(),
          createdByUid: user.uid,
        });
      }
      resetForm();
    } catch (err) {
      console.error(err);
      alert("Αποτυχία αποθήκευσης.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(t) {
    setTxMemberUid((t.memberUid || t.createdByUid || user?.uid || "").trim());
    setEditingId(t.id);

    const txType = t.type === "income" ? "income" : "expense";
    setType(txType);

    setDate(t.date || getToday());
    setAmount(String(t.amount ?? ""));

    if (txType === "income") {
      const src = t.incomeSource || t.paymentMethod || "Μισθός";
const isKnown = INCOME_SOURCES.includes(src);

setIncomeSource(isKnown ? src : "Άλλο");

if (src === "Άλλο") {
  setIncomeSourceOther((t.incomeSourceOther || "").trim());
} else if (!isKnown) {
  // αν βρεθεί “παλιά/άγνωστη” τιμή, τη βάζουμε ως “Άλλο”
  setIncomeSourceOther(String(src || "").trim());
} else {
  setIncomeSourceOther("");
}


      const rm = t.incomeReceiptMethod || t.category || bankWallets[0] || "Alpha Bank";
      setIncomeReceiptMethod(rm);

      // clear expense fields
      setExpenseMainCategory("Ψώνια");
      setExpenseSubCategory("Σούπερ Μάρκετ");
      setExpenseSubCategory2("");
      setExpenseOtherText("");
      setExpensePaymentMethod("Μετρητά");
      setExpenseBankWallet(bankWallets[0] || "Alpha Bank");
    } else {
            const main =
        (t.expenseMainCategory || t.category || "Ψώνια").trim();

      setExpenseMainCategory(main);

      const sub1Options = getExpenseSub1Options(main);
      const nextSub1 =
        (t.expenseSubCategory || (sub1Options[0] || "")).trim();

      setExpenseSubCategory(sub1Options.length ? nextSub1 : "");

      const sub2Options = getExpenseSub2Options(main, nextSub1);
      const nextSub2 =
        (t.expenseSubCategory2 || (sub2Options[0] || "")).trim();

      setExpenseSubCategory2(sub2Options.length ? nextSub2 : "");

      setExpenseOtherText((t.expenseOtherText || t.expenseCategoryOther || "").trim());

      setExpensePaymentMethod(t.expensePaymentMethod || t.paymentMethod || "Μετρητά");
      setExpenseBankWallet(t.expenseBankWallet || bankWallets[0] || "Alpha Bank");

      // clear income fields
      setIncomeSource("Μισθός");
      setIncomeSourceOther("");
      setIncomeReceiptMethod(bankWallets[0] || "Alpha Bank");
    }

    setNotes(t.notes || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id) {
    if (!user || !householdId) return;
    if (!confirm("Να διαγραφεί αυτή η κίνηση;")) return;

    try {
      setBusy(true);
      await deleteDoc(doc(db, "households", householdId, "transactions", id));
      if (editingId === id) resetForm();
    } catch (err) {
      console.error(err);
      alert("Αποτυχία διαγραφής.");
    } finally {
      setBusy(false);
    }
  }

  // Month options from all transactions
  const monthOptions = useMemo(() => {
    const s = new Set();
    transactions.forEach((t) => t?.date && s.add(asYYYYMM(t.date)));
    const months = Array.from(s).sort().reverse();
    if (!months.includes(selectedMonth)) months.unshift(selectedMonth);
    return months;
  }, [transactions, selectedMonth]);

  // Filtered transactions based on month OR range
  const filteredTransactions = useMemo(() => {
    if (filterMode === "range") {
      const start = rangeStart || "";
      const end = rangeEnd || "";
      return transactions.filter((t) => inRange(t?.date, start, end));
    }
    return transactions.filter((t) => t?.date && String(t.date).startsWith(selectedMonth));
  }, [transactions, selectedMonth, filterMode, rangeStart, rangeEnd]);

  const { incomeTotal, expenseTotal, netTotal } = useMemo(() => {
    let income = 0;
    let expense = 0;
    filteredTransactions.forEach((t) => {
      const amt = Number(t.amount || 0);
      if (t.type === "income") income += amt;
      else expense += amt;
    });
    return { incomeTotal: income, expenseTotal: expense, netTotal: income - expense };
  }, [filteredTransactions]);

  function humanMonthOrRangeTitle() {
    if (filterMode === "range") {
      const s = rangeStart || "…";
      const e = rangeEnd || "…";
      return `Εύρος: ${s} → ${e}`;
    }
    return `Μήνας: ${getMonthLabel(selectedMonth)}`;
  }

  function txTitle(t) {
    const txType = t.type === "income" ? "Έσοδο" : "Έξοδο";
    if (t.type === "income") {
      const receipt = t.incomeReceiptMethod || t.category || "—";
      return `${txType} – ${receipt}`;
    }
    const path =
  t.expenseCategoryPath ||
  (() => {
    const main = t.expenseMainCategory || t.category || "";
    const s1 = t.expenseSubCategory || "";
    const s2 = t.expenseSubCategory2 || "";
    const other = t.expenseOtherText || t.expenseCategoryOther || "";
    const parts = [main, s1, s2].filter(Boolean).join(" / ");
    if (other) return parts ? `${parts} / ${other}` : other;
    return parts || (t.category || "—");
  })();

return `${txType} – ${path}`;
  }

  function memberLabelFromState(uid) {
    const m = members.find((x) => x.uid === uid || x.id === uid);
    const name = (m?.displayName || "").trim();
    const mail = (m?.email || "").trim();
    if (name) return name;
    if (mail) return mail;
    return uid ? `Μέλος (${String(uid).slice(0, 6)}…)` : "—";
  }

  function txMethodLine(t) {
  const enteredBy = memberLabelFromState(t.createdByUid || t.memberUid || "");
const paidBy = memberLabelFromState(t.memberUid || t.createdByUid || "");

  if (t.type === "income") {
    const src =
  t.incomeSource === "Άλλο"
    ? `Άλλο: ${(t.incomeSourceOther || "").trim()}`
    : (t.incomeSource || "Μισθός");


    const receipt = t.incomeReceiptMethod || t.category || "";
    return `Πηγή: ${src}${receipt ? ` • Λήψη: ${receipt}` : ""}${
      paidBy ? ` • Μέλος: ${paidBy}` : ""
    }${enteredBy ? ` • Καταχώρηση: ${enteredBy}` : ""}`.trim();
  }

  const pm = t.expensePaymentMethod || t.paymentMethod || "";
  const needsBank =
    pm === "Χρεωστική κάρτα" || pm === "Πιστωτική κάρτα" || pm === "Λογαριασμός Τράπεζας";
  const bw = needsBank ? (t.expenseBankWallet || "") : "";

  return `${pm}${bw ? ` • ${bw}` : ""}${paidBy ? ` • Πληρωμή: ${paidBy}` : ""}${
    enteredBy ? ` • Καταχώρηση: ${enteredBy}` : ""
  }`.trim();
}

  function exportXLSX() {
  const rows = filteredTransactions
    .slice()
    .reverse()
    .map((t) => {
      if (t.type === "income") {
        const src =
  t.incomeSource === "Άλλο"
    ? (t.incomeSourceOther || "")
    : (t.incomeSource || "Μισθός");

        return {
          date: t.date || "",
          type: "income",
          amount: t.amount ?? "",
          income_source: src,
          income_receipt_method: t.incomeReceiptMethod || t.category || "",
          expense_payment_method: "",
          expense_bank_wallet: "",
          expense_category: "",
          expense_category_other: "",
          notes: (t.notes || "").replace(/\n/g, " "),
        };
      }

      const pm = t.expensePaymentMethod || t.paymentMethod || "";
      return {
        date: t.date || "",
        type: "expense",
        amount: t.amount ?? "",
        income_source: "",
        income_receipt_method: "",
        expense_payment_method: pm,
        expense_bank_wallet: t.expenseBankWallet || "",
        expense_category: t.expenseCategoryPath || t.category || "",
        expense_category_other: t.expenseOtherText || t.expenseCategoryOther || "",
        notes: (t.notes || "").replace(/\n/g, " "),
      };
    });

  const fileTag =
    filterMode === "range"
      ? `range_${rangeStart || "x"}_${rangeEnd || "x"}`
      : selectedMonth;

  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // ---------- Σύνοψη ----------
  const incomeTotal = rows.reduce(
    (sum, r) => (r.type === "income" ? sum + toNum(r.amount) : sum),
    0
  );
  const expenseTotal = rows.reduce(
    (sum, r) => (r.type === "expense" ? sum + toNum(r.amount) : sum),
    0
  );
  const net = incomeTotal - expenseTotal;

  // ---------- Κατηγορίες ----------
  const expenseByCategory = new Map();
  const incomeBySource = new Map();

  for (const r of rows) {
    if (r.type === "expense") {
      const key = (r.expense_category || "").trim() || "Χωρίς κατηγορία";
      expenseByCategory.set(key, (expenseByCategory.get(key) || 0) + toNum(r.amount));
    } else if (r.type === "income") {
      const key = (r.income_source || "").trim() || "Χωρίς πηγή";
      incomeBySource.set(key, (incomeBySource.get(key) || 0) + toNum(r.amount));
    }
  }

  const expenseCatRows = Array.from(expenseByCategory.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const incomeSrcRows = Array.from(incomeBySource.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  // ---------- Sheet: Κινήσεις (ΠΡΩΤΟ) ----------
  const greekHeader = [
    "Ημερομηνία",
    "Τύπος",
    "Ποσό (€)",
    "Πηγή εσόδου",
    "Τρόπος λήψης (έσοδο)",
    "Τρόπος πληρωμής (έξοδο)",
    "Τράπεζα/Πορτοφόλι (έξοδο)",
    "Κατηγορία εξόδου",
    "Άλλη κατηγορία εξόδου",
    "Σχόλια",
  ];

  const aoaMoves = [
    greekHeader,
    ...rows.map((r) => [
      r.date,
      r.type === "income" ? "Έσοδο" : "Έξοδο",
      r.amount === "" ? "" : toNum(r.amount),
      r.income_source,
      r.income_receipt_method,
      r.expense_payment_method,
      r.expense_bank_wallet,
      r.expense_category,
      r.expense_category_other,
      r.notes,
    ]),
  ];

  const wsMoves = XLSX.utils.aoa_to_sheet(aoaMoves);

  // Στήλες (να φαίνονται ωραία)
  wsMoves["!cols"] = [
    { wch: 12 }, // Ημερομηνία
    { wch: 10 }, // Τύπος
    { wch: 10 }, // Ποσό
    { wch: 24 }, // Πηγή εσόδου
    { wch: 22 }, // Τρόπος λήψης (έσοδο)
    { wch: 22 }, // Τρόπος πληρωμής (έξοδο)
    { wch: 26 }, // Τράπεζα/Πορτοφόλι (έξοδο)
    { wch: 20 }, // Κατηγορία εξόδου
    { wch: 22 }, // Άλλη κατηγορία εξόδου
    { wch: 45 }, // Σχόλια
  ];

  // AutoFilter στο header
  wsMoves["!autofilter"] = { ref: "A1:J1" };

  // (Προαιρετικό) Freeze 1η γραμμή (αν υποστηρίζεται από την έκδοση)
  wsMoves["!freeze"] = {
    xSplit: 0,
    ySplit: 1,
    topLeftCell: "A2",
    activePane: "bottomLeft",
    state: "frozen",
  };

  // ---------- Sheet: Σύνοψη ----------
  const wsSummary = XLSX.utils.aoa_to_sheet([
    ["Περίοδος", fileTag],
    ["Σύνολο Εσόδων (€)", incomeTotal],
    ["Σύνολο Εξόδων (€)", expenseTotal],
    ["Υπόλοιπο (Έσοδα - Έξοδα) (€)", net],
    [],
    ["Πλήθος κινήσεων", rows.length],
    ["Πλήθος εσόδων", rows.filter((r) => r.type === "income").length],
    ["Πλήθος εξόδων", rows.filter((r) => r.type === "expense").length],
  ]);
  wsSummary["!cols"] = [{ wch: 34 }, { wch: 22 }];

  // ---------- Sheet: Κατηγορίες ----------
  const wsCategories = XLSX.utils.aoa_to_sheet([
    ["Περίοδος", fileTag],
    [],
    ["Έξοδα ανά Κατηγορία", ""],
    ["Κατηγορία", "Σύνολο (€)"],
    ...expenseCatRows.map((x) => [x.name, x.total]),
    [],
    ["Έσοδα ανά Πηγή", ""],
    ["Πηγή", "Σύνολο (€)"],
    ...incomeSrcRows.map((x) => [x.name, x.total]),
  ]);
  wsCategories["!cols"] = [{ wch: 34 }, { wch: 16 }];

  // ---------- Workbook (σειρά tabs: Κινήσεις → Σύνοψη → Κατηγορίες) ----------
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMoves, "Κινήσεις");
  XLSX.utils.book_append_sheet(wb, wsSummary, "Σύνοψη");
  XLSX.utils.book_append_sheet(wb, wsCategories, "Κατηγορίες");

  XLSX.writeFile(wb, `exodologio_${fileTag}.xlsx`);
}


  const usingRegister = authMode === "register";

  return (
  <main className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-50 via-emerald-50/40 to-rose-50/40 text-slate-900">
    <EuroPatternBg />
    <InstallPWABar />

      <div className="relative mx-auto max-w-5xl px-4 py-5 sm:py-8 pb-24">
  <header className="mb-6 rounded-3xl border border-slate-200 bg-white/70 backdrop-blur shadow-sm">
    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center text-xl font-black shadow">
          €
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">
            Exodologio
          </div>
          <div className="text-sm text-slate-600">
            Κοινό έσοδα–έξοδα για εσένα και την οικογένεια, sync σε όλες τις συσκευές.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className={UI.badge}>PWA • Install στο κινητό</span>
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
          Cloud Sync
        </span>
      </div>
    </div>
  </header>

        {/* AUTH */}
        {!user ? (
          <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setAuthMode("login")}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  authMode === "login"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white"
                }`}
              >
                Login
              </button>
              <button
                onClick={() => setAuthMode("register")}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  authMode === "register"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white"
                }`}
              >
                Register
              </button>
            </div>

            <form onSubmit={handleAuth} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {usingRegister && (
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-sm font-medium">Όνομα (προαιρετικό)</label>
                  <input
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="π.χ. Πέτρος"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Email</label>
                <input
                  type="email"
                  autoComplete="email"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Κωδικός</label>
                <div className="flex gap-2">
                  <input
                    type={
                      usingRegister
                        ? showPassRegister
                          ? "text"
                          : "password"
                        : showPassLogin
                        ? "text"
                        : "password"
                    }
                    autoComplete={usingRegister ? "new-password" : "current-password"}
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <EyeButton
                    shown={usingRegister ? showPassRegister : showPassLogin}
                    onClick={() =>
                      usingRegister
                        ? setShowPassRegister((v) => !v)
                        : setShowPassLogin((v) => !v)
                    }
                  />
                </div>
              </div>

              {usingRegister && (
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-sm font-medium">Επιβεβαίωση κωδικού</label>
                  <div className="flex gap-2">
                    <input
                      type={showPassRegister2 ? "text" : "password"}
                      autoComplete="new-password"
                      className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      placeholder="••••••••"
                    />
                    <EyeButton
                      shown={showPassRegister2}
                      onClick={() => setShowPassRegister2((v) => !v)}
                    />
                  </div>
                </div>
              )}

              {usingRegister && (
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-sm font-medium">
                    Invite code (προαιρετικό) — για να μπεις στο ίδιο “σπίτι”
                  </label>
                  <input
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono"
                    value={joinInviteCode}
                    onChange={(e) => setJoinInviteCode(e.target.value)}
                    placeholder="π.χ. petroulis-family"
                  />
                  <p className="text-xs text-slate-500">
                    Επιτρέπονται γράμματα/αριθμοί/παύλες. Κεφαλαία επιτρέπονται αλλά αποθηκεύονται ως πεζά.
                    Αν το αφήσεις κενό, δημιουργείται νέο “σπίτι”.
                  </p>
                </div>
              )}

              {authError && (
                <div className="text-sm text-rose-700 md:col-span-2">{authError}</div>
              )}

              {authNotice && (
  <div className="text-sm text-emerald-700 md:col-span-2">{authNotice}</div>
)}

{authMode === "login" && (
  <div className="md:col-span-2 flex items-center justify-between">
    <button
      type="button"
      onClick={handleForgotPassword}
      className="text-sm text-slate-600 hover:text-slate-900 underline underline-offset-4"
    >
      Ξέχασα τον κωδικό μου
    </button>
  </div>
)}

              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "..." : authMode === "login" ? "Είσοδος" : "Δημιουργία λογαριασμού"}
                </button>
              </div>

              {inviteFromLink ? (
  <div className="md:col-span-2 mt-1 text-xs text-slate-500">
    Άνοιξες από invite link. Το invite έχει μπει αυτόματα στο πεδίο.
  </div>
) : null}
            </form>
          </section>
        ) : !householdId ? (
          <section className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Σύνδεση επιτυχής ✅</div>
                <div className="text-sm text-slate-600">Δεν βρέθηκε household στον λογαριασμό.</div>
                <div className="text-xs text-slate-500 mt-1">
                  Διάλεξε “Δημιουργία” ή “Σύνδεση με Invite code”.
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
              >
                Logout
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold">Δημιουργία νέου “σπιτιού”</div>
                <div className="text-xs text-slate-600 mt-1">Θα πάρεις Invite code για να το μοιραστείς.</div>
                <button
                  onClick={handleCreateHouseholdNow}
                  disabled={busy}
                  className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "..." : "Δημιουργία"}
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-sm font-semibold">Σύνδεση με Invite code</div>
                <input
                  className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono"
                  value={fixInvite}
                  onChange={(e) => setFixInvite(e.target.value)}
                  placeholder="π.χ. petroulis-family"
                />
                <div className="text-[11px] text-slate-500 mt-1">
                  Επιτρέπονται γράμματα/αριθμοί/παύλες (κεφαλαία → πεζά).
                </div>
                <button
                  onClick={handleJoinHouseholdNow}
                  disabled={busy}
                  className="mt-2 w-full rounded-xl border border-slate-900 bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
                >
                  {busy ? "..." : "Σύνδεση"}
                </button>
              </div>
            </div>

            {fixError && <div className="mt-3 text-sm text-rose-700">{fixError}</div>}
          </section>
        ) : (
          <>
            {/* HEADER CARD */}
            <section className="mb-5 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    Συνδεδεμένος: <span className="text-slate-700">{user.email}</span>
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    Invite code:{" "}
                    <span className="font-mono text-slate-900">
                      {loadingHouseholdMeta ? "..." : householdInvite || "(φόρτωση...)"}
                    </span>
                  </div>

                  {householdInvite ? (
                    <div className="text-[11px] text-slate-400 mt-1">
                      Invite link: <span className="font-mono">{inviteLink()}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    onClick={copyCode}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                  >
                    Αντιγραφή code
                  </button>

                  <button
                    onClick={copyInviteLink}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                  >
                    Αντιγραφή invite link
                  </button>

                  <button
                    onClick={() => setInviteEditOpen((v) => !v)}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                  >
                    Αλλαγή code
                  </button>

                  <button
                    onClick={handleLogout}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                  >
                    Logout
                  </button>
                </div>
              </div>

              {inviteEditOpen && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-sm font-semibold">Αλλαγή Invite code</div>
                  <div className="text-xs text-slate-600 mt-1">
                    Επιτρέπονται γράμματα/αριθμοί/παύλες (κεφαλαία → πεζά). Παράδειγμα:{" "}
                    <b>petroulis-family</b>
                  </div>

                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <input
                      className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono"
                      value={inviteDraft}
                      onChange={(e) => setInviteDraft(e.target.value)}
                      placeholder="π.χ. petroulis-family"
                    />
                    <button
                      onClick={saveInviteCodeChange}
                      disabled={busy}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {busy ? "..." : "Αποθήκευση"}
                    </button>
                  </div>

                  {inviteEditError && <div className="mt-2 text-sm text-rose-700">{inviteEditError}</div>}
                </div>
              )}
            </section>

            {/* FILTERS + SUMMARY */}
            <section className="mb-5 sm:mb-8 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Σύνοψη</h2>
                  <p className="text-xs text-slate-500">{humanMonthOrRangeTitle()}</p>
                </div>

                <div className="flex flex-col gap-2 sm:items-end">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterMode("month")}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                        filterMode === "month"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      Μήνας
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode("range")}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                        filterMode === "range"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      Εύρος ημερών
                    </button>

                    <button
                      onClick={exportXLSX}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Export Excel
                    </button>
                  </div>

                  {filterMode === "month" ? (
                    <div className="flex items-center gap-2">
                      <label htmlFor="month" className="text-sm font-medium whitespace-nowrap">
                        Μήνας:
                      </label>
                      <select
                        id="month"
                        className="w-full sm:w-auto rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                      >
                        {monthOptions.map((m) => (
                          <option key={m} value={m}>
                            {getMonthLabel(m)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium whitespace-nowrap">Από:</label>
                        <input
                          type="date"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                          value={rangeStart}
                          onChange={(e) => setRangeStart(e.target.value)}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm font-medium whitespace-nowrap">Έως:</label>
                        <input
                          type="date"
                          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                          value={rangeEnd}
                          onChange={(e) => setRangeEnd(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3">
                  <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Έσοδα</div>
                  <div className="mt-1 text-2xl font-bold text-emerald-900">{formatCurrency(incomeTotal)}</div>
                </div>
                <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3">
                  <div className="text-xs font-semibold text-rose-700 uppercase tracking-wide">Έξοδα</div>
                  <div className="mt-1 text-2xl font-bold text-rose-900">{formatCurrency(expenseTotal)}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Υπόλοιπο</div>
                  <div className={`mt-1 text-2xl font-bold ${netTotal >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {formatCurrency(netTotal)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Υπόλοιπο = Έσοδα − Έξοδα</div>
                </div>
              </div>
            </section>

            {/* NEW / EDIT TX */}
<section className="mt-8 mb-10 rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-md">
  {/* HEADER */}
  <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-3">
    <div className="flex items-center gap-3">
      <div className="h-11 w-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-lg font-bold">
        €
      </div>

      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg sm:text-xl font-semibold">
            {editingId ? "Επεξεργασία κίνησης" : "Νέα κίνηση"}
          </h2>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
              type === "income"
                ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                : "border-rose-300 bg-rose-500/20 text-rose-100"
            }`}
          >
            {type === "income" ? "Έσοδο" : "Έξοδο"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-200">
          Συμπλήρωσε τα στοιχεία της κίνησης και πάτα{" "}
          {editingId ? "«Αποθήκευση αλλαγών»" : "«Αποθήκευση κίνησης»"}.
        </p>
      </div>
    </div>

    {editingId && (
      <button
        type="button"
        onClick={resetForm}
        className="self-start md:self-auto rounded-2xl border border-white/40 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-50 hover:bg-white/15 transition"
      >
        Ακύρωση edit
      </button>
    )}
  </div>

  {/* BODY */}
<div className={`p-4 sm:p-6 ${type === "income" ? "bg-emerald-50" : "bg-rose-50"}`}>
    <form onSubmit={handleSaveTransaction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* Ημερομηνία */}
      <div
        className={`rounded-2xl bg-white/85 border p-3 shadow-sm flex flex-col gap-1 ${
          type === "income" ? "border-emerald-200" : "border-rose-200"
        }`}
      >
        <label className="text-sm font-medium text-slate-700">Ημερομηνία</label>
        <input
          type="date"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {/* Τύπος */}
      <div
        className={`rounded-2xl bg-white/85 border p-3 shadow-sm flex flex-col gap-1 ${
          type === "income" ? "border-emerald-200" : "border-rose-200"
        }`}
      >
        <label className="text-sm font-medium text-slate-700">Τύπος</label>
        <div
          className={`grid grid-cols-2 rounded-2xl border p-1 ${
            type === "income" ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"
          }`}
        >
          <button
            type="button"
            onClick={() => setType("income")}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              type === "income"
                ? "bg-white shadow text-emerald-700"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Έσοδο
          </button>
          <button
            type="button"
            onClick={() => setType("expense")}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              type === "expense"
                ? "bg-white shadow text-rose-700"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Έξοδο
          </button>
        </div>
      </div>

      {/* Ποσό */}
      <div
        className={`rounded-2xl bg-white/85 border p-3 shadow-sm flex flex-col gap-1 ${
          type === "income" ? "border-emerald-200" : "border-rose-200"
        }`}
      >
        <label className="text-sm font-medium text-slate-700">
          Ποσό (€) <span className="text-rose-600">*</span>
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            €
          </span>
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className="w-full rounded-xl border border-slate-200 bg-white pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <p className="text-[11px] text-slate-500">Υποχρεωτικό πεδίο.</p>
      </div>

      {/* filler for grid symmetry (optional) */}
      <div className="hidden md:block" />

      {/* INCOME / EXPENSE δυναμικό κομμάτι */}
      {type === "income" ? (
        <>
          {/* Πηγή εσόδου */}
          <div
            className={`rounded-2xl bg-white/85 border p-3 shadow-sm flex flex-col gap-1 ${
              type === "income" ? "border-emerald-200" : "border-rose-200"
            }`}
          >
            <label className="text-sm font-medium text-slate-700">Πηγή εσόδου</label>
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={incomeSource}
              onChange={(e) => setIncomeSource(e.target.value)}
            >
              <option value="Μισθός">Μισθός</option>
              <option value="Σύνταξη">Σύνταξη</option>
              <option value="Από Επενδύσεις">Από Επενδύσεις</option>
              <option value="Ενοίκιο">Ενοίκιο</option>
              <option value="Επιστροφή χρημάτων">Επιστροφή χρημάτων</option>
              <option value="Δώρο">Δώρο</option>
              <option value="Άλλο">Άλλο</option>
            </select>

            {incomeSource === "Άλλο" && (
              <input
                className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                placeholder="Γράψε την πηγή (π.χ. Bonus κτλ.)"
                value={incomeSourceOther}
                onChange={(e) => setIncomeSourceOther(e.target.value)}
              />
            )}
          </div>

          {/* Τρόπος λήψης εσόδου + μέλος + add wallet */}
          <div
            className={`rounded-2xl bg-white/85 border p-3 shadow-sm flex flex-col gap-1 ${
              type === "income" ? "border-emerald-200" : "border-rose-200"
            }`}
          >
            <label className="text-sm font-medium text-slate-700">Τρόπος λήψης εσόδου</label>
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={incomeReceiptMethod}
              onChange={(e) => setIncomeReceiptMethod(e.target.value)}
            >
              {bankWallets.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <div className="mt-3">
              <label className="text-sm font-medium text-slate-700">Μέλος νοικοκυριού</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={txMemberUid || user?.uid || ""}
                onChange={(e) => setTxMemberUid(e.target.value)}
              >
                {(members.length
                  ? members
                  : [{ id: user?.uid, uid: user?.uid, displayName: user?.displayName, email: user?.email }]
                )
                  .filter(Boolean)
                  .map((m) => {
                    const uid = m.uid || m.id;
                    const label =
                      (m.displayName || "").trim() ||
                      (m.email || "").trim() ||
                      `Μέλος (${String(uid).slice(0, 6)}...)`;
                    return (
                      <option key={uid} value={uid}>
                        {label}
                      </option>
                    );
                  })}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">Σε ποιο μέλος ανήκει/αφορά η κίνηση.</p>
            </div>

            <button
              type="button"
              onClick={() => setAddBankWalletOpen((v) => !v)}
              className="mt-2 inline-flex w-fit items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              + Πρόσθεσε τράπεζα / wallet
            </button>

            {addBankWalletOpen && (
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  placeholder='π.χ. "Alpha Bank", "Μετρητά στο χέρι", "Viva Wallet"'
                  value={newBankWallet}
                  onChange={(e) => setNewBankWallet(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleAddBankWallet}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "..." : "Αποθήκευση"}
                </button>
              </div>
            )}

            <p className="mt-1 text-[11px] text-slate-500">Αποθηκεύεται μόνο για το συγκεκριμένο νοικοκυριό.</p>
          </div>
        </>
      ) : (
        <>
                    {/* Κατηγορία + Υποκατηγορίες (tree) */}
          <div
            className={`rounded-2xl bg-white/85 border p-3 shadow-sm flex flex-col gap-3 ${
              type === "income" ? "border-emerald-200" : "border-rose-200"
            }`}
          >
            {/* 1) Main */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Κατηγορία</label>
              <select
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={expenseMainCategory}
                onChange={(e) => {
                  const nextMain = e.target.value;
                  setExpenseMainCategory(nextMain);

                  const sub1Opts = getExpenseSub1Options(nextMain);
                  const nextSub1 = sub1Opts[0] || "";
                  setExpenseSubCategory(sub1Opts.length ? nextSub1 : "");

                  const sub2Opts = getExpenseSub2Options(nextMain, nextSub1);
                  const nextSub2 = sub2Opts[0] || "";
                  setExpenseSubCategory2(sub2Opts.length ? nextSub2 : "");

                  setExpenseOtherText("");
                }}
              >
                {EXPENSE_CATEGORY_TREE.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 2) Sub1 */}
            {(() => {
              const sub1Opts = getExpenseSub1Options(expenseMainCategory);
              if (!sub1Opts.length) return null;

              return (
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700">Υποκατηγορία</label>
                  <select
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={expenseSubCategory}
                    onChange={(e) => {
                      const nextSub1 = e.target.value;
                      setExpenseSubCategory(nextSub1);

                      const sub2Opts = getExpenseSub2Options(expenseMainCategory, nextSub1);
                      const nextSub2 = sub2Opts[0] || "";
                      setExpenseSubCategory2(sub2Opts.length ? nextSub2 : "");

                      setExpenseOtherText("");
                    }}
                  >
                    {sub1Opts.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {/* 3) Sub2 */}
            {(() => {
              const sub2Opts = getExpenseSub2Options(expenseMainCategory, expenseSubCategory);
              if (!sub2Opts.length) return null;

              return (
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-slate-700">Επιλογή</label>
                  <select
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                    value={expenseSubCategory2}
                    onChange={(e) => {
                      setExpenseSubCategory2(e.target.value);
                      setExpenseOtherText("");
                    }}
                  >
                    {sub2Opts.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })()}

            {/* “Άλλα …” input όταν χρειάζεται */}
            {isExpenseOtherSelection(expenseMainCategory, expenseSubCategory, expenseSubCategory2) && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-slate-700">Άλλα</label>
                <input
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                  placeholder='Γράψε τι είναι το "Άλλα".'
                  value={expenseOtherText}
                  onChange={(e) => setExpenseOtherText(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Τρόπος πληρωμής (+ τράπεζα/wallet + μέλος) */}
          <div
            className={`rounded-2xl bg-white/85 border p-3 shadow-sm flex flex-col gap-1 ${
              type === "income" ? "border-emerald-200" : "border-rose-200"
            }`}
          >
            <label className="text-sm font-medium text-slate-700">Τρόπος πληρωμής</label>
            <select
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              value={expensePaymentMethod}
              onChange={(e) => setExpensePaymentMethod(e.target.value)}
            >
              {EXPENSE_PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {/* Μέλος νοικοκυριού (πάντα, όχι μόνο όταν χρειάζεται τράπεζα) */}
            <div className="mt-3">
              <label className="text-sm font-medium text-slate-700">Μέλος νοικοκυριού</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                value={txMemberUid || user?.uid || ""}
                onChange={(e) => setTxMemberUid(e.target.value)}
              >
                {(members.length
                  ? members
                  : [{ id: user?.uid, uid: user?.uid, displayName: user?.displayName, email: user?.email }]
                )
                  .filter(Boolean)
                  .map((m) => {
                    const uid = m.uid || m.id;
                    const label =
                      (m.displayName || "").trim() ||
                      (m.email || "").trim() ||
                      `Μέλος (${String(uid).slice(0, 6)}…)`;
                    return (
                      <option key={uid} value={uid}>
                        {label}
                      </option>
                    );
                  })}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">Σε ποιο μέλος ανήκει/αφορά η κίνηση.</p>
            </div>

            {expenseNeedsBank && (
              <div
                className={`mt-3 rounded-2xl border p-3 ${
                  type === "income" ? "border-emerald-200 bg-emerald-50/25" : "border-rose-200 bg-rose-50/25"
                }`}
              >
                <label className="text-sm font-medium text-slate-700">Τράπεζα / Wallet</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  value={expenseBankWallet}
                  onChange={(e) => setExpenseBankWallet(e.target.value)}
                >
                  {bankWallets.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setAddBankWalletOpen((v) => !v)}
                  className="mt-2 inline-flex w-fit items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  + Πρόσθεσε τράπεζα / wallet
                </button>

                {addBankWalletOpen && (
                  <div className="mt-2 flex flex-col sm:flex-row gap-2">
                    <input
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      placeholder='π.χ. "Viva Wallet", "Wise" κτλ.'
                      value={newBankWallet}
                      onChange={(e) => setNewBankWallet(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleAddBankWallet}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {busy ? "..." : "Αποθήκευση"}
                    </button>
                  </div>
                )}

                <p className="mt-2 text-[11px] text-slate-500">Αποθηκεύεται μόνο για το συγκεκριμένο νοικοκυριό.</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Σχόλια */}
      <div
        className={`md:col-span-2 rounded-2xl bg-white/85 border p-3 shadow-sm flex flex-col gap-1 ${
          type === "income" ? "border-emerald-200" : "border-rose-200"
        }`}
      >
        <label className="text-sm font-medium text-slate-700">Σχόλια (προαιρετικό)</label>
        <textarea
          rows={2}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          placeholder="π.χ. ΔΕΗ Νοεμβρίου, σχολικά είδη κτλ."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Κουμπιά */}
      <div className="md:col-span-2 flex flex-col sm:flex-row justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={resetForm}
          className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Καθαρισμός
        </button>
        <button
          type="submit"
          disabled={busy}
          className={`rounded-2xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 transition ${
            type === "income" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-900 hover:bg-slate-800"
          }`}
        >
          {busy ? "..." : editingId ? "Αποθήκευση αλλαγών" : "Αποθήκευση κίνησης"}
        </button>
      </div>
    </form>
  </div>
</section>

            {/* LIST */}
            <section className="mb-8 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-lg font-semibold">Κινήσεις ({filteredTransactions.length})</h2>
                  <p className="text-xs text-slate-500">{humanMonthOrRangeTitle()}</p>
                </div>
              </div>

              {filteredTransactions.length === 0 ? (
                <p className="text-sm text-slate-500">Δεν υπάρχουν κινήσεις για το φίλτρο που διάλεξες.</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                  {filteredTransactions.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold truncate">{txTitle(t)}</div>
                        <div
                          className={`shrink-0 font-extrabold ${
                            t.type === "income" ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {t.type === "income" ? "+" : "-"}
                          {formatCurrency(Number(t.amount || 0))}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2 mt-1">
                        <span>{t.date}</span>
                        <span>{txMethodLine(t)}</span>
                      </div>

                      {t.notes ? <div className="text-xs text-slate-700 mt-1 break-words">{t.notes}</div> : null}

                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => startEdit(t)}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="rounded-xl border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-700"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
