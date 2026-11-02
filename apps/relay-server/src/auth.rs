//! apps/relay-server/src/auth.rs
//! Ed25519 Challenge-Response Authentication, Registration, Device Authorization & Recovery Proof Verification
//! Locked to SYNC_PROTOCOL.md v2.0, ARCHITECTURE.md v5.0 & Patch VG-03/VG-08.

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rand::RngCore;
use sha2::{Digest, Sha256};

pub const SYNC_AUTH_DOMAIN_PREFIX: &str = "VG_SYNC_AUTH_V1:";
pub const SYNC_REGISTER_DOMAIN_PREFIX: &str = "VG_SYNC_REGISTER_V1:";
pub const DEVICE_REQUEST_DOMAIN_PREFIX: &str = "VG_DEVICE_REQ_V1:";
pub const DEVICE_APPROVE_DOMAIN_PREFIX: &str = "VG_DEVICE_APPROVE_V1:";
pub const DEVICE_RECOVERY_DOMAIN_PREFIX: &str = "VG_DEVICE_RECOVERY_V1:";
pub const EMPTY_BODY_SHA256: &str =
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/// Generates a single-use 32-byte (64 lowercase hex chars) challenge nonce.
pub fn generate_challenge_nonce() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// Computes the lowercase 64-char hex SHA-256 of a byte slice.
pub fn compute_sha256_hex(body: &[u8]) -> String {
    if body.is_empty() {
        return EMPTY_BODY_SHA256.to_string();
    }
    let mut hasher = Sha256::new();
    hasher.update(body);
    let result = hasher.finalize();
    hex::encode(result)
}

/// Derives a 6-character human-verifiable Short Authentication String (SAS) code
/// from `(account_id, device_id, device_auth_pub_key)` so the existing device can visually confirm
/// the new device's cryptographic identity against MITM substitution.
pub fn compute_device_short_code(
    account_id: &str,
    device_id: &str,
    device_auth_pub_key: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"VG_DEVICE_SAS_V1:");
    hasher.update(account_id.trim().as_bytes());
    hasher.update(b":");
    hasher.update(device_id.trim().as_bytes());
    hasher.update(b":");
    hasher.update(device_auth_pub_key.trim().as_bytes());
    let digest = hasher.finalize();
    let hex_str = hex::encode(digest).to_uppercase();
    format!("{}-{}", &hex_str[0..3], &hex_str[3..6])
}

/// Constructs the canonical UTF-8 registration preimage:
/// `"VG_SYNC_REGISTER_V1:" + accountId + ":" + accountAuthPubKey`
pub fn build_register_preimage(account_id: &str, account_auth_pub_key: &str) -> String {
    format!(
        "{}{}:{}",
        SYNC_REGISTER_DOMAIN_PREFIX,
        account_id.trim(),
        account_auth_pub_key.trim()
    )
}

/// Constructs the canonical UTF-8 challenge-response preimage string:
/// `"VG_SYNC_AUTH_V1:" + challengeNonce + accountId + deviceId + timestamp + bodySha256`
pub fn build_auth_preimage(
    challenge_nonce: &str,
    account_id: &str,
    device_id: &str,
    timestamp: i64,
    body_sha256: &str,
) -> String {
    format!(
        "{}{}{}{}{}{}",
        SYNC_AUTH_DOMAIN_PREFIX,
        challenge_nonce.trim(),
        account_id.trim(),
        device_id.trim(),
        timestamp,
        body_sha256.trim().to_lowercase()
    )
}

/// Constructs the canonical UTF-8 preimage for `POST /v1/device/request`:
/// `"VG_DEVICE_REQ_V1:" + challengeNonce + ":" + accountId + ":" + deviceId + ":" + deviceAuthPubKey + ":" + timestamp`
pub fn build_device_request_preimage(
    challenge_nonce: &str,
    account_id: &str,
    device_id: &str,
    device_auth_pub_key: &str,
    timestamp: i64,
) -> String {
    format!(
        "{}{}:{}:{}:{}:{}",
        DEVICE_REQUEST_DOMAIN_PREFIX,
        challenge_nonce.trim(),
        account_id.trim(),
        device_id.trim(),
        device_auth_pub_key.trim(),
        timestamp
    )
}

/// Constructs the canonical UTF-8 preimage for Recovery Kit bypass (`POST /v1/device/request`):
/// `"VG_DEVICE_RECOVERY_V1:" + challengeNonce + ":" + accountId + ":" + deviceId + ":" + deviceAuthPubKey + ":" + timestamp`
/// Signed exclusively with the 24-word BIP39 Recovery Authority Key (`VG_RAU_1`), which is never derivable from the Master Password.
pub fn build_device_recovery_preimage(
    challenge_nonce: &str,
    account_id: &str,
    device_id: &str,
    device_auth_pub_key: &str,
    timestamp: i64,
) -> String {
    format!(
        "{}{}:{}:{}:{}:{}",
        DEVICE_RECOVERY_DOMAIN_PREFIX,
        challenge_nonce.trim(),
        account_id.trim(),
        device_id.trim(),
        device_auth_pub_key.trim(),
        timestamp
    )
}

/// Constructs the canonical UTF-8 preimage for `POST /v1/device/approve`:
/// `"VG_DEVICE_APPROVE_V1:" + accountId + ":" + approverDeviceId + ":" + targetDeviceId + ":" + targetDevicePubKey + ":" + decision`
pub fn build_device_approval_preimage(
    account_id: &str,
    approver_device_id: &str,
    target_device_id: &str,
    target_device_pub_key: &str,
    approve: bool,
) -> String {
    let decision = if approve { "ALLOW" } else { "DENY" };
    format!(
        "{}{}:{}:{}:{}:{}",
        DEVICE_APPROVE_DOMAIN_PREFIX,
        account_id.trim(),
        approver_device_id.trim(),
        target_device_id.trim(),
        target_device_pub_key.trim(),
        decision
    )
}

/// Verifies a detached Ed25519 signature over a message preimage.
pub fn verify_signature(
    public_key_b64: &str,
    preimage: &str,
    signature_b64: &str,
) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
    let pubkey_bytes = BASE64.decode(public_key_b64.trim())?;
    if pubkey_bytes.len() != 32 {
        return Ok(false);
    }
    let mut pubkey_arr = [0u8; 32];
    pubkey_arr.copy_from_slice(&pubkey_bytes);

    let sig_bytes = BASE64.decode(signature_b64.trim())?;
    if sig_bytes.len() != 64 {
        return Ok(false);
    }
    let mut sig_arr = [0u8; 64];
    sig_arr.copy_from_slice(&sig_bytes);

    let verifying_key = match VerifyingKey::from_bytes(&pubkey_arr) {
        Ok(k) => k,
        Err(_) => return Ok(false),
    };
    let signature = Signature::from_bytes(&sig_arr);

    match verifying_key.verify(preimage.as_bytes(), &signature) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    #[test]
    fn test_auth_and_device_signature_roundtrip() {
        let mut seed = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut seed);
        let signing_key = SigningKey::from_bytes(&seed);
        let verifying_key = signing_key.verifying_key();
        let pubkey_b64 = BASE64.encode(verifying_key.to_bytes());

        let preimage = build_register_preimage("acc_123", &pubkey_b64);
        let signature = signing_key.sign(preimage.as_bytes());
        let signature_b64 = BASE64.encode(signature.to_bytes());

        assert!(verify_signature(&pubkey_b64, &preimage, &signature_b64).unwrap());

        let req_preimage = build_device_request_preimage(
            "a".repeat(64).as_str(),
            "acc_123",
            "dev_new",
            &pubkey_b64,
            1700000000000,
        );
        let req_sig = BASE64.encode(signing_key.sign(req_preimage.as_bytes()).to_bytes());
        assert!(verify_signature(&pubkey_b64, &req_preimage, &req_sig).unwrap());
    }
}
