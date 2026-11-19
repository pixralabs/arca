package com.pixra.arca.autofill

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.autofill.AutofillId
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import android.service.autofill.Dataset
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat

class AutofillAuthActivity : AppCompatActivity() {

  companion object {
    private const val TAG = "AutofillAuthActivity"
    const val EXTRA_ACTION = "EXTRA_ACTION"
    const val ACTION_SUGGEST_PASSWORD = "ACTION_SUGGEST_PASSWORD"
    const val ACTION_UNLOCK_CREDENTIAL = "ACTION_UNLOCK_CREDENTIAL"

    const val EXTRA_AUTOFILL_USERNAME_ID = "EXTRA_AUTOFILL_USERNAME_ID"
    const val EXTRA_AUTOFILL_PASSWORD_ID = "EXTRA_AUTOFILL_PASSWORD_ID"
    const val EXTRA_USERNAME = "EXTRA_USERNAME"
    const val EXTRA_ITEM_ID = "EXTRA_ITEM_ID"
    const val EXTRA_CIPHERTEXT = "EXTRA_CIPHERTEXT"
    const val EXTRA_NONCE = "EXTRA_NONCE"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val action = intent.getStringExtra(EXTRA_ACTION) ?: ACTION_UNLOCK_CREDENTIAL
    val usernameId: AutofillId? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(EXTRA_AUTOFILL_USERNAME_ID, AutofillId::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(EXTRA_AUTOFILL_USERNAME_ID)
    }

    val passwordId: AutofillId? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(EXTRA_AUTOFILL_PASSWORD_ID, AutofillId::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(EXTRA_AUTOFILL_PASSWORD_ID)
    }

    if (action == ACTION_SUGGEST_PASSWORD) {
      handleSuggestPassword(passwordId)
      return
    }

    handleUnlockCredential(usernameId, passwordId)
  }

  private fun handleSuggestPassword(passwordId: AutofillId?) {
    val generated = ArcaPasswordGenerator.generate(20)
    val datasetBuilder = Dataset.Builder()

    if (passwordId != null) {
      datasetBuilder.setValue(passwordId, AutofillValue.forText(generated))
    }

    val replyIntent = Intent().apply {
      putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, datasetBuilder.build())
    }
    setResult(Activity.RESULT_OK, replyIntent)
    finish()
  }

  private fun handleUnlockCredential(usernameId: AutofillId?, passwordId: AutofillId?) {
    val username = intent.getStringExtra(EXTRA_USERNAME)
    val itemId = intent.getStringExtra(EXTRA_ITEM_ID) ?: ""
    val ciphertext = intent.getStringExtra(EXTRA_CIPHERTEXT) ?: ""
    val nonce = intent.getStringExtra(EXTRA_NONCE) ?: ""

    val biometricManager = BiometricManager.from(this)
    val canAuthenticate = biometricManager.canAuthenticate(
      BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
    )

    if (canAuthenticate != BiometricManager.BIOMETRIC_SUCCESS) {
      // Biometrics not enrolled or supported: attempt direct fill if DEK is present
      val password = ArcaAutofillBridge.decryptPassword(this, itemId, ciphertext, nonce)
      if (password != null) {
        fillAndFinish(usernameId, passwordId, username, password)
      } else {
        Toast.makeText(this, "Unlock Arca app first to use Autofill", Toast.LENGTH_SHORT).show()
        setResult(Activity.RESULT_CANCELED)
        finish()
      }
      return
    }

    val executor = ContextCompat.getMainExecutor(this)
    val prompt = BiometricPrompt(this, executor, object : BiometricPrompt.AuthenticationCallback() {
      override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
        super.onAuthenticationSucceeded(result)
        val password = ArcaAutofillBridge.decryptPassword(this@AutofillAuthActivity, itemId, ciphertext, nonce)
        if (!password.isNullOrEmpty()) {
          fillAndFinish(usernameId, passwordId, username, password)
        } else {
          Toast.makeText(this@AutofillAuthActivity, "Could not decrypt vault item", Toast.LENGTH_SHORT).show()
          setResult(Activity.RESULT_CANCELED)
          finish()
        }
      }

      override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
        super.onAuthenticationError(errorCode, errString)
        setResult(Activity.RESULT_CANCELED)
        finish()
      }

      override fun onAuthenticationFailed() {
        super.onAuthenticationFailed()
      }
    })

    val promptInfo = BiometricPrompt.PromptInfo.Builder()
      .setTitle("Unlock Arca Vault")
      .setSubtitle(if (!username.isNullOrBlank()) "Autofill $username" else "Confirm identity to autofill")
      .setAllowedAuthenticators(
        BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL
      )
      .build()

    prompt.authenticate(promptInfo)
  }

  private fun fillAndFinish(
    usernameId: AutofillId?,
    passwordId: AutofillId?,
    username: String?,
    password: String
  ) {
    val datasetBuilder = Dataset.Builder()
    if (usernameId != null && !username.isNullOrEmpty()) {
      datasetBuilder.setValue(usernameId, AutofillValue.forText(username))
    }
    if (passwordId != null) {
      datasetBuilder.setValue(passwordId, AutofillValue.forText(password))
    }

    val replyIntent = Intent().apply {
      putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, datasetBuilder.build())
    }
    setResult(Activity.RESULT_OK, replyIntent)
    finish()
  }
}

