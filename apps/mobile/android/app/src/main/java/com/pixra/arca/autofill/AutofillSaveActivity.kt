package com.pixra.arca.autofill

import android.os.Bundle
import android.util.Base64
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.pixra.arca.R
import org.json.JSONArray
import org.json.JSONObject
import java.nio.charset.StandardCharsets

class AutofillSaveActivity : AppCompatActivity() {

  companion object {
    const val EXTRA_TITLE = "EXTRA_TITLE"
    const val EXTRA_USERNAME = "EXTRA_USERNAME"
    const val EXTRA_PASSWORD = "EXTRA_PASSWORD"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(R.layout.autofill_save_dialog)

    val title = intent.getStringExtra(EXTRA_TITLE) ?: "Login"
    val username = intent.getStringExtra(EXTRA_USERNAME) ?: ""
    val password = intent.getStringExtra(EXTRA_PASSWORD) ?: ""

    findViewById<TextView>(R.id.save_title).text = title
    findViewById<TextView>(R.id.save_username).text = if (username.isNotBlank()) username else "Account"

    findViewById<Button>(R.id.btn_save_confirm).setOnClickListener {
      saveCredential(title, username, password)
    }

    findViewById<Button>(R.id.btn_save_cancel).setOnClickListener {
      finish()
    }
  }

  private fun saveCredential(title: String, username: String, password: String) {
    val dek = ArcaAutofillBridge.getDek(this)
    if (dek == null) {
      Toast.makeText(this, "Open Arca once to enable auto-save encryption", Toast.LENGTH_LONG).show()
      finish()
      return
    }

    try {
      val payload = JSONObject().apply {
        put("title", title)
        put("username", username)
        put("password", password)
        put("urls", JSONArray().put(title))
        put("notes", "Auto-saved by Arca Autofill")
      }.toString()

      val padded = XChaCha20Poly1305.padTo256(payload.toByteArray(StandardCharsets.UTF_8))
      val itemId = "item_" + System.currentTimeMillis().toString(36) + "_" + (1000..9999).random()
      val aad = "vaultguard:v1:item:$itemId:1".toByteArray(StandardCharsets.UTF_8)

      val (nonce, ciphertext) = XChaCha20Poly1305.encrypt(dek, padded, aad)
      val nonceB64 = Base64.encodeToString(nonce, Base64.NO_WRAP)
      val ciphertextB64 = Base64.encodeToString(ciphertext, Base64.NO_WRAP)

      val dbHelper = ArcaVaultDbHelper(this)
      val success = dbHelper.saveVaultItem(title, username, ciphertextB64, nonceB64, null)

      if (success) {
        Toast.makeText(this, "Saved to Arca Vault", Toast.LENGTH_SHORT).show()
      } else {
        Toast.makeText(this, "Failed to save into vault", Toast.LENGTH_SHORT).show()
      }
    } catch (e: Exception) {
      Toast.makeText(this, "Error saving: ${e.message}", Toast.LENGTH_SHORT).show()
    } finally {
      finish()
    }
  }
}

