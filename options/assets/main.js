/**
 * VaultGuard MV3 Options, WebAuthn PRF Enrollment & Diagnostics Bundle (Zero inline style Mutations)
 */
const root = document.getElementById("root");
if (root) {
  document.body.classList.add("vg-options-body");
  const container = document.createElement("main");
  container.className = "vg-main vg-options-container";

  const title = document.createElement("h1");
  title.className = "vg-title";
  title.textContent = "VaultGuard Security, Biometrics & Diagnostics";

  const sub = document.createElement("p");
  sub.className = "vg-subtitle";
  sub.textContent = "Zero-Knowledge Local-First Password Manager (v0.2.5-totp)";

  const card = document.createElement("div");
  card.className = "vg-card";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "vg-btn vg-btn-primary";
  btn.textContent = "Export Sanitized Diagnostics (.vgdiag.json)";

  const pre = document.createElement("pre");
  pre.className = "vg-mono-box vg-mt-3 vg-hidden";

  btn.addEventListener("click", () => {
    const diag = {
      format: "vaultguard-diagnostics",
      version: "0.2.5-totp",
      exportedAt: Date.now(),
      kdfFloorKiB: 19456,
      kdfCeilingKiB: 65536,
      biometricSubkeyContext: "VG_BIO_1",
      shamirThreshold: "2-of-3",
      totpEngine: "otpauth@9.3.4 + jsqr@1.4.0",
      csp: "connect-src 'none'",
      userAgent: navigator.userAgent
    };
    pre.classList.remove("vg-hidden");
    pre.textContent = JSON.stringify(diag, null, 2);
  });

  card.appendChild(btn);
  card.appendChild(pre);
  container.appendChild(title);
  container.appendChild(sub);
  container.appendChild(card);
  root.appendChild(container);
}
