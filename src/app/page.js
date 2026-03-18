"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
const CASH_ACCOUNT = "Μετρητά";

const DEFAULT_EXPENSE_CATEGORY_TREE = [
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

function findExpenseMainNode(tree, main) {
  return (tree || []).find((x) => x.name === main) || null;
}
function findExpenseSub1Node(tree, main, sub1) {
  const m = findExpenseMainNode(tree, main);
  if (!m?.items) return null;
  return m.items.find((x) => x.name === sub1) || null;
}
function getExpenseSub1Options(tree, main) {
  const m = findExpenseMainNode(tree, main);
  if (!m || m.other) return [];
  return (m.items || []).map((x) => x.name);
}
function getExpenseSub2Options(tree, main, sub1) {
  const s1 = findExpenseSub1Node(tree, main, sub1);
  if (!s1?.items) return [];
  return (s1.items || []).map((x) => x.name);
}
function isExpenseOtherSelection(tree, main, sub1, sub2) {
  const m = findExpenseMainNode(tree, main);
  if (m?.other) return true;

  if (!sub1) return false;
  const s1 = findExpenseSub1Node(tree, main, sub1);
  if (s1?.other) return true;

  if (!sub2) return false;
  const s2 = (s1?.items || []).find((x) => x.name === sub2) || null;
  return !!s2?.other;
}
function buildExpenseCategoryPath(tree, { main, sub1, sub2, otherText }) {
  const parts = [main, sub1, sub2].filter(Boolean);
  let path = parts.join(" / ");
  if (isExpenseOtherSelection(tree, main, sub1, sub2)) {
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
  CASH_ACCOUNT, // ΠΑΝΤΑ μέσα
];

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

function getCurrentTimeHHMM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getTxDateTimeValue(t) {
  const d = String(t?.date || "");
  const tm = String(t?.time || "").trim();
  return `${d} ${tm || "00:00"}`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

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
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code) && code.length >= 3 && code.length <= 32;
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
const UI = {
  badge:
    "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700",
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
      <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-emerald-300/25 blur-3xl" />
      <div className="absolute -bottom-44 -right-40 h-[520px] w-[520px] rounded-full bg-rose-300/20 blur-3xl" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full bg-sky-300/15 blur-3xl" />

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

      <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/20 to-white/70" />
    </div>
  );
}

/** =========================
 *  Firestore helpers (households)
 *  ========================= */
function normalizeWallets(list) {
  const arr = Array.isArray(list) ? list.map((x) => String(x || "").trim()).filter(Boolean) : [];
  const s = new Set(arr);
  s.add(CASH_ACCOUNT);
  return Array.from(s);
}

function normalizeExpenseCategories(tree) {
  if (!Array.isArray(tree) || tree.length === 0) return DEFAULT_EXPENSE_CATEGORY_TREE;

  const cleanNode = (n) => {
    const name = String(n?.name || "").trim();
    if (!name) return null;
    const other = !!n?.other;
    const items = Array.isArray(n?.items) ? n.items.map(cleanNode).filter(Boolean) : undefined;

    const out = { name };
    if (other) out.other = true;
    if (items && items.length) out.items = items;
    return out;
  };

  const cleaned = tree.map(cleanNode).filter(Boolean);
  return cleaned.length ? cleaned : DEFAULT_EXPENSE_CATEGORY_TREE;
}

function ensureInOptions(options, value) {
  const v = String(value || "").trim();
  if (!v) return options || [];
  const arr = Array.isArray(options) ? options : [];
  return arr.includes(v) ? arr : [v, ...arr];
}

async function ensureMembership({ uid, householdId, displayName, email }) {
  const memberRef = doc(db, "households", householdId, "members", uid);
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

  const h = await addDoc(collection(db, "households"), {
    createdAt: serverTimestamp(),
    createdBy: uid,
    inviteCode: finalCode,
    inviteCodeLower: finalCode,
    inviteUpdatedAt: serverTimestamp(),
    inviteUpdatedBy: uid,
  });

  await ensureMembership({ uid, householdId: h.id, displayName, email: null });
  await setUserHouseholdId(uid, h.id);

  await setDoc(
    doc(db, "households", h.id, "meta", "settings"),
    {
      bankWallets: normalizeWallets(DEFAULT_BANK_WALLETS),
      expenseCategories: DEFAULT_EXPENSE_CATEGORY_TREE,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    },
    { merge: true }
  );

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
      bankWallets: normalizeWallets(DEFAULT_BANK_WALLETS),
      expenseCategories: DEFAULT_EXPENSE_CATEGORY_TREE,
    };
  }
  const data = snap.data() || {};
  return {
    bankWallets: normalizeWallets(data.bankWallets),
    expenseCategories: normalizeExpenseCategories(data.expenseCategories),
  };
}

async function addBankWallet({ householdId, uid, value }) {
  const v = String(value || "").trim();
  if (!v) return;

  const ref = doc(db, "households", householdId, "meta", "settings");
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const arr = normalizeWallets(data?.bankWallets || DEFAULT_BANK_WALLETS);
    const next = normalizeWallets([...arr, v]);
    tx.set(ref, { bankWallets: next, updatedAt: serverTimestamp(), updatedBy: uid }, { merge: true });
  });
}

function insertBeforeOther(list, node) {
  const arr = Array.isArray(list) ? [...list] : [];
  const idx = arr.findIndex((x) => x?.other);
  if (idx === -1) return [...arr, node];
  return [...arr.slice(0, idx), node, ...arr.slice(idx)];
}

async function updateExpenseCategories({ householdId, uid, updater }) {
  const ref = doc(db, "households", householdId, "meta", "settings");

  return await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : {};
    const current = normalizeExpenseCategories(data?.expenseCategories);

    const next = normalizeExpenseCategories(updater(current));

    tx.set(
      ref,
      {
        expenseCategories: next,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      },
      { merge: true }
    );

    return next;
  });
}

async function addExpenseMainCategory({ householdId, uid, name }) {
  const nm = String(name || "").trim();
  if (!nm) return null;

  return updateExpenseCategories({
    householdId,
    uid,
    updater: (tree) => {
      if (tree.some((x) => x.name === nm)) return tree;
      const node = { name: nm, items: [] };
      return insertBeforeOther(tree, node);
    },
  });
}

async function addExpenseSubCategory({ householdId, uid, mainName, subName }) {
  const main = String(mainName || "").trim();
  const sub = String(subName || "").trim();
  if (!main || !sub) return null;

  return updateExpenseCategories({
    householdId,
    uid,
    updater: (tree) => {
      const next = tree.map((m) => ({ ...m, items: Array.isArray(m.items) ? [...m.items] : m.items }));
      const mainNode = next.find((x) => x.name === main);
      if (!mainNode || mainNode.other) return next;

      const items = Array.isArray(mainNode.items) ? mainNode.items : [];
      if (items.some((x) => x.name === sub)) return next;

      const subNode = { name: sub, items: [] };
      mainNode.items = insertBeforeOther(items, subNode);
      return next;
    },
  });
}

async function addExpenseOption({ householdId, uid, mainName, subName, optionName }) {
  const main = String(mainName || "").trim();
  const sub = String(subName || "").trim();
  const opt = String(optionName || "").trim();
  if (!main || !sub || !opt) return null;

  return updateExpenseCategories({
    householdId,
    uid,
    updater: (tree) => {
      const next = tree.map((m) => ({ ...m, items: Array.isArray(m.items) ? [...m.items] : m.items }));
      const mainNode = next.find((x) => x.name === main);
      if (!mainNode || mainNode.other) return next;

      const subItems = Array.isArray(mainNode.items) ? mainNode.items : [];
      const subNode = subItems.find((x) => x.name === sub);
      if (!subNode || subNode.other) return next;

      const options = Array.isArray(subNode.items) ? subNode.items : [];
      if (options.some((x) => x.name === opt)) return next;

      subNode.items = insertBeforeOther(options, { name: opt });
      // φρόντισε να υπάρχει “Άλλα” στο τέλος
      if (!subNode.items.some((x) => x.other)) {
        subNode.items = [...subNode.items, { name: "Άλλα", other: true }];
      }

      return next;
    },
  });
}

async function deleteExpenseMainCategory({ householdId, uid, mainName }) {
  const main = String(mainName || "").trim();
  if (!main) return null;

  return updateExpenseCategories({
    householdId,
    uid,
    updater: (tree) => {
      return (tree || []).filter((x) => x.name !== main);
    },
  });
}

async function deleteExpenseSubCategory({ householdId, uid, mainName, subName }) {
  const main = String(mainName || "").trim();
  const sub = String(subName || "").trim();
  if (!main || !sub) return null;

  return updateExpenseCategories({
    householdId,
    uid,
    updater: (tree) => {
      return (tree || []).map((m) => {
        if (m.name !== main) return m;
        const items = Array.isArray(m.items) ? m.items.filter((x) => x.name !== sub) : [];
        return { ...m, items };
      });
    },
  });
}

async function deleteExpenseOption({ householdId, uid, mainName, subName, optionName }) {
  const main = String(mainName || "").trim();
  const sub = String(subName || "").trim();
  const opt = String(optionName || "").trim();
  if (!main || !sub || !opt) return null;

  return updateExpenseCategories({
    householdId,
    uid,
    updater: (tree) => {
      return (tree || []).map((m) => {
        if (m.name !== main) return m;

        const items = Array.isArray(m.items)
          ? m.items.map((s1) => {
              if (s1.name !== sub) return s1;
              const subItems = Array.isArray(s1.items) ? s1.items.filter((x) => x.name !== opt) : [];
              const cleanedSubItems =
                subItems.length === 1 && subItems[0]?.other ? [] : subItems;
              return { ...s1, items: cleanedSubItems };
            })
          : [];

        return { ...m, items };
      });
    },
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
  const [bankWallets, setBankWallets] = useState(normalizeWallets(DEFAULT_BANK_WALLETS));
  const [expenseCategories, setExpenseCategories] = useState(DEFAULT_EXPENSE_CATEGORY_TREE);

  // members (per household)
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

  const [summaryViewMode, setSummaryViewMode] = useState("period");
  const [txTypeFilter, setTxTypeFilter] = useState("all");

  // transactions
  const [transactions, setTransactions] = useState([]);

  // tx form
  const [editingId, setEditingId] = useState(null);
  const [date, setDate] = useState(getToday());
  const [time, setTime] = useState(getCurrentTimeHHMM());
  const [type, setType] = useState("expense"); // income | expense | transfer
  const [amount, setAmount] = useState("");

  const [timeHour, timeMinute] = String(time || "00:00").split(":");

  function updateTimeHour(nextHour) {
    const mm = String(timeMinute || "00").padStart(2, "0");
    setTime(`${String(nextHour).padStart(2, "0")}:${mm}`);
  }

  function updateTimeMinute(nextMinute) {
    const hh = String(timeHour || "00").padStart(2, "0");
    setTime(`${hh}:${String(nextMinute).padStart(2, "0")}`);
  }

  // expense fields
  const [expenseMainCategory, setExpenseMainCategory] = useState("Ψώνια");
  const [expenseSubCategory, setExpenseSubCategory] = useState("Σούπερ Μάρκετ");
  const [expenseSubCategory2, setExpenseSubCategory2] = useState("");
  const [expenseOtherText, setExpenseOtherText] = useState("");
  const [expensePaymentMethod, setExpensePaymentMethod] = useState("Μετρητά");
  const [expenseBankWallet, setExpenseBankWallet] = useState("Alpha Bank");

  // income fields
  const [incomeSource, setIncomeSource] = useState("Μισθός");
  const [incomeSourceOther, setIncomeSourceOther] = useState("");
  const [incomeReceiptMethod, setIncomeReceiptMethod] = useState("Alpha Bank");

  // transfer fields (Ανάληψη = Transfer από Τράπεζα προς Μετρητά)
  const [transferFromAccount, setTransferFromAccount] = useState("Alpha Bank");
  const [transferToAccount, setTransferToAccount] = useState(CASH_ACCOUNT);

  const [notes, setNotes] = useState("");

  // adders for household settings
  const [addBankWalletOpen, setAddBankWalletOpen] = useState(false);
  const [newBankWallet, setNewBankWallet] = useState("");

  // adders for expense categories (per household)
  const [addMainCatOpen, setAddMainCatOpen] = useState(false);
  const [newMainCat, setNewMainCat] = useState("");

  const [addSubCatOpen, setAddSubCatOpen] = useState(false);
  const [newSubCat, setNewSubCat] = useState("");

  const [addOptOpen, setAddOptOpen] = useState(false);
  const [newOpt, setNewOpt] = useState("");

  const [deleteMainCatOpen, setDeleteMainCatOpen] = useState(false);
  const [deleteSubCatOpen, setDeleteSubCatOpen] = useState(false);
  const [deleteOptOpen, setDeleteOptOpen] = useState(false);

  const dateInputRef = useRef(null);


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
        } catch {}
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
        const wallets = normalizeWallets(settings.bankWallets);
        setBankWallets(wallets);

        const cats = normalizeExpenseCategories(settings.expenseCategories);
        setExpenseCategories(cats);

        // Προαιρετικό αλλά πολύ χρήσιμο: αν το τρέχον selection δεν υπάρχει στο tree, γύρνα σε πρώτο διαθέσιμο
        const firstMain = cats[0]?.name || "Άλλα έξοδα";
        const mainOptions = cats.map((x) => x.name);
        const safeMain = mainOptions.includes(expenseMainCategory) ? expenseMainCategory : firstMain;

        const sub1Opts = getExpenseSub1Options(cats, safeMain);
        const safeSub1 = sub1Opts.includes(expenseSubCategory) ? expenseSubCategory : (sub1Opts[0] || "");

        const sub2Opts = getExpenseSub2Options(cats, safeMain, safeSub1);
        const safeSub2 = sub2Opts.includes(expenseSubCategory2) ? expenseSubCategory2 : (sub2Opts[0] || "");

        setExpenseMainCategory(safeMain);
        setExpenseSubCategory(sub1Opts.length ? safeSub1 : "");
        setExpenseSubCategory2(sub2Opts.length ? safeSub2 : "");

        // defaults για selects
        const firstNonCash = wallets.find((x) => x && x !== CASH_ACCOUNT) || wallets[0] || "Alpha Bank";

        setExpenseBankWallet((prev) => (wallets.includes(prev) ? prev : firstNonCash));
        setIncomeReceiptMethod((prev) => (wallets.includes(prev) ? prev : firstNonCash));
        setTransferFromAccount((prev) => (wallets.includes(prev) && prev !== CASH_ACCOUNT ? prev : firstNonCash));
        setTransferToAccount((prev) => (wallets.includes(prev) ? prev : CASH_ACCOUNT));
      } catch {
        setHouseholdInvite("");
      } finally {
        setLoadingHouseholdMeta(false);
      }
    })();
  }, [user, householdId]);

  // realtime household members
  useEffect(() => {
    if (!user || !householdId) return;

    const q1 = query(collection(db, "households", householdId, "members"));
    const unsub = onSnapshot(
      q1,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMembers(list);
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

    const q2 = query(collection(db, "households", householdId, "transactions"));
    const unsub = onSnapshot(
      q2,
      (snap) => setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.error("onSnapshot error:", err)
    );

    return () => unsub();
  }, [user, householdId]);

  function normalizeAmountInput(val) {
    return String(val || "").replace(",", ".");
  }

  // When should we show bank/wallet dropdown for expense?
  const expenseNeedsBank =
    expensePaymentMethod === "Χρεωστική κάρτα" ||
    expensePaymentMethod === "Πιστωτική κάρτα" ||
    expensePaymentMethod === "Λογαριασμός Τράπεζας";

  const transferAccounts = useMemo(() => normalizeWallets(bankWallets), [bankWallets]);

  // defaults όταν αλλάζει type
  useEffect(() => {
    const wallets = normalizeWallets(bankWallets);
    const firstNonCash = wallets.find((x) => x && x !== CASH_ACCOUNT) || wallets[0] || "Alpha Bank";

    if (type === "income") {
      if (!incomeReceiptMethod || !wallets.includes(incomeReceiptMethod)) setIncomeReceiptMethod(firstNonCash);
      return;
    }
    if (type === "transfer") {
      if (!transferFromAccount || !wallets.includes(transferFromAccount) || transferFromAccount === CASH_ACCOUNT) {
        setTransferFromAccount(firstNonCash);
      }
      if (!transferToAccount || !wallets.includes(transferToAccount)) {
        setTransferToAccount(CASH_ACCOUNT);
      }
      return;
    }
    // expense
    if (expenseNeedsBank) {
      if (!expenseBankWallet || !wallets.includes(expenseBankWallet)) setExpenseBankWallet(firstNonCash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  function resetForm() {
    const wallets = normalizeWallets(bankWallets);
    const firstNonCash = wallets.find((x) => x && x !== CASH_ACCOUNT) || wallets[0] || "Alpha Bank";

    setEditingId(null);
    setDate(getToday());
    setTime(getCurrentTimeHHMM());
    setType("expense");
    setAmount("");

    setExpenseMainCategory("Ψώνια");
    setExpenseSubCategory("Σούπερ Μάρκετ");
    setExpenseSubCategory2("");
    setExpenseOtherText("");
    setExpensePaymentMethod("Μετρητά");
    setExpenseBankWallet(firstNonCash);

    setIncomeSource("Μισθός");
    setIncomeSourceOther("");
    setIncomeReceiptMethod(firstNonCash);

    setTransferFromAccount(firstNonCash);
    setTransferToAccount(CASH_ACCOUNT);

    setTxMemberUid(user?.uid || "");
    setNotes("");
    setAddBankWalletOpen(false);
    setNewBankWallet("");
  }

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
        throw new Error("Invite code: 3–32 χαρακτ., μόνο γράμματα/αριθμοί/παύλες (π.χ. petroulis-family).");
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
      const wallets = normalizeWallets(settings.bankWallets);
      setBankWallets(wallets);

      const firstNonCash = wallets.find((x) => x && x !== CASH_ACCOUNT) || wallets[0] || "Alpha Bank";

      if (type === "income") setIncomeReceiptMethod(v);
      else if (type === "transfer") {
        setTransferFromAccount((prev) => (prev && prev !== CASH_ACCOUNT ? prev : firstNonCash));
        setTransferToAccount((prev) => prev || CASH_ACCOUNT);
      } else setExpenseBankWallet(v);

      setNewBankWallet("");
      setAddBankWalletOpen(false);
    } catch (err) {
      alert(firebaseErrorToGreek(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMainCategory() {
  if (!user || !householdId) return;
  const nm = String(newMainCat || "").trim();
  if (!nm) return;

  setBusy(true);
  try {
    const next = await addExpenseMainCategory({ householdId, uid: user.uid, name: nm });
    if (!next) return;

    setExpenseCategories(next);
    setExpenseMainCategory(nm);

    const sub1Opts = getExpenseSub1Options(next, nm);
    const s1 = sub1Opts[0] || "";
    setExpenseSubCategory(sub1Opts.length ? s1 : "");

    const sub2Opts = getExpenseSub2Options(next, nm, s1);
    const s2 = sub2Opts[0] || "";
    setExpenseSubCategory2(sub2Opts.length ? s2 : "");

    setNewMainCat("");
    setAddMainCatOpen(false);
  } catch (err) {
    alert(firebaseErrorToGreek(err));
  } finally {
    setBusy(false);
  }
}

async function handleAddSubCategory() {
  if (!user || !householdId) return;
  const nm = String(newSubCat || "").trim();
  if (!nm) return;

  const main = String(expenseMainCategory || "").trim();
  if (!main) return alert("Διάλεξε πρώτα Κατηγορία.");

  setBusy(true);
  try {
    const next = await addExpenseSubCategory({
      householdId,
      uid: user.uid,
      mainName: main,
      subName: nm,
    });
    if (!next) return;

    setExpenseCategories(next);
    setExpenseSubCategory(nm);

    const sub2Opts = getExpenseSub2Options(next, main, nm);
    const s2 = sub2Opts[0] || "";
    setExpenseSubCategory2(sub2Opts.length ? s2 : "");

    setNewSubCat("");
    setAddSubCatOpen(false);
  } catch (err) {
    alert(firebaseErrorToGreek(err));
  } finally {
    setBusy(false);
  }
}

async function handleAddOption() {
  if (!user || !householdId) return;
  const nm = String(newOpt || "").trim();
  if (!nm) return;

  const main = String(expenseMainCategory || "").trim();
  const sub = String(expenseSubCategory || "").trim();
  if (!main) return alert("Διάλεξε πρώτα Κατηγορία.");
  if (!sub) return alert("Διάλεξε πρώτα Υποκατηγορία.");

  setBusy(true);
  try {
    const next = await addExpenseOption({
      householdId,
      uid: user.uid,
      mainName: main,
      subName: sub,
      optionName: nm,
    });
    if (!next) return;

    setExpenseCategories(next);
    setExpenseSubCategory2(nm);

    setNewOpt("");
    setAddOptOpen(false);
  } catch (err) {
    alert(firebaseErrorToGreek(err));
  } finally {
    setBusy(false);
  }
}

async function handleDeleteMainCategory() {
  if (!user || !householdId) return;

  const main = String(expenseMainCategory || "").trim();
  if (!main) return alert("Διάλεξε πρώτα Κατηγορία.");

  if (!confirm(`Να διαγραφεί η κατηγορία "${main}";`)) return;

  setBusy(true);
  try {
    const next = await deleteExpenseMainCategory({
      householdId,
      uid: user.uid,
      mainName: main,
    });
    if (!next) return;

    setExpenseCategories(next);

    const nextMain = next[0]?.name || "";
    setExpenseMainCategory(nextMain);

    const sub1Opts = getExpenseSub1Options(next, nextMain);
    const nextSub1 = sub1Opts[0] || "";
    setExpenseSubCategory(sub1Opts.length ? nextSub1 : "");

    const sub2Opts = getExpenseSub2Options(next, nextMain, nextSub1);
    const nextSub2 = sub2Opts[0] || "";
    setExpenseSubCategory2(sub2Opts.length ? nextSub2 : "");

    setExpenseOtherText("");
    setDeleteMainCatOpen(false);
  } catch (err) {
    alert(firebaseErrorToGreek(err));
  } finally {
    setBusy(false);
  }
}

async function handleDeleteSubCategory() {
  if (!user || !householdId) return;

  const main = String(expenseMainCategory || "").trim();
  const sub = String(expenseSubCategory || "").trim();
  if (!main) return alert("Διάλεξε πρώτα Κατηγορία.");
  if (!sub) return alert("Διάλεξε πρώτα Υποκατηγορία.");

  if (!confirm(`Να διαγραφεί η υποκατηγορία "${sub}";`)) return;

  setBusy(true);
  try {
    const next = await deleteExpenseSubCategory({
      householdId,
      uid: user.uid,
      mainName: main,
      subName: sub,
    });
    if (!next) return;

    setExpenseCategories(next);

    const sub1Opts = getExpenseSub1Options(next, main);
    const nextSub1 = sub1Opts[0] || "";
    setExpenseSubCategory(sub1Opts.length ? nextSub1 : "");

    const sub2Opts = getExpenseSub2Options(next, main, nextSub1);
    const nextSub2 = sub2Opts[0] || "";
    setExpenseSubCategory2(sub2Opts.length ? nextSub2 : "");

    setExpenseOtherText("");
    setDeleteSubCatOpen(false);
  } catch (err) {
    alert(firebaseErrorToGreek(err));
  } finally {
    setBusy(false);
  }
}

async function handleDeleteOption() {
  if (!user || !householdId) return;

  const main = String(expenseMainCategory || "").trim();
  const sub = String(expenseSubCategory || "").trim();
  const opt = String(expenseSubCategory2 || "").trim();

  if (!main) return alert("Διάλεξε πρώτα Κατηγορία.");
  if (!sub) return alert("Διάλεξε πρώτα Υποκατηγορία.");
  if (!opt) return alert("Διάλεξε πρώτα Επιλογή.");

  if (!confirm(`Να διαγραφεί η επιλογή "${opt}";`)) return;

  setBusy(true);
  try {
    const next = await deleteExpenseOption({
      householdId,
      uid: user.uid,
      mainName: main,
      subName: sub,
      optionName: opt,
    });
    if (!next) return;

    setExpenseCategories(next);

    const sub2Opts = getExpenseSub2Options(next, main, sub);
    const nextSub2 = sub2Opts[0] || "";
    setExpenseSubCategory2(sub2Opts.length ? nextSub2 : "");

    setExpenseOtherText("");
    setDeleteOptOpen(false);
  } catch (err) {
    alert(firebaseErrorToGreek(err));
  } finally {
    setBusy(false);
  }
}


  function buildTxPayload() {
    const numericAmount = parseFloat(normalizeAmountInput(amount));
    if (!date) return { ok: false, message: "Συμπλήρωσε ημερομηνία." };
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return { ok: false, message: "Το ποσό πρέπει να είναι θετικός αριθμός." };
    }

    const memberUid = (txMemberUid || user?.uid || "").trim();
    if (!memberUid) return { ok: false, message: "Διάλεξε μέλος νοικοκυριού." };

    if (type === "transfer") {
      const from = String(transferFromAccount || "").trim();
      const to = String(transferToAccount || "").trim();
      if (!from || !to) return { ok: false, message: "Συμπλήρωσε «Από» και «Προς»." };
      if (from === to) return { ok: false, message: "Στη μεταφορά, «Από» και «Προς» δεν μπορούν να είναι ίδια." };

      // Ανάληψη = Bank -> Μετρητά (απλά label)
      const transferLabel =
        to === CASH_ACCOUNT && from !== CASH_ACCOUNT
          ? `Ανάληψη: ${from} → ${CASH_ACCOUNT}`
          : from === CASH_ACCOUNT && to !== CASH_ACCOUNT
          ? `Κατάθεση: ${CASH_ACCOUNT} → ${to}`
          : `Μεταφορά: ${from} → ${to}`;

      return {
        ok: true,
        payload: {
          date,
          time: String(time || "").trim() || getCurrentTimeHHMM(),
          month: asYYYYMM(date),
          type: "transfer",
          amount: numericAmount,

          memberUid,

          fromAccount: from,
          toAccount: to,

          // legacy display fields
          category: `${from} → ${to}`,
          paymentMethod: "Μεταφορά",
          transferLabel,

          // clear other types fields
          incomeSource: "",
          incomeSourceOther: "",
          incomeReceiptMethod: "",

          expenseMainCategory: "",
          expenseSubCategory: "",
          expenseSubCategory2: "",
          expenseOtherText: "",
          expenseCategoryPath: "",
          expensePaymentMethod: "",
          expenseBankWallet: "",
          expenseCategoryOther: "",

          notes: (notes || "").trim(),
          updatedAt: serverTimestamp(),
        },
      };
    }

    if (type === "income") {
      const src =
        incomeSource === "Άλλο" ? (incomeSourceOther || "").trim() : incomeSource || "Μισθός";

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
          time: String(time || "").trim() || getCurrentTimeHHMM(),
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

          // clear expense/transfer fields
          fromAccount: "",
          toAccount: "",
          transferLabel: "",

          expenseMainCategory: "",
          expenseSubCategory: "",
          expenseSubCategory2: "",
          expenseOtherText: "",
          expenseCategoryPath: "",
          expensePaymentMethod: "",
          expenseBankWallet: "",
          expenseCategoryOther: "",

          notes: (notes || "").trim(),
          updatedAt: serverTimestamp(),
        },
      };
    }

    // expense
    const main = String(expenseMainCategory || "").trim();
    if (!main) return { ok: false, message: "Διάλεξε κατηγορία εξόδου." };

    const sub1Options = getExpenseSub1Options(expenseCategories, main);
    const sub1 = String(expenseSubCategory || "").trim();

    if (sub1Options.length > 0 && !sub1) {
      return { ok: false, message: "Διάλεξε υποκατηγορία." };
    }

    const sub2Options = getExpenseSub2Options(expenseCategories, main, sub1);
    const sub2 = String(expenseSubCategory2 || "").trim();

    if (sub2Options.length > 0 && !sub2) {
      return { ok: false, message: "Διάλεξε Υπό-Υποκατηγορία." };
    }

    const otherText = String(expenseOtherText || "").trim();
    const needsOther = isExpenseOtherSelection(expenseCategories, main, sub1, sub2);
    if (needsOther && !otherText) {
      return { ok: false, message: 'Γράψε τι είναι το "Άλλα".' };
    }

    const path = buildExpenseCategoryPath(expenseCategories, {
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
        time: String(time || "").trim() || getCurrentTimeHHMM(),
        month: asYYYYMM(date),
        type: "expense",
        amount: numericAmount,

        memberUid,

        // legacy
        category: main,
        paymentMethod: expensePaymentMethod,

        // expense categorization
        expenseMainCategory: main,
        expenseSubCategory: sub1Options.length ? sub1 : "",
        expenseSubCategory2: sub2Options.length ? sub2 : "",
        expenseOtherText: needsOther ? otherText : "",
        expenseCategoryPath: path,

        // payment
        expensePaymentMethod,
        expenseBankWallet: expenseNeedsBank ? expenseBankWallet : "",

        // compatibility
        expenseCategoryOther: otherText,

        // clear income/transfer fields
        incomeSource: "",
        incomeSourceOther: "",
        incomeReceiptMethod: "",
        fromAccount: "",
        toAccount: "",
        transferLabel: "",

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
    setTxMemberUid(String(t.memberUid || t.createdByUid || user?.uid || "").trim());
    setEditingId(t.id);

    const txType = t.type === "income" ? "income" : t.type === "transfer" ? "transfer" : "expense";
    setType(txType);

    setDate(t.date || getToday());
    setTime(
      String(t.time || "").trim() ||
        (() => {
          const raw = t?.createdAt;
          if (raw?.seconds) {
            const d = new Date(raw.seconds * 1000);
            const hh = String(d.getHours()).padStart(2, "0");
            const mm = String(d.getMinutes()).padStart(2, "0");
            return `${hh}:${mm}`;
          }
          return getCurrentTimeHHMM();
        })()
    );
    setAmount(String(t.amount ?? ""));

    const wallets = normalizeWallets(bankWallets);
    const firstNonCash = wallets.find((x) => x && x !== CASH_ACCOUNT) || wallets[0] || "Alpha Bank";

    if (txType === "income") {
      const src = t.incomeSource || t.paymentMethod || "Μισθός";
      const isKnown = INCOME_SOURCES.includes(src);
      setIncomeSource(isKnown ? src : "Άλλο");
      if (src === "Άλλο") setIncomeSourceOther((t.incomeSourceOther || "").trim());
      else if (!isKnown) setIncomeSourceOther(String(src || "").trim());
      else setIncomeSourceOther("");

      const rm = t.incomeReceiptMethod || t.category || firstNonCash;
      setIncomeReceiptMethod(wallets.includes(rm) ? rm : firstNonCash);

      // clear expense fields
      setExpenseMainCategory("Ψώνια");
      setExpenseSubCategory("Σούπερ Μάρκετ");
      setExpenseSubCategory2("");
      setExpenseOtherText("");
      setExpensePaymentMethod("Μετρητά");
      setExpenseBankWallet(firstNonCash);

      // clear transfer
      setTransferFromAccount(firstNonCash);
      setTransferToAccount(CASH_ACCOUNT);
    } else if (txType === "transfer") {
      const from = String(t.fromAccount || "").trim() || firstNonCash;
      const to = String(t.toAccount || "").trim() || CASH_ACCOUNT;
      setTransferFromAccount(wallets.includes(from) && from !== CASH_ACCOUNT ? from : firstNonCash);
      setTransferToAccount(wallets.includes(to) ? to : CASH_ACCOUNT);

      // clear income/expense
      setIncomeSource("Μισθός");
      setIncomeSourceOther("");
      setIncomeReceiptMethod(firstNonCash);

      setExpenseMainCategory("Ψώνια");
      setExpenseSubCategory("Σούπερ Μάρκετ");
      setExpenseSubCategory2("");
      setExpenseOtherText("");
      setExpensePaymentMethod("Μετρητά");
      setExpenseBankWallet(firstNonCash);
    } else {
      const main = String(t.expenseMainCategory || t.category || "Ψώνια").trim();
      setExpenseMainCategory(main);

      const sub1Options = getExpenseSub1Options(expenseCategories, main);
      const nextSub1 = String(t.expenseSubCategory || sub1Options[0] || "").trim();
      setExpenseSubCategory(sub1Options.length ? nextSub1 : "");

      const sub2Options = getExpenseSub2Options(expenseCategories, main, nextSub1);
      const nextSub2 = String(t.expenseSubCategory2 || sub2Options[0] || "").trim();
      setExpenseSubCategory2(sub2Options.length ? nextSub2 : "");

      setExpenseOtherText(String(t.expenseOtherText || t.expenseCategoryOther || "").trim());

      setExpensePaymentMethod(t.expensePaymentMethod || t.paymentMethod || "Μετρητά");
      const bw = t.expenseBankWallet || firstNonCash;
      setExpenseBankWallet(wallets.includes(bw) ? bw : firstNonCash);

      // clear income fields
      setIncomeSource("Μισθός");
      setIncomeSourceOther("");
      setIncomeReceiptMethod(firstNonCash);

      // clear transfer
      setTransferFromAccount(firstNonCash);
      setTransferToAccount(CASH_ACCOUNT);
    }

    setNotes(t.notes || "");
    window.scrollTo({ top: 0, behavior: "smooth" });

    setTimeout(() => {
      dateInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });     
    }, 250);
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

  const monthOptions = useMemo(() => {
    const s = new Set();
    transactions.forEach((t) => t?.date && s.add(asYYYYMM(t.date)));
    const months = Array.from(s).sort().reverse();
    if (!months.includes(selectedMonth)) months.unshift(selectedMonth);
    return months;
  }, [transactions, selectedMonth]);

  const summaryTransactions = useMemo(() => {
    if (summaryViewMode === "all") {
      return transactions;
    }

    if (filterMode === "range") {
      const start = rangeStart || "";
      const end = rangeEnd || "";
      return transactions.filter((t) => inRange(t?.date, start, end));
    }

    return transactions.filter((t) => t?.date && String(t.date).startsWith(selectedMonth));
  }, [transactions, selectedMonth, filterMode, rangeStart, rangeEnd, summaryViewMode]);

  const filteredTransactions = useMemo(() => {
    let rows;

    if (summaryViewMode === "all") {
      rows = transactions;
    } else if (filterMode === "range") {
      const start = rangeStart || "";
      const end = rangeEnd || "";
      rows = transactions.filter((t) => inRange(t?.date, start, end));
    } else {
      rows = transactions.filter((t) => t?.date && String(t.date).startsWith(selectedMonth));
    }

    if (txTypeFilter !== "all") {
      rows = rows.filter((t) => t.type === txTypeFilter);
    }

    return [...rows].sort((a, b) => {
      const av = getTxDateTimeValue(a);
      const bv = getTxDateTimeValue(b);
      return bv.localeCompare(av);
    });
  }, [transactions, selectedMonth, filterMode, rangeStart, rangeEnd, txTypeFilter, summaryViewMode]);

  const { incomeTotal, expenseTotal, netTotal } = useMemo(() => {
    let totalIncomeAll = 0;
    let totalExpenseAll = 0;

    transactions.forEach((t) => {
      const amt = Number(t.amount || 0);
      if (t.type === "income") totalIncomeAll += amt;
      else if (t.type === "expense") totalExpenseAll += amt;
    });

    if (summaryViewMode === "all") {
      return {
        incomeTotal: totalIncomeAll,
        expenseTotal: totalExpenseAll,
        netTotal: totalIncomeAll - totalExpenseAll,
      };
    }

    let periodIncome = 0;
    let periodExpense = 0;

    summaryTransactions.forEach((t) => {
      const amt = Number(t.amount || 0);
      if (t.type === "income") periodIncome += amt;
      else if (t.type === "expense") periodExpense += amt;
    });

    let carryOverBalance = 0;

    if (filterMode === "month") {
      const monthStart = `${selectedMonth}-01`;

      transactions.forEach((t) => {
        const amt = Number(t.amount || 0);
        if (!t?.date || t.date >= monthStart) return;

        if (t.type === "income") carryOverBalance += amt;
        else if (t.type === "expense") carryOverBalance -= amt;
      });
    } else {
      const start = rangeStart || "";

      if (start) {
        transactions.forEach((t) => {
          const amt = Number(t.amount || 0);
          if (!t?.date || t.date >= start) return;

          if (t.type === "income") carryOverBalance += amt;
          else if (t.type === "expense") carryOverBalance -= amt;
        });
      }
    }

    return {
      incomeTotal: carryOverBalance + periodIncome,
      expenseTotal: periodExpense,
      netTotal: carryOverBalance + periodIncome - periodExpense,
    };
  }, [summaryTransactions, transactions, filterMode, selectedMonth, rangeStart, summaryViewMode]);

  function humanMonthOrRangeTitle() {
    if (summaryViewMode === "all") {
      return "Συνολικά από την έναρξη";
    }

    if (filterMode === "range") {
      const s = rangeStart || "…";
      const e = rangeEnd || "…";
      return `Εύρος: ${s} → ${e}`;
    }

    return `Μήνας: ${getMonthLabel(selectedMonth)}`;
  }

  function memberLabelFromState(uid) {
    const m = members.find((x) => x.uid === uid || x.id === uid);
    const name = (m?.displayName || "").trim();
    const mail = (m?.email || "").trim();
    if (name) return name;
    if (mail) return mail;
    return uid ? `Μέλος (${String(uid).slice(0, 6)}…)` : "—";
  }

  function txTitle(t) {
    if (t.type === "transfer") {
      const from = t.fromAccount || "";
      const to = t.toAccount || "";
      if (to === CASH_ACCOUNT && from && from !== CASH_ACCOUNT) return `Ανάληψη – ${from} → ${CASH_ACCOUNT}`;
      if (from === CASH_ACCOUNT && to && to !== CASH_ACCOUNT) return `Κατάθεση – ${CASH_ACCOUNT} → ${to}`;
      return `Μεταφορά – ${from || "—"} → ${to || "—"}`;
    }

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

  function txMethodLine(t) {
    const enteredBy = memberLabelFromState(t.createdByUid || t.memberUid || "");
    const paidBy = memberLabelFromState(t.memberUid || t.createdByUid || "");

    if (t.type === "transfer") {
      const from = t.fromAccount || "";
      const to = t.toAccount || "";
      return `Από: ${from} • Προς: ${to}${paidBy ? ` • Μέλος: ${paidBy}` : ""}${
        enteredBy ? ` • Καταχώρηση: ${enteredBy}` : ""
      }`.trim();
    }

    if (t.type === "income") {
      const src =
        t.incomeSource === "Άλλο"
          ? `Άλλο: ${(t.incomeSourceOther || "").trim()}`
          : t.incomeSource || "Μισθός";

      const receipt = t.incomeReceiptMethod || t.category || "";
      return `Πηγή: ${src}${receipt ? ` • Λήψη: ${receipt}` : ""}${paidBy ? ` • Μέλος: ${paidBy}` : ""}${
        enteredBy ? ` • Καταχώρηση: ${enteredBy}` : ""
      }`.trim();
    }

    const pm = t.expensePaymentMethod || t.paymentMethod || "";
    const needsBank = pm === "Χρεωστική κάρτα" || pm === "Πιστωτική κάρτα" || pm === "Λογαριασμός Τράπεζας";
    const bw = needsBank ? t.expenseBankWallet || "" : "";

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
            t.incomeSource === "Άλλο" ? t.incomeSourceOther || "" : t.incomeSource || "Μισθός";

          return {
            date: t.date || "",
            time: t.time || "",
            type: "income",
            amount: t.amount ?? "",
            income_source: src,
            income_receipt_method: t.incomeReceiptMethod || t.category || "",
            transfer_from: "",
            transfer_to: "",
            expense_payment_method: "",
            expense_bank_wallet: "",
            expense_category: "",
            expense_category_other: "",
            notes: (t.notes || "").replace(/\n/g, " "),
          };
        }

        if (t.type === "transfer") {
          return {
            date: t.date || "",
            time: t.time || "",
            type: "transfer",
            amount: t.amount ?? "",
            income_source: "",
            income_receipt_method: "",
            transfer_from: t.fromAccount || "",
            transfer_to: t.toAccount || "",
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
          time: t.time || "",
          type: "expense",
          amount: t.amount ?? "",
          income_source: "",
          income_receipt_method: "",
          transfer_from: "",
          transfer_to: "",
          expense_payment_method: pm,
          expense_bank_wallet: t.expenseBankWallet || "",
          expense_category: t.expenseCategoryPath || t.category || "",
          expense_category_other: t.expenseOtherText || t.expenseCategoryOther || "",
          notes: (t.notes || "").replace(/\n/g, " "),
        };
      });

    const fileTag =
      filterMode === "range" ? `range_${rangeStart || "x"}_${rangeEnd || "x"}` : selectedMonth;

    const toNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const incomeTotalX = rows.reduce((sum, r) => (r.type === "income" ? sum + toNum(r.amount) : sum), 0);
    const expenseTotalX = rows.reduce((sum, r) => (r.type === "expense" ? sum + toNum(r.amount) : sum), 0);
    const net = incomeTotalX - expenseTotalX;

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

    const greekHeader = [
      "Ημερομηνία",
      "Ώρα",
      "Τύπος",
      "Ποσό (€)",
      "Πηγή εσόδου",
      "Τρόπος λήψης (έσοδο)",
      "Από (μεταφορά)",
      "Προς (μεταφορά)",
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
        r.time || "",
        r.type === "income" ? "Έσοδο" : r.type === "expense" ? "Έξοδο" : "Μεταφορά",
        r.amount === "" ? "" : toNum(r.amount),
        r.income_source,
        r.income_receipt_method,
        r.transfer_from,
        r.transfer_to,
        r.expense_payment_method,
        r.expense_bank_wallet,
        r.expense_category,
        r.expense_category_other,
        r.notes,
      ]),
    ];

    const wsMoves = XLSX.utils.aoa_to_sheet(aoaMoves);

    wsMoves["!cols"] = [
      { wch: 12 }, // Ημερομηνία
      { wch: 8 },  // Ώρα
      { wch: 10 }, // Τύπος
      { wch: 10 }, // Ποσό
      { wch: 24 }, // Πηγή εσόδου
      { wch: 22 }, // Τρόπος λήψης
      { wch: 18 }, // Από
      { wch: 18 }, // Προς
      { wch: 22 }, // Τρόπος πληρωμής
      { wch: 26 }, // Τράπεζα/Πορτοφόλι
      { wch: 24 }, // Κατηγορία
      { wch: 22 }, // Άλλη κατηγορία
      { wch: 45 }, // Σχόλια
    ];

    wsMoves["!autofilter"] = { ref: "A1:M1" };
    wsMoves["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" };

    const wsSummary = XLSX.utils.aoa_to_sheet([
      ["Περίοδος", fileTag],
      ["Σύνολο Εσόδων (€)", incomeTotalX],
      ["Σύνολο Εξόδων (€)", expenseTotalX],
      ["Υπόλοιπο (Έσοδα - Έξοδα) (€)", net],
      [],
      ["Πλήθος κινήσεων", rows.length],
      ["Πλήθος εσόδων", rows.filter((r) => r.type === "income").length],
      ["Πλήθος εξόδων", rows.filter((r) => r.type === "expense").length],
      ["Πλήθος μεταφορών", rows.filter((r) => r.type === "transfer").length],
    ]);
    wsSummary["!cols"] = [{ wch: 34 }, { wch: 22 }];

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
                <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900">Exodologio</div>
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
                  authMode === "login" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
                }`}
              >
                Login
              </button>
              <button
                onClick={() => setAuthMode("register")}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  authMode === "register" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
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
                      usingRegister ? (showPassRegister ? "text" : "password") : showPassLogin ? "text" : "password"
                    }
                    autoComplete={usingRegister ? "new-password" : "current-password"}
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <EyeButton
                    shown={usingRegister ? showPassRegister : showPassLogin}
                    onClick={() => (usingRegister ? setShowPassRegister((v) => !v) : setShowPassLogin((v) => !v))}
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
                    <EyeButton shown={showPassRegister2} onClick={() => setShowPassRegister2((v) => !v)} />
                  </div>
                </div>
              )}

              {usingRegister && (
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-sm font-medium">Invite code (προαιρετικό) — για να μπεις στο ίδιο “σπίτι”</label>
                  <input
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono"
                    value={joinInviteCode}
                    onChange={(e) => setJoinInviteCode(e.target.value)}
                    placeholder="π.χ. petroulis-family"
                  />
                  <p className="text-xs text-slate-500">
                    Επιτρέπονται γράμματα/αριθμοί/παύλες. Κεφαλαία επιτρέπονται αλλά αποθηκεύονται ως πεζά. Αν το αφήσεις
                    κενό, δημιουργείται νέο “σπίτι”.
                  </p>
                </div>
              )}

              {authError && <div className="text-sm text-rose-700 md:col-span-2">{authError}</div>}
              {authNotice && <div className="text-sm text-emerald-700 md:col-span-2">{authNotice}</div>}

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
                <div className="text-xs text-slate-500 mt-1">Διάλεξε “Δημιουργία” ή “Σύνδεση με Invite code”.</div>
              </div>
              <button onClick={handleLogout} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">
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
                <div className="text-[11px] text-slate-500 mt-1">Επιτρέπονται γράμματα/αριθμοί/παύλες (κεφαλαία → πεζά).</div>
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
                  <button onClick={copyCode} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">
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
                    Επιτρέπονται γράμματα/αριθμοί/παύλες (κεφαλαία → πεζά). Παράδειγμα: <b>petroulis-family</b>
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

                    <button onClick={exportXLSX} className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                      Export Excel
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">Προβολή συνόψεων:</span>

                    <button
                      type="button"
                      onClick={() => setSummaryViewMode("period")}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold border transition ${
                        summaryViewMode === "period"
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      Περίοδος
                    </button>

                    <button
                      type="button"
                      onClick={() => setSummaryViewMode("all")}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold border transition ${
                        summaryViewMode === "all"
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      Συνολικά
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">Φίλτρο κινήσεων:</span>

                    <button
                      type="button"
                      onClick={() => setTxTypeFilter("all")}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold border transition ${
                        txTypeFilter === "all"
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      Όλα
                    </button>

                    <button
                      type="button"
                      onClick={() => setTxTypeFilter("income")}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold border transition ${
                        txTypeFilter === "income"
                          ? "bg-emerald-600 text-white border-emerald-600"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      Μόνο Έσοδα
                    </button>

                    <button
                      type="button"
                      onClick={() => setTxTypeFilter("expense")}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold border transition ${
                        txTypeFilter === "expense"
                          ? "bg-rose-600 text-white border-rose-600"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      Μόνο Έξοδα
                    </button>

                    <button
                      type="button"
                      onClick={() => setTxTypeFilter("transfer")}
                      className={`rounded-xl px-3 py-2 text-xs font-semibold border transition ${
                        txTypeFilter === "transfer"
                          ? "bg-sky-700 text-white border-sky-700"
                          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      Μόνο Μεταφορές
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
                  <div className="text-[11px] text-slate-500 mt-1">Υπόλοιπο = Έσοδα − Έξοδα (οι Μεταφορές δεν μετράνε)</div>
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
                      <h2 className="text-lg sm:text-xl font-semibold">{editingId ? "Επεξεργασία κίνησης" : "Νέα κίνηση"}</h2>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold border ${
                          type === "income"
                            ? "border-emerald-300 bg-emerald-500/20 text-emerald-100"
                            : type === "transfer"
                            ? "border-sky-300 bg-sky-500/20 text-sky-100"
                            : "border-rose-300 bg-rose-500/20 text-rose-100"
                        }`}
                      >
                        {type === "income" ? "Έσοδο" : type === "transfer" ? "Μεταφορά" : "Έξοδο"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-200">
                      Συμπλήρωσε τα στοιχεία της κίνησης και πάτα {editingId ? "«Αποθήκευση αλλαγών»" : "«Αποθήκευση κίνησης»"}.
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
              <div className={`p-4 sm:p-6 ${type === "income" ? "bg-emerald-50" : type === "transfer" ? "bg-sky-50" : "bg-rose-50"}`}>
                <form onSubmit={handleSaveTransaction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {/* Ημερομηνία */}
                  <div
                    className={`rounded-2xl bg-white/85 border p-3 shadow-sm flex flex-col gap-3 ${
                      type === "income" ? "border-emerald-200" : type === "transfer" ? "border-sky-200" : "border-rose-200"
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-slate-700">Ημερομηνία συναλλαγής</label>
                      <input
                        ref={dateInputRef}
                        type="date"
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                        <span>🕒</span>
                        <span>Ώρα συναλλαγής</span>
                      </label>

                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <select
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          value={timeHour || "00"}
                          onChange={(e) => updateTimeHour(e.target.value)}
                        >
                          {HOUR_OPTIONS.map((hh) => (
                            <option key={hh} value={hh}>
                              {hh}
                            </option>
                          ))}
                        </select>

                        <span className="text-sm font-semibold text-slate-500">:</span>

                        <select
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          value={timeMinute || "00"}
                          onChange={(e) => updateTimeMinute(e.target.value)}
                        >
                          {MINUTE_OPTIONS.map((mm) => (
                            <option key={mm} value={mm}>
                              {mm}
                            </option>
                          ))}
                        </select>
                      </div>

                      <p className="text-[11px] text-slate-500">Μορφή 24ώρου (HH:MM)</p>
                    </div>
                  </div>

                  {/* Τύπος */}
                  <div
                    className={`rounded-2xl bg-white/85 border p-3 shadow-sm flex flex-col gap-1 ${
                      type === "income" ? "border-emerald-200" : type === "transfer" ? "border-sky-200" : "border-rose-200"
                    }`}
                  >
                    <label className="text-sm font-medium text-slate-700">Τύπος</label>
                    <div className="grid grid-cols-3 rounded-2xl border p-1 border-slate-200 bg-slate-50/40">
                      <button
                        type="button"
                        onClick={() => setType("income")}
                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                          type === "income" ? "bg-white shadow text-emerald-700" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Έσοδο
                      </button>
                      <button
                        type="button"
                        onClick={() => setType("expense")}
                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                          type === "expense" ? "bg-white shadow text-rose-700" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Έξοδο
                      </button>
                      <button
                        type="button"
                        onClick={() => setType("transfer")}
                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                          type === "transfer" ? "bg-white shadow text-sky-700" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Μεταφορά
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2">
                      Ανάληψη = Μεταφορά από Τράπεζα προς Μετρητά (δεν μετράει στα έξοδα).
                    </p>
                  </div>

                  {/* Ποσό */}
                  <div
                    className={`rounded-2xl bg-white/85 border p-3 shadow-sm flex flex-col gap-1 ${
                      type === "income" ? "border-emerald-200" : type === "transfer" ? "border-sky-200" : "border-rose-200"
                    }`}
                  >
                    <label className="text-sm font-medium text-slate-700">
                      Ποσό (€) <span className="text-rose-600">*</span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
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

                  <div className="hidden md:block" />

                  {/* DYNAMIC PART */}
                  {type === "income" ? (
                    <>
                      <div className="rounded-2xl bg-white/85 border border-emerald-200 p-3 shadow-sm flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-700">Πηγή εσόδου</label>
                        <select
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          value={incomeSource}
                          onChange={(e) => setIncomeSource(e.target.value)}
                        >
                          {INCOME_SOURCES.map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
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

                      <div className="rounded-2xl bg-white/85 border border-emerald-200 p-3 shadow-sm flex flex-col gap-1">
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
                              : [{ id: user?.uid, uid: user?.uid, displayName: user?.displayName, email: user?.email }])
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
                              placeholder='π.χ. "Alpha Bank", "Viva Wallet"'
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
                  ) : type === "transfer" ? (
                    <>
                      <div className="rounded-2xl bg-white/85 border border-sky-200 p-3 shadow-sm flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-700">Μεταφορά</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                          <div>
                            <div className="text-xs font-semibold text-slate-600">Από</div>
                            <select
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                              value={transferFromAccount}
                              onChange={(e) => setTransferFromAccount(e.target.value)}
                            >
                              {transferAccounts
                                .filter((x) => x && x !== CASH_ACCOUNT)
                                .map((a) => (
                                  <option key={a} value={a}>
                                    {a}
                                  </option>
                                ))}
                            </select>
                            <p className="mt-1 text-[11px] text-slate-500">Για Ανάληψη: διάλεξε την Τράπεζα εδώ.</p>
                          </div>

                          <div>
                            <div className="text-xs font-semibold text-slate-600">Προς</div>
                            <select
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                              value={transferToAccount}
                              onChange={(e) => setTransferToAccount(e.target.value)}
                            >
                              {transferAccounts.map((a) => (
                                <option key={a} value={a}>
                                  {a}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-[11px] text-slate-500">Για Ανάληψη: διάλεξε «Μετρητά» εδώ.</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const wallets = normalizeWallets(bankWallets);
                              const firstNonCash =
                                wallets.find((x) => x && x !== CASH_ACCOUNT) || wallets[0] || "Alpha Bank";
                              setTransferFromAccount(firstNonCash);
                              setTransferToAccount(CASH_ACCOUNT);
                            }}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Γρήγορη Ανάληψη (Τράπεζα → Μετρητά)
                          </button>

                          <button
                            type="button"
                            onClick={() => setAddBankWalletOpen((v) => !v)}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            + Πρόσθεσε τράπεζα / wallet
                          </button>
                        </div>

                        {addBankWalletOpen && (
                          <div className="mt-2 flex flex-col sm:flex-row gap-2">
                            <input
                              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                              placeholder='π.χ. "Viva Wallet", "Wise"'
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

                        <p className="mt-2 text-[11px] text-slate-500">
                          Οι μεταφορές δεν επηρεάζουν το σύνολο εξόδων/εσόδων. Απλά μετακινούν χρήματα μεταξύ λογαριασμών.
                        </p>
                      </div>

                      <div className="rounded-2xl bg-white/85 border border-sky-200 p-3 shadow-sm flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-700">Μέλος νοικοκυριού</label>
                        <select
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                          value={txMemberUid || user?.uid || ""}
                          onChange={(e) => setTxMemberUid(e.target.value)}
                        >
                          {(members.length
                            ? members
                            : [{ id: user?.uid, uid: user?.uid, displayName: user?.displayName, email: user?.email }])
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
                    </>
                  ) : (
                    <>
                      {/* Κατηγορία + Υποκατηγορίες */}
                      <div className="rounded-2xl bg-white/85 border border-rose-200 p-3 shadow-sm flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-sm font-medium text-slate-700">Κατηγορία</label>
                          <select
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
                            value={expenseMainCategory}
                            onChange={(e) => {
                              const nextMain = e.target.value;
                              setExpenseMainCategory(nextMain);

                              const sub1Opts = getExpenseSub1Options(expenseCategories, nextMain);
                              const nextSub1 = sub1Opts[0] || "";
                              setExpenseSubCategory(sub1Opts.length ? nextSub1 : "");

                              const sub2Opts = getExpenseSub2Options(expenseCategories, nextMain, nextSub1);
                              const nextSub2 = sub2Opts[0] || "";
                              setExpenseSubCategory2(sub2Opts.length ? nextSub2 : "");

                              setExpenseOtherText("");
                            }}
                          >
                            {ensureInOptions(expenseCategories.map((x) => x.name), expenseMainCategory).map((name) => (
                              <option key={name} value={name}>
                                {name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {(() => {
                          const sub1Opts = ensureInOptions(getExpenseSub1Options(expenseCategories, expenseMainCategory), expenseSubCategory);
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

                                  const sub2Opts = getExpenseSub2Options(expenseCategories, expenseMainCategory, nextSub1);
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

                        {(() => {
                          const sub2Opts = ensureInOptions(
                            getExpenseSub2Options(expenseCategories, expenseMainCategory, expenseSubCategory),
                            expenseSubCategory2
                          );
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

                        {!addMainCatOpen &&
                        !addSubCatOpen &&
                        !addOptOpen &&
                        isExpenseOtherSelection(
                          expenseCategories,
                          expenseMainCategory,
                          expenseSubCategory,
                          expenseSubCategory2
                        ) && (
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
                         
                      <div className="rounded-2xl bg-white/85 border border-rose-200 p-3 shadow-sm flex flex-col gap-3 md:col-span-2">
                        <div className="text-xs font-semibold text-slate-700">Διαχείριση κατηγοριών (μόνο για αυτό το νοικοκυριό)</div>

                        <div className="mt-2 text-xs font-medium text-slate-600">
                          Για την προσθήκη Κατηγορίας/Υποκατηγορίας/Υπό-Υποκατηγορίας
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setAddMainCatOpen((v) => !v)}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            + Κατηγορία
                          </button>

                          <button
                            type="button"
                            onClick={() => setAddSubCatOpen((v) => !v)}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            + Υποκατηγορία
                          </button>

                          <button
                            type="button"
                            onClick={() => setAddOptOpen((v) => !v)}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            + Υπό-Υποκατηγορία
                          </button>
                        </div>

                        <div className="mt-3 text-xs font-medium text-slate-600">
                          Για τη διαγραφή Κατηγορίας/Υποκατηγορίας/Υπό-Υποκατηγορίας
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDeleteMainCatOpen((v) => !v)}
                            className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            - Κατηγορία
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteSubCatOpen((v) => !v)}
                            className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            - Υποκατηγορία
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteOptOpen((v) => !v)}
                            className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                          >
                            - Υπό-Υποκατηγορία
                          </button>
                        </div>

                        {deleteMainCatOpen && (
                          <div className="mt-2 flex flex-col sm:flex-row gap-2">
                            <input
                              className="flex-1 rounded-xl border border-red-200 px-3 py-2 text-sm bg-white"
                              value={expenseMainCategory || ""}
                              readOnly
                            />
                            <button
                              type="button"
                              disabled={busy || !expenseMainCategory}
                              onClick={handleDeleteMainCategory}
                              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {busy ? "..." : "Διαγραφή"}
                            </button>
                          </div>
                        )}

                        {deleteSubCatOpen && (
                          <div className="mt-2 flex flex-col sm:flex-row gap-2">
                            <input
                              className="flex-1 rounded-xl border border-red-200 px-3 py-2 text-sm bg-white"
                              value={expenseSubCategory || ""}
                              readOnly
                            />
                            <button
                              type="button"
                              disabled={busy || !expenseSubCategory}
                              onClick={handleDeleteSubCategory}
                              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {busy ? "..." : "Διαγραφή"}
                            </button>
                          </div>
                        )}

                        {deleteOptOpen && (
                          <div className="mt-2 flex flex-col sm:flex-row gap-2">
                            <input
                              className="flex-1 rounded-xl border border-red-200 px-3 py-2 text-sm bg-white"
                              value={expenseSubCategory2 || ""}
                              readOnly
                            />
                            <button
                              type="button"
                              disabled={busy || !expenseSubCategory2}
                              onClick={handleDeleteOption}
                              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {busy ? "..." : "Διαγραφή"}
                            </button>
                          </div>
                        )}

                        {addMainCatOpen && (
                          <div className="mt-2 flex flex-col sm:flex-row gap-2">
                            <input
                              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                              placeholder='π.χ. "Εκπαίδευση"'
                              value={newMainCat}
                              onChange={(e) => setNewMainCat(e.target.value)}
                            />
                            <button
                              type="button"
                              disabled={busy}
                              onClick={handleAddMainCategory}
                              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {busy ? "..." : "Αποθήκευση"}
                            </button>
                          </div>
                        )}

                        {addSubCatOpen && (
                          <div className="mt-2">
                            <div className="text-[11px] text-slate-500 mb-1">
                              Θα προστεθεί κάτω από: <b>{expenseMainCategory || "—"}</b>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                placeholder='π.χ. "Μαθήματα"'
                                value={newSubCat}
                                onChange={(e) => setNewSubCat(e.target.value)}
                              />
                              <button
                                type="button"
                                disabled={busy}
                                onClick={handleAddSubCategory}
                                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                              >
                                {busy ? "..." : "Αποθήκευση"}
                              </button>
                            </div>
                          </div>
                        )}

                        {addOptOpen && (
                          <div className="mt-2">
                            <div className="text-[11px] text-slate-500 mb-1">
                              Θα προστεθεί κάτω από: <b>{expenseMainCategory || "—"}</b> / <b>{expenseSubCategory || "—"}</b>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                                placeholder='π.χ. "Ιδιαίτερα"'
                                value={newOpt}
                                onChange={(e) => setNewOpt(e.target.value)}
                              />
                              <button
                                type="button"
                                disabled={busy}
                                onClick={handleAddOption}
                                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                              >
                                {busy ? "..." : "Αποθήκευση"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Τρόπος πληρωμής + τράπεζα/wallet + μέλος */}
                      <div className="rounded-2xl bg-white/85 border border-rose-200 p-3 shadow-sm flex flex-col gap-1">
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

                        <div className="mt-3">
                          <label className="text-sm font-medium text-slate-700">Μέλος νοικοκυριού</label>
                          <select
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                            value={txMemberUid || user?.uid || ""}
                            onChange={(e) => setTxMemberUid(e.target.value)}
                          >
                            {(members.length
                              ? members
                              : [{ id: user?.uid, uid: user?.uid, displayName: user?.displayName, email: user?.email }])
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
                          <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50/25 p-3">
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
                      type === "income" ? "border-emerald-200" : type === "transfer" ? "border-sky-200" : "border-rose-200"
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

                  {/* Buttons */}
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
                        type === "income"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : type === "transfer"
                          ? "bg-sky-700 hover:bg-sky-800"
                          : "bg-slate-900 hover:bg-slate-800"
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
                  {filteredTransactions.map((t) => {
                    const amt = Number(t.amount || 0);
                    const isIncome = t.type === "income";
                    const isExpense = t.type === "expense";
                    const isTransfer = t.type === "transfer";

                    return (
                      <div key={t.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="font-semibold break-words whitespace-normal flex-1 min-w-0">
                            {txTitle(t)}
                          </div>
                          <div
                            className={`shrink-0 font-extrabold ${
                              isIncome ? "text-emerald-700" : isExpense ? "text-rose-700" : "text-sky-700"
                            }`}
                          >
                            {isIncome ? "+" : isExpense ? "-" : "↔ "}
                            {formatCurrency(amt)}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2 mt-1">
                          <span>
                            {t.date}
                            {t.time ? ` • ${t.time}` : ""}
                          </span>
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
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
