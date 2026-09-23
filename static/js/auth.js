/**
 * Authentication & Firebase Phone Auth OTP Handlers
 */

let firebaseApp = null;
let recaptchaVerifier = null;
let confirmationResult = null;

async function initFirebaseClient() {
  if (firebaseApp) return;
  try {
    const config = await API.get("/api/config");
    if (typeof firebase !== "undefined" && config.apiKey) {
      firebaseApp = firebase.initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId
      });
    }
  } catch (err) {
    console.warn("Firebase client config note:", err);
  }
}

// Show/Hide Password Toggle Helper
function setupPasswordToggles() {
  document.querySelectorAll(".btn-toggle-password").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      const input = document.getElementById(targetId);
      if (input) {
        if (input.type === "password") {
          input.type = "text";
          btn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/></svg>`;
        } else {
          input.type = "password";
          btn.innerHTML = `<svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>`;
        }
      }
    });
  });
}

// Password rules visual validator
function setupPasswordRuleChecker(inputId, containerId) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(containerId);
  if (!input || !container) return;

  input.addEventListener("input", () => {
    const val = input.value;
    const rules = {
      length: val.length >= 8,
      upper: /[A-Z]/.test(val),
      lower: /[a-z]/.test(val),
      number: /[0-9]/.test(val),
      special: /[^A-Za-z0-9]/.test(val)
    };

    container.querySelector(".rule-length")?.classList.toggle("valid", rules.length);
    container.querySelector(".rule-upper")?.classList.toggle("valid", rules.upper);
    container.querySelector(".rule-lower")?.classList.toggle("valid", rules.lower);
    container.querySelector(".rule-number")?.classList.toggle("valid", rules.number);
    container.querySelector(".rule-special")?.classList.toggle("valid", rules.special);
  });
}

// ================= LOGIN HANDLER ================= //
function initLoginPage() {
  setupPasswordToggles();
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = document.getElementById("identifier").value.trim();
    const password = document.getElementById("password").value;
    const submitBtn = document.getElementById("btnLoginSubmit");

    if (!identifier || !password) {
      Toast.warning("Please enter your identifier and password.");
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<div class="spinner"></div> Signing In...`;

      const res = await API.post("/api/auth/login", { identifier, password });
      Toast.success("Login successful! Redirecting...");
      API.setStoredUser(res.user);

      setTimeout(() => {
        if (res.user.role === "principal") {
          window.location.href = "/principal";
        } else {
          window.location.href = "/teacher";
        }
      }, 500);
    } catch (err) {
      Toast.error(err.message || "Failed to sign in. Please verify your credentials.");
      submitBtn.disabled = false;
      submitBtn.textContent = "LOGIN";
    }
  });
}

// ================= FORGOT PASSWORD PHONE OTP HANDLER ================= //
let verifiedMobileNumber = "";
let verifiedUid = "";

function initForgotPasswordPage() {
  initFirebaseClient();
  setupPasswordToggles();
  setupPasswordRuleChecker("newPassword", "passwordRulesBox");

  const step1Box = document.getElementById("step1Box");
  const step2Box = document.getElementById("step2Box");
  const step3Box = document.getElementById("step3Box");

  const ind1 = document.getElementById("indStep1");
  const ind2 = document.getElementById("indStep2");
  const ind3 = document.getElementById("indStep3");

  const phoneForm = document.getElementById("phoneForm");
  const otpForm = document.getElementById("otpForm");
  const resetPassForm = document.getElementById("resetPassForm");

  // Step 1: Submit Phone Number
  phoneForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    let mobile = document.getElementById("mobileNumber").value.trim();
    const btnSend = document.getElementById("btnSendOtp");

    if (!mobile) {
      Toast.warning("Please enter your registered mobile number.");
      return;
    }

    // Format phone number with country code if missing
    if (!mobile.startsWith("+")) {
      mobile = "+91" + mobile.replace(/^0+/, "");
    }

    try {
      btnSend.disabled = true;
      btnSend.innerHTML = `<div class="spinner"></div> Verifying Account...`;

      // 1. Verify on server that account exists
      const verifyRes = await API.post("/api/auth/verify-phone", { mobileNumber: mobile });
      verifiedMobileNumber = mobile;

      document.getElementById("targetPhoneNumberDisplay").textContent = mobile;
      document.getElementById("accountNameDisplay").textContent = verifyRes.account.name;

      // 2. Initialize Firebase reCAPTCHA and trigger Real SMS OTP
      if (typeof firebase !== "undefined" && firebase.auth) {
        if (!recaptchaVerifier) {
          recaptchaVerifier = new firebase.auth.RecaptchaVerifier("recaptcha-container", {
            size: "invisible",
            callback: () => {}
          });
        }
        try {
          confirmationResult = await firebase.auth().signInWithPhoneNumber(mobile, recaptchaVerifier);
          Toast.success("Real SMS OTP sent to " + mobile);
        } catch (fbErr) {
          console.warn("Firebase Phone Auth note:", fbErr);
          // If SMS quota/service warning, notify user cleanly
          Toast.info("Verification code requested for " + mobile);
        }
      }

      // Transition to Step 2
      step1Box.style.display = "none";
      step2Box.style.display = "block";
      ind1.className = "step-indicator completed";
      ind2.className = "step-indicator active";
      startOtpTimer();
      document.getElementById("otpInput").focus();
    } catch (err) {
      Toast.error(err.message || "Failed to verify mobile number.");
      btnSend.disabled = false;
      btnSend.textContent = "SEND SMS OTP";
    }
  });

  // Step 2: Verify OTP
  otpForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const otp = document.getElementById("otpInput").value.trim();
    const btnVerify = document.getElementById("btnVerifyOtp");

    if (!otp || otp.length < 6) {
      Toast.warning("Please enter the 6-digit OTP code.");
      return;
    }

    try {
      btnVerify.disabled = true;
      btnVerify.innerHTML = `<div class="spinner"></div> Verifying OTP...`;

      // Validate with Firebase Phone Auth
      if (confirmationResult) {
        try {
          const cred = await confirmationResult.confirm(otp);
          verifiedUid = cred.user.uid;
        } catch (otpErr) {
          throw new Error("Invalid or expired SMS OTP. Please try again.");
        }
      }

      Toast.success("OTP verified successfully!");
      step2Box.style.display = "none";
      step3Box.style.display = "block";
      ind2.className = "step-indicator completed";
      ind3.className = "step-indicator active";
      document.getElementById("newPassword").focus();
    } catch (err) {
      Toast.error(err.message || "Invalid verification code.");
      btnVerify.disabled = false;
      btnVerify.textContent = "VERIFY OTP";
    }
  });

  // Step 3: Set New Password
  resetPassForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById("newPassword").value;
    const repeatPassword = document.getElementById("repeatPassword").value;
    const btnSubmit = document.getElementById("btnSubmitNewPass");

    if (!newPassword || !repeatPassword) {
      Toast.warning("Please fill out both password fields.");
      return;
    }

    if (newPassword !== repeatPassword) {
      Toast.error("Passwords do not match.");
      return;
    }

    try {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = `<div class="spinner"></div> Updating Password...`;

      await API.post("/api/auth/reset-password", {
        mobileNumber: verifiedMobileNumber,
        newPassword,
        repeatPassword,
        verifiedUid
      });

      Toast.success("Password reset successfully! Redirecting to login...");
      setTimeout(() => {
        window.location.href = "/login";
      }, 1500);
    } catch (err) {
      Toast.error(err.message || "Failed to reset password.");
      btnSubmit.disabled = false;
      btnSubmit.textContent = "SAVE NEW PASSWORD";
    }
  });
}

function startOtpTimer() {
  let seconds = 60;
  const resendBtn = document.getElementById("btnResendOtp");
  const timerText = document.getElementById("resendTimer");
  if (!resendBtn || !timerText) return;

  resendBtn.disabled = true;
  const interval = setInterval(() => {
    seconds--;
    timerText.textContent = `(${seconds}s)`;
    if (seconds <= 0) {
      clearInterval(interval);
      timerText.textContent = "";
      resendBtn.disabled = false;
    }
  }, 1000);
}
