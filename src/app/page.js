"use client";

import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
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
const EXPENSE_CATEGORIES = [
  "Σούπερ μάρκετ",
  "Ενοίκιο / Δάνειο",
  "Λογαριασμοί",
  "Καύσιμα / Μετακινήσεις",
  "Φαγητό έξω / Καφέδες",
  "Παιδιά / Σχολείο",
  "Υγεία",
  "Ψυχαγωγία",
  "Άλλα",
];

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

/** =========================
 *  Firestore helpers (households)
 *  ========================= */
async function ensureMembership({ uid, householdId, displayName }) {
  const memberRef = doc(db, "households", householdId, "members", uid);
  await setDoc(
    memberRef,
    { uid, displayName: displayName || null, joinedAt: serverTimestamp() },
    { merge: true }
  );
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

  // default settings per household
  await setDoc(
    doc(db, "households", h.id, "meta", "settings"),
    {
      bankWallets: DEFAULT_BANK_WALLETS,
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

  await setUserHouseholdId(uid, h.id);
  await ensureMembership({ uid, householdId: h.id, displayName });

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
  const [expenseCategory, setExpenseCategory] = useState("Σούπερ μάρκετ");
  const [expenseCategoryOther, setExpenseCategoryOther] = useState("");
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
      setHouseholdId(hid || null);

      if (hid) {
        await ensureMembership({ uid: u.uid, householdId: hid, displayName: u.displayName });
      }
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

    setExpenseCategory("Σούπερ μάρκετ");
    setExpenseCategoryOther("");
    setExpensePaymentMethod("Μετρητά");
    setExpenseBankWallet(bankWallets[0] || "Alpha Bank");

    setIncomeSource("Μισθός");
    setIncomeSourceOther("");
    setIncomeReceiptMethod(bankWallets[0] || "Alpha Bank");

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
        await ensureMembership({ uid: cred.user.uid, householdId: hid, displayName: name });
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
      await ensureMembership({ uid: user.uid, householdId: hid, displayName: user.displayName });
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

    if (type === "income") {
      const src = incomeSource === "Άλλο" ? (incomeSourceOther || "").trim() : "Μισθός";
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
          // legacy display fields
          category: incomeReceiptMethod, // “τρόπος λήψης εσόδου” (τώρα από bank/wallet list)
          paymentMethod: incomeSource === "Άλλο" ? "Άλλο" : "Μισθός",
          // new fields
          incomeSource: incomeSource,
          incomeSourceOther: incomeSource === "Άλλο" ? src : "",
          incomeReceiptMethod, // bank/wallet or receipt method
          // expense-only fields
          expenseCategoryOther: "",
          expenseBankWallet: "",
          expensePaymentMethod: "",
          notes: notes.trim(),
          updatedAt: serverTimestamp(),
        },
      };
    }

    // expense
    const catOther = expenseCategory === "Άλλα" ? (expenseCategoryOther || "").trim() : "";
    if (expenseCategory === "Άλλα" && !catOther) {
      return { ok: false, message: "Γράψε τι είναι το “Άλλα” στην κατηγορία." };
    }

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
        category: expenseCategory,
        paymentMethod: expensePaymentMethod,
        // new fields
        expensePaymentMethod,
        expenseBankWallet: expenseNeedsBank ? expenseBankWallet : "",
        expenseCategoryOther: catOther,
        // income-only fields
        incomeSource: "",
        incomeSourceOther: "",
        incomeReceiptMethod: "",
        notes: notes.trim(),
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
    setEditingId(t.id);

    const txType = t.type === "income" ? "income" : "expense";
    setType(txType);

    setDate(t.date || getToday());
    setAmount(String(t.amount ?? ""));

    if (txType === "income") {
      const src = t.incomeSource || t.paymentMethod || "Μισθός";
      const srcNorm = src === "Άλλο" || src === "Μισθός" ? src : "Άλλο";
      setIncomeSource(srcNorm);

      const other = t.incomeSourceOther || (srcNorm === "Άλλο" ? String(src || "") : "");
      setIncomeSourceOther(other && other !== "Άλλο" ? other : "");

      const rm = t.incomeReceiptMethod || t.category || bankWallets[0] || "Alpha Bank";
      setIncomeReceiptMethod(rm);

      // clear expense fields
      setExpenseCategory("Σούπερ μάρκετ");
      setExpenseCategoryOther("");
      setExpensePaymentMethod("Μετρητά");
      setExpenseBankWallet(bankWallets[0] || "Alpha Bank");
    } else {
      setExpenseCategory(t.category || "Σούπερ μάρκετ");
      setExpenseCategoryOther(t.expenseCategoryOther || "");
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
    const cat = t.category === "Άλλα" ? (t.expenseCategoryOther || "Άλλα") : (t.category || "—");
    return `${txType} – ${cat}`;
  }

  function txMethodLine(t) {
    if (t.type === "income") {
      const src =
        t.incomeSource === "Άλλο"
          ? `Άλλο: ${t.incomeSourceOther || ""}`.trim()
          : "Μισθός";
      const receipt = t.incomeReceiptMethod || t.category || "";
      return `Πηγή: ${src}${receipt ? ` • Λήψη: ${receipt}` : ""}`;
    }

    const pm = t.expensePaymentMethod || t.paymentMethod || "";
    const needsBank =
      pm === "Χρεωστική κάρτα" || pm === "Πιστωτική κάρτα" || pm === "Λογαριασμός Τράπεζας";
    const bw = needsBank ? (t.expenseBankWallet || "") : "";
    return `${pm}${bw ? ` • ${bw}` : ""}`.trim();
  }

  function exportCSV() {
    const rows = filteredTransactions
      .slice()
      .reverse()
      .map((t) => {
        if (t.type === "income") {
          const src = t.incomeSource === "Άλλο" ? (t.incomeSourceOther || "") : "Μισθός";
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
          expense_category: t.category || "",
          expense_category_other: t.expenseCategoryOther || "",
          notes: (t.notes || "").replace(/\n/g, " "),
        };
      });

    const header = [
      "date",
      "type",
      "amount",
      "income_source",
      "income_receipt_method",
      "expense_payment_method",
      "expense_bank_wallet",
      "expense_category",
      "expense_category_other",
      "notes",
    ];

    const csv = [
      header.join(","),
      ...rows.map((r) =>
        header
          .map((k) => {
            const v = String(r[k] ?? "");
            return v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fileTag =
      filterMode === "range" ? `range_${rangeStart || "x"}_${rangeEnd || "x"}` : selectedMonth;
    a.href = url;
    a.download = `exodologio_${fileTag}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const usingRegister = authMode === "register";

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <InstallPWABar />

      <div className="mx-auto max-w-5xl px-4 py-5 sm:py-8 pb-24">
        <div className="flex flex-col gap-1 mb-5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Exodologio</h1>
          <p className="text-sm text-slate-600">
            Κοινό έσοδα–έξοδα για εσένα και την οικογένεια, sync σε όλες τις συσκευές.
          </p>
        </div>

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
                      onClick={exportCSV}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Export CSV
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
            <section className="mb-5 sm:mb-8 rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-lg font-semibold">{editingId ? "Επεξεργασία κίνησης" : "Νέα κίνηση"}</h2>
                {editingId && (
                  <button onClick={resetForm} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold">
                    Ακύρωση edit
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveTransaction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium">Ημερομηνία</label>
                  <input
                    type="date"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium">Τύπος</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setType("income")}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                        type === "income"
                          ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      Έσοδο
                    </button>
                    <button
                      type="button"
                      onClick={() => setType("expense")}
                      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold ${
                        type === "expense"
                          ? "border-rose-500 bg-rose-50 text-rose-800"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      Έξοδο
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium">Ποσό (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>

                {/* Dynamic: Income vs Expense */}
                {type === "income" ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium">Πηγή εσόδου</label>
                      <select
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        value={incomeSource}
                        onChange={(e) => setIncomeSource(e.target.value)}
                      >
                        <option value="Μισθός">Μισθός</option>
                        <option value="Άλλο">Άλλο</option>
                      </select>

                      {incomeSource === "Άλλο" ? (
                        <input
                          className="mt-2 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                          placeholder="Γράψε την πηγή εσόδου (π.χ. Ενοίκιο, Bonus, κτλ.)"
                          value={incomeSourceOther}
                          onChange={(e) => setIncomeSourceOther(e.target.value)}
                        />
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium">Τρόπος λήψης εσόδου</label>
                      <select
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        value={incomeReceiptMethod}
                        onChange={(e) => setIncomeReceiptMethod(e.target.value)}
                      >
                        {bankWallets.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>

                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setAddBankWalletOpen((v) => !v)}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                        >
                          Πρόσθεσε τράπεζα/wallet ή τρόπο λήψης εσόδου
                        </button>
                      </div>

                      {addBankWalletOpen && (
                        <div className="mt-2 flex flex-col sm:flex-row gap-2">
                          <input
                            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
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

                      <div className="text-[11px] text-slate-500 mt-1">
                        Αυτές οι επιλογές αποθηκεύονται μόνο για το συγκεκριμένο νοικοκυριό.
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium">Κατηγορία</label>
                      <select
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        value={expenseCategory}
                        onChange={(e) => setExpenseCategory(e.target.value)}
                      >
                        {EXPENSE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>

                      {expenseCategory === "Άλλα" ? (
                        <input
                          className="mt-2 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                          placeholder="Γράψε τι είναι το “Άλλα” (π.χ. Δώρο, Σέρβις, κτλ.)"
                          value={expenseCategoryOther}
                          onChange={(e) => setExpenseCategoryOther(e.target.value)}
                        />
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium">Τρόπος πληρωμής</label>
                      <select
                        className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                        value={expensePaymentMethod}
                        onChange={(e) => setExpensePaymentMethod(e.target.value)}
                      >
                        {EXPENSE_PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>

                      {expenseNeedsBank ? (
                        <div className="mt-2 flex flex-col gap-1">
                          <label className="text-sm font-medium">Τράπεζα / Wallet</label>
                          <select
                            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                            value={expenseBankWallet}
                            onChange={(e) => setExpenseBankWallet(e.target.value)}
                          >
                            {bankWallets.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>

                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setAddBankWalletOpen((v) => !v)}
                              className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold"
                            >
                              Πρόσθεσε τράπεζα/wallet
                            </button>
                          </div>

                          {addBankWalletOpen && (
                            <div className="mt-2 flex flex-col sm:flex-row gap-2">
                              <input
                                className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm"
                                placeholder='π.χ. "Viva Wallet", "Wise", κτλ.'
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

                          <div className="text-[11px] text-slate-500 mt-1">
                            Αυτές οι επιλογές αποθηκεύονται μόνο για το συγκεκριμένο νοικοκυριό.
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                )}

                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-sm font-medium">Σχόλια (προαιρετικό)</label>
                  <textarea
                    rows={2}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    placeholder="π.χ. ΔΕΗ Νοεμβρίου, σχολικά είδη κτλ."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>

                <div className="md:col-span-2 flex flex-col sm:flex-row justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
                  >
                    Καθαρισμός
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {busy ? "..." : editingId ? "Αποθήκευση αλλαγών" : "Αποθήκευση κίνησης"}
                  </button>
                </div>
              </form>
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
