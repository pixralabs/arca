package com.pixra.arca.autofill

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object ArcaAutofillBridge {

  private const val TAG = "ArcaAutofillBridge"
  private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
  private const val KEY_ALIAS = "ArcaAutofillKey_v1"
  private const val PREFS_NAME = "arca_autofill_vault_prefs"
  private const val PREF_ENCRYPTED_DEK = "encrypted_dek"
  private const val PREF_IV = "dek_iv"

  @Volatile
  var activeDek: ByteArray? = null

  private fun getOrCreateSecretKey(): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
    keyStore.load(null)

    if (keyStore.containsAlias(KEY_ALIAS)) {
      val entry = keyStore.getEntry(KEY_ALIAS, null) as KeyStore.SecretKeyEntry
      return entry.secretKey
    }

    val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
    val spec = KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .build()

    keyGenerator.init(spec)
    return keyGenerator.generateKey()
  }

  fun storeDek(context: Context, dekHex: String) {
    try {
      val dekBytes = hexToBytes(dekHex)
      activeDek = dekBytes.clone()

      val secretKey = getOrCreateSecretKey()
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, secretKey)

      val iv = cipher.iv
      val encrypted = cipher.doFinal(dekBytes)

      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      prefs.edit()
        .putString(PREF_ENCRYPTED_DEK, Base64.encodeToString(encrypted, Base64.NO_WRAP))
        .putString(PREF_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
        .apply()

      Log.d(TAG, "Autofill DEK securely persisted into Android Keystore")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to store DEK into Keystore: ${e.message}", e)
    }
  }

  fun getDek(context: Context): ByteArray? {
    activeDek?.let { return it }

    return try {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      val encStr = prefs.getString(PREF_ENCRYPTED_DEK, null) ?: return null
      val ivStr = prefs.getString(PREF_IV, null) ?: return null

      val encBytes = Base64.decode(encStr, Base64.DEFAULT)
      val ivBytes = Base64.decode(ivStr, Base64.DEFAULT)

      val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER)
      keyStore.load(null)
      if (!keyStore.containsAlias(KEY_ALIAS)) return null

      val secretKey = (keyStore.getEntry(KEY_ALIAS, null) as KeyStore.SecretKeyEntry).secretKey
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      val spec = GCMParameterSpec(128, ivBytes)
      cipher.init(Cipher.DECRYPT_MODE, secretKey, spec)

      val decrypted = cipher.doFinal(encBytes)
      activeDek = decrypted.clone()
      decrypted
    } catch (e: Exception) {
      Log.e(TAG, "Failed to retrieve DEK from Keystore: ${e.message}", e)
      null
    }
  }

  fun clearDek(context: Context) {
    activeDek = null
    try {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      prefs.edit().clear().apply()
    } catch (_: Exception) {}
  }

  fun decryptPassword(
    context: Context,
    itemId: String,
    ciphertextB64: String,
    nonceB64: String
  ): String? {
    val dek = getDek(context) ?: return null
    return try {
      val jsonStr = XChaCha20Poly1305.decryptItemJson(dek, itemId, 1, ciphertextB64, nonceB64)
      val json = JSONObject(jsonStr)
      json.optString("password", "")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to decrypt password for item $itemId: ${e.message}", e)
      null
    }
  }

  private fun hexToBytes(hex: String): ByteArray {
    val clean = hex.trim()
    val len = clean.length
    val data = ByteArray(len / 2)
    var i = 0
    while (i < len) {
      val d1 = Character.digit(clean[i], 16)
      val d2 = Character.digit(clean[i + 1], 16)
      data[i / 2] = ((d1 shl 4) or d2).toByte()
      i += 2
    }
    return data
  }
}

