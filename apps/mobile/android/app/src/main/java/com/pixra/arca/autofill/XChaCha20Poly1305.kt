package com.pixra.arca.autofill

import org.bouncycastle.crypto.modes.ChaCha20Poly1305
import org.bouncycastle.crypto.params.AEADParameters
import org.bouncycastle.crypto.params.KeyParameter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.security.SecureRandom

object XChaCha20Poly1305 {

  private const val PAD_BLOCK_BYTES = 256
  private val secureRandom = SecureRandom()

  private fun rotl(v: Int, c: Int): Int = (v shl c) or (v ushr (32 - c))

  private fun quarterRound(state: IntArray, a: Int, b: Int, c: Int, d: Int) {
    state[a] += state[b]; state[d] = rotl(state[d] xor state[a], 16)
    state[c] += state[d]; state[b] = rotl(state[b] xor state[c], 12)
    state[a] += state[b]; state[d] = rotl(state[d] xor state[a], 8)
    state[c] += state[d]; state[b] = rotl(state[b] xor state[c], 7)
  }

  fun hChaCha20(key: ByteArray, nonce16: ByteArray): ByteArray {
    require(key.size == 32) { "Key must be 32 bytes" }
    require(nonce16.size == 16) { "Nonce must be 16 bytes" }

    val state = IntArray(16)
    state[0] = 0x61707865
    state[1] = 0x3320646e
    state[2] = 0x79622d32
    state[3] = 0x6b206574

    val keyBuf = ByteBuffer.wrap(key).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until 8) state[4 + i] = keyBuf.int

    val nonceBuf = ByteBuffer.wrap(nonce16).order(ByteOrder.LITTLE_ENDIAN)
    for (i in 0 until 4) state[12 + i] = nonceBuf.int

    for (round in 0 until 10) {
      quarterRound(state, 0, 4, 8, 12)
      quarterRound(state, 1, 5, 9, 13)
      quarterRound(state, 2, 6, 10, 14)
      quarterRound(state, 3, 7, 11, 15)
      quarterRound(state, 0, 5, 10, 15)
      quarterRound(state, 1, 6, 11, 12)
      quarterRound(state, 2, 7, 8, 13)
      quarterRound(state, 3, 4, 9, 14)
    }

    val subkey = ByteArray(32)
    val outBuf = ByteBuffer.wrap(subkey).order(ByteOrder.LITTLE_ENDIAN)
    outBuf.putInt(state[0])
    outBuf.putInt(state[1])
    outBuf.putInt(state[2])
    outBuf.putInt(state[3])
    outBuf.putInt(state[12])
    outBuf.putInt(state[13])
    outBuf.putInt(state[14])
    outBuf.putInt(state[15])
    return subkey
  }

  /**
   * Decrypts XChaCha20-Poly1305 ciphertext with trailing Poly1305 tag.
   */
  fun decrypt(
    key: ByteArray,
    nonce24: ByteArray,
    ciphertextWithTag: ByteArray,
    aad: ByteArray
  ): ByteArray {
    require(key.size == 32) { "Key must be 32 bytes" }
    require(nonce24.size == 24) { "Nonce must be 24 bytes" }

    val nonce16 = nonce24.copyOfRange(0, 16)
    val subkey = hChaCha20(key, nonce16)

    val subnonce12 = ByteArray(12)
    System.arraycopy(nonce24, 16, subnonce12, 4, 8)

    val cipher = ChaCha20Poly1305()
    val params = AEADParameters(KeyParameter(subkey), 128, subnonce12, aad)
    cipher.init(false, params)

    val out = ByteArray(cipher.getOutputSize(ciphertextWithTag.size))
    var len = cipher.processBytes(ciphertextWithTag, 0, ciphertextWithTag.size, out, 0)
    len += cipher.doFinal(out, len)

    return out.copyOf(len)
  }

  /**
   * Encrypts plaintext using XChaCha20-Poly1305 with random 24-byte nonce.
   * Returns Pair<nonce24, ciphertextWithTag>.
   */
  fun encrypt(
    key: ByteArray,
    plaintext: ByteArray,
    aad: ByteArray
  ): Pair<ByteArray, ByteArray> {
    require(key.size == 32) { "Key must be 32 bytes" }

    val nonce24 = ByteArray(24)
    secureRandom.nextBytes(nonce24)

    val nonce16 = nonce24.copyOfRange(0, 16)
    val subkey = hChaCha20(key, nonce16)

    val subnonce12 = ByteArray(12)
    System.arraycopy(nonce24, 16, subnonce12, 4, 8)

    val cipher = ChaCha20Poly1305()
    val params = AEADParameters(KeyParameter(subkey), 128, subnonce12, aad)
    cipher.init(true, params)

    val out = ByteArray(cipher.getOutputSize(plaintext.size))
    var len = cipher.processBytes(plaintext, 0, plaintext.size, out, 0)
    len += cipher.doFinal(out, len)

    return Pair(nonce24, out.copyOf(len))
  }

  /**
   * ISO/IEC 7816-4 256-byte block padding.
   */
  fun padTo256(bytes: ByteArray): ByteArray {
    val remainder = bytes.size % PAD_BLOCK_BYTES
    val padLength = PAD_BLOCK_BYTES - remainder
    val padded = ByteArray(bytes.size + padLength)
    System.arraycopy(bytes, 0, padded, 0, bytes.size)
    padded[bytes.size] = 0x80.toByte()
    return padded
  }

  /**
   * ISO/IEC 7816-4 256-byte unpadding.
   */
  fun unpadFrom256(padded: ByteArray): ByteArray {
    if (padded.isEmpty() || padded.size % PAD_BLOCK_BYTES != 0) {
      throw IllegalArgumentException("PADDING_ALIGNMENT_ERROR: length ${padded.size}")
    }
    var delimiterIndex = -1
    for (i in padded.indices.reversed()) {
      val byteVal = padded[i].toInt() and 0xFF
      if (byteVal == 0x00) continue
      if (byteVal == 0x80) {
        delimiterIndex = i
        break
      }
      throw IllegalArgumentException("PADDING_CORRUPTED_BYTE at index $i: $byteVal")
    }
    if (delimiterIndex < 0) {
      throw IllegalArgumentException("PADDING_DELIMITER_MISSING")
    }
    return padded.copyOfRange(0, delimiterIndex)
  }

  fun decryptItemJson(
    dek: ByteArray,
    itemId: String,
    revision: Int,
    ciphertextB64: String,
    nonceB64: String
  ): String {
    val ciphertextWithTag = android.util.Base64.decode(ciphertextB64, android.util.Base64.DEFAULT)
    val nonce = android.util.Base64.decode(nonceB64, android.util.Base64.DEFAULT)
    val aad = "vaultguard:v1:item:$itemId:$revision".toByteArray(StandardCharsets.UTF_8)
    val paddedPlaintext = decrypt(dek, nonce, ciphertextWithTag, aad)
    val unpadded = unpadFrom256(paddedPlaintext)
    return String(unpadded, StandardCharsets.UTF_8)
  }
}

