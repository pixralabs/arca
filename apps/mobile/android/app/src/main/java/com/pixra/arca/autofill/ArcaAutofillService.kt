package com.pixra.arca.autofill

import android.app.PendingIntent
import android.app.assist.AssistStructure
import android.content.Intent
import android.graphics.drawable.Icon
import android.os.Build
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.InlinePresentation
import android.service.autofill.SaveCallback
import android.service.autofill.SaveInfo
import android.service.autofill.SaveRequest
import android.util.Log
import android.view.View
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import androidx.autofill.HintConstants
import androidx.autofill.inline.v1.InlineSuggestionUi
import com.pixra.arca.R

class ArcaAutofillService : AutofillService() {

  companion object {
    private const val TAG = "ArcaAutofillService"
  }

  private data class ParsedFields(
    var usernameId: AutofillId? = null,
    var passwordId: AutofillId? = null,
    var confirmPasswordId: AutofillId? = null,
    var isNewPassword: Boolean = false,
    var webDomain: String? = null,
    var packageName: String? = null
  )

  override fun onFillRequest(
    request: FillRequest,
    cancellationSignal: CancellationSignal,
    callback: FillCallback
  ) {
    try {
      val structure = request.fillContexts.lastOrNull()?.structure
      if (structure == null) {
        callback.onSuccess(null)
        return
      }

      val parsed = ParsedFields()
      parsed.packageName = structure.activityComponent?.packageName

      for (i in 0 until structure.windowNodeCount) {
        val windowNode = structure.getWindowNodeAt(i)
        traverseNode(windowNode.rootViewNode, parsed)
      }

      if (parsed.usernameId == null && parsed.passwordId == null) {
        Log.d(TAG, "No username or password fields detected")
        callback.onSuccess(null)
        return
      }

      val responseBuilder = FillResponse.Builder()
      val dbHelper = ArcaVaultDbHelper(this)

      val queryTarget = extractSearchTerm(parsed.webDomain, parsed.packageName)
      val credentials = dbHelper.searchCredentials(queryTarget)

      var datasetCount = 0

      // 1. Suggest Strong Password chip if on registration / new-password screen
      if (parsed.passwordId != null && parsed.isNewPassword) {
        val suggestDataset = buildSuggestPasswordDataset(request, parsed)
        if (suggestDataset != null) {
          responseBuilder.addDataset(suggestDataset)
          datasetCount++
        }
      }

      // 2. Add matching credentials from Arca Vault
      for (item in credentials) {
        val credDataset = buildCredentialDataset(request, parsed, item)
        if (credDataset != null) {
          responseBuilder.addDataset(credDataset)
          datasetCount++
        }
      }

      // 3. Fallback: If not already added and password field exists, offer Suggest Strong Password
      if (datasetCount == 0 && parsed.passwordId != null) {
        val suggestDataset = buildSuggestPasswordDataset(request, parsed)
        if (suggestDataset != null) {
          responseBuilder.addDataset(suggestDataset)
          datasetCount++
        }
      }

      // 4. Configure SaveInfo so browser/app submission triggers "Save to Arca?"
      val saveIds = mutableListOf<AutofillId>()
      parsed.usernameId?.let { saveIds.add(it) }
      parsed.passwordId?.let { saveIds.add(it) }
      if (saveIds.isNotEmpty()) {
        val saveType = if (parsed.passwordId != null) {
          SaveInfo.SAVE_DATA_TYPE_PASSWORD or SaveInfo.SAVE_DATA_TYPE_USERNAME
        } else {
          SaveInfo.SAVE_DATA_TYPE_USERNAME
        }

        val saveInfo = SaveInfo.Builder(saveType, saveIds.toTypedArray())
          .setDescription("Arca Zero-Knowledge Vault")
          .build()
        responseBuilder.setSaveInfo(saveInfo)
      }

      if (datasetCount > 0) {
        callback.onSuccess(responseBuilder.build())
      } else {
        callback.onSuccess(null)
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error in onFillRequest: ${e.message}", e)
      callback.onSuccess(null)
    }
  }

  override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
    try {
      val structure = request.fillContexts.lastOrNull()?.structure
      if (structure == null) {
        callback.onSuccess()
        return
      }

      var extractedUser = ""
      var extractedPass = ""
      var appTitle = structure.activityComponent?.packageName ?: "New Login"

      for (i in 0 until structure.windowNodeCount) {
        val windowNode = structure.getWindowNodeAt(i)
        extractValues(windowNode.rootViewNode, object : ValueConsumer {
          override fun onUsername(value: String) {
            if (extractedUser.isEmpty()) extractedUser = value
          }
          override fun onPassword(value: String) {
            if (extractedPass.isEmpty()) extractedPass = value
          }
          override fun onTitle(domain: String) {
            appTitle = domain
          }
        })
      }

      if (extractedPass.isNotEmpty()) {
        val saveIntent = Intent(this, AutofillSaveActivity::class.java).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
          putExtra(AutofillSaveActivity.EXTRA_TITLE, appTitle)
          putExtra(AutofillSaveActivity.EXTRA_USERNAME, extractedUser)
          putExtra(AutofillSaveActivity.EXTRA_PASSWORD, extractedPass)
        }
        startActivity(saveIntent)
      }

      callback.onSuccess()
    } catch (e: Exception) {
      Log.e(TAG, "Error in onSaveRequest: ${e.message}", e)
      callback.onSuccess()
    }
  }

  private fun buildSuggestPasswordDataset(
    request: FillRequest,
    parsed: ParsedFields
  ): Dataset? {
    val passwordId = parsed.passwordId ?: return null

    val intent = Intent(this, AutofillAuthActivity::class.java).apply {
      putExtra(AutofillAuthActivity.EXTRA_ACTION, AutofillAuthActivity.ACTION_SUGGEST_PASSWORD)
      putExtra(AutofillAuthActivity.EXTRA_AUTOFILL_PASSWORD_ID, passwordId)
    }
    val pendingIntent = PendingIntent.getActivity(
      this,
      1001,
      intent,
      PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_MUTABLE
    )

    val datasetBuilder = Dataset.Builder()

    // RemoteViews Dropdown Presentation
    val dropdownViews = RemoteViews(packageName, R.layout.autofill_dropdown_item).apply {
      setTextViewText(R.id.autofill_dropdown_title, "✨ Suggest Strong Password")
      setTextViewText(R.id.autofill_dropdown_subtitle, "20-char High-Entropy • Arca")
    }
    datasetBuilder.setValue(passwordId, AutofillValue.forText(""), dropdownViews)

    // Android 11+ Inline Suggestion Presentation (Keyboard Bar)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val inlineReq = request.inlineSuggestionsRequest
      if (inlineReq != null && inlineReq.inlinePresentationSpecs.isNotEmpty()) {
        try {
          val spec = inlineReq.inlinePresentationSpecs.first()
          val slice = InlineSuggestionUi.newContentBuilder(pendingIntent)
            .setTitle("Suggest Strong Password ✨")
            .setSubtitle("Arca")
            .setStartIcon(Icon.createWithResource(this, R.drawable.ic_launcher_monochrome))
            .setContentDescription("Arca Strong Password Suggestion")
            .build()
            .slice
          val inlinePres = InlinePresentation(slice, spec, false)
          datasetBuilder.setInlinePresentation(inlinePres)
        } catch (e: Exception) {
          Log.w(TAG, "Inline presentation error: ${e.message}")
        }
      }
    }

    datasetBuilder.setAuthentication(pendingIntent.intentSender)
    return datasetBuilder.build()
  }

  private fun buildCredentialDataset(
    request: FillRequest,
    parsed: ParsedFields,
    item: VaultItemSummary
  ): Dataset? {
    val targetId = parsed.usernameId ?: parsed.passwordId ?: return null

    val intent = Intent(this, AutofillAuthActivity::class.java).apply {
      putExtra(AutofillAuthActivity.EXTRA_ACTION, AutofillAuthActivity.ACTION_UNLOCK_CREDENTIAL)
      putExtra(AutofillAuthActivity.EXTRA_AUTOFILL_USERNAME_ID, parsed.usernameId)
      putExtra(AutofillAuthActivity.EXTRA_AUTOFILL_PASSWORD_ID, parsed.passwordId)
      putExtra(AutofillAuthActivity.EXTRA_USERNAME, item.username)
      putExtra(AutofillAuthActivity.EXTRA_ITEM_ID, item.id)
      putExtra(AutofillAuthActivity.EXTRA_CIPHERTEXT, item.ciphertext)
      putExtra(AutofillAuthActivity.EXTRA_NONCE, item.nonce)
    }

    val requestCode = (item.id.hashCode() and 0xFFFF)
    val pendingIntent = PendingIntent.getActivity(
      this,
      requestCode,
      intent,
      PendingIntent.FLAG_CANCEL_CURRENT or PendingIntent.FLAG_MUTABLE
    )

    val datasetBuilder = Dataset.Builder()

    val displayUser = item.username ?: item.title
    val displayTitle = item.title

    // RemoteViews Dropdown Presentation
    val dropdownViews = RemoteViews(packageName, R.layout.autofill_dropdown_item).apply {
      setTextViewText(R.id.autofill_dropdown_title, displayUser)
      setTextViewText(R.id.autofill_dropdown_subtitle, displayTitle)
    }
    datasetBuilder.setValue(targetId, AutofillValue.forText(""), dropdownViews)

    // Android 11+ Inline Suggestion Presentation (Keyboard Bar)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val inlineReq = request.inlineSuggestionsRequest
      if (inlineReq != null && inlineReq.inlinePresentationSpecs.isNotEmpty()) {
        try {
          val spec = inlineReq.inlinePresentationSpecs.first()
          val slice = InlineSuggestionUi.newContentBuilder(pendingIntent)
            .setTitle(displayUser)
            .setSubtitle(displayTitle)
            .setStartIcon(Icon.createWithResource(this, R.drawable.ic_launcher_monochrome))
            .setContentDescription("Autofill with Arca: $displayUser")
            .build()
            .slice
          val inlinePres = InlinePresentation(slice, spec, false)
          datasetBuilder.setInlinePresentation(inlinePres)
        } catch (e: Exception) {
          Log.w(TAG, "Inline presentation build failed: ${e.message}")
        }
      }
    }

    datasetBuilder.setAuthentication(pendingIntent.intentSender)
    return datasetBuilder.build()
  }

  private fun traverseNode(node: AssistStructure.ViewNode, parsed: ParsedFields) {
    node.webDomain?.let { domain ->
      if (domain.isNotBlank()) parsed.webDomain = domain
    }

    val hints = node.autofillHints ?: emptyArray()
    val hintText = (node.hint ?: "").toString().lowercase()
    val idEntry = (node.idEntry ?: "").toString().lowercase()
    val className = (node.className ?: "").toString().lowercase()

    val isPasswordType = node.inputType and android.text.InputType.TYPE_MASK_VARIATION ==
      android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD ||
      node.inputType and android.text.InputType.TYPE_MASK_VARIATION ==
      android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
      node.inputType and android.text.InputType.TYPE_MASK_VARIATION ==
      android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
      hints.contains(View.AUTOFILL_HINT_PASSWORD) ||
      hints.contains(HintConstants.AUTOFILL_HINT_NEW_PASSWORD) ||
      idEntry.contains("password") || idEntry.contains("pwd") ||
      hintText.contains("password") || hintText.contains("pwd")

    val isNewPassIndicator = hints.contains(HintConstants.AUTOFILL_HINT_NEW_PASSWORD) ||
      idEntry.contains("new_pass") || idEntry.contains("create_pass") ||
      idEntry.contains("signup") || idEntry.contains("register") ||
      hintText.contains("new password") || hintText.contains("create password") ||
      hintText.contains("strong password")

    if (isPasswordType) {
      if (parsed.passwordId == null) {
        parsed.passwordId = node.autofillId
        if (isNewPassIndicator) parsed.isNewPassword = true
      } else if (parsed.confirmPasswordId == null) {
        parsed.confirmPasswordId = node.autofillId
        parsed.isNewPassword = true
      }
    }

    val isUsernameIndicator = hints.contains(View.AUTOFILL_HINT_USERNAME) ||
      hints.contains(View.AUTOFILL_HINT_EMAIL_ADDRESS) ||
      hints.contains(View.AUTOFILL_HINT_PHONE) ||
      idEntry.contains("email") || idEntry.contains("user") ||
      idEntry.contains("login") || idEntry.contains("account") ||
      hintText.contains("email") || hintText.contains("username") ||
      hintText.contains("phone") || hintText.contains("mobile")

    if (isUsernameIndicator && !isPasswordType) {
      if (parsed.usernameId == null) {
        parsed.usernameId = node.autofillId
      }
    }

    for (i in 0 until node.childCount) {
      traverseNode(node.getChildAt(i), parsed)
    }
  }

  private interface ValueConsumer {
    fun onUsername(value: String)
    fun onPassword(value: String)
    fun onTitle(domain: String)
  }

  private fun extractValues(node: AssistStructure.ViewNode, consumer: ValueConsumer) {
    node.webDomain?.let { domain ->
      if (domain.isNotBlank()) consumer.onTitle(cleanDomain(domain))
    }

    val text = node.autofillValue?.textValue?.toString()
      ?: node.text?.toString() ?: ""

    if (text.isNotBlank()) {
      val hints = node.autofillHints ?: emptyArray()
      val idEntry = (node.idEntry ?: "").toString().lowercase()
      val hintText = (node.hint ?: "").toString().lowercase()

      val isPassword = node.inputType and android.text.InputType.TYPE_MASK_VARIATION ==
        android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD ||
        node.inputType and android.text.InputType.TYPE_MASK_VARIATION ==
        android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD ||
        node.inputType and android.text.InputType.TYPE_MASK_VARIATION ==
        android.text.InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
        hints.contains(View.AUTOFILL_HINT_PASSWORD) ||
        hints.contains(HintConstants.AUTOFILL_HINT_NEW_PASSWORD) ||
        idEntry.contains("password") || idEntry.contains("pwd") ||
        hintText.contains("password")

      if (isPassword) {
        consumer.onPassword(text)
      } else if (text.contains("@") || idEntry.contains("user") || idEntry.contains("email")) {
        consumer.onUsername(text)
      }
    }

    for (i in 0 until node.childCount) {
      extractValues(node.getChildAt(i), consumer)
    }
  }

  private fun extractSearchTerm(webDomain: String?, packageName: String?): String {
    if (!webDomain.isNullOrBlank()) {
      return cleanDomain(webDomain)
    }
    if (!packageName.isNullOrBlank()) {
      val parts = packageName.split(".")
      if (parts.size >= 2) {
        val candidate = parts[1].lowercase()
        if (candidate != "android" && candidate != "google" && candidate != "apps") {
          return candidate
        }
        return parts.last().lowercase()
      }
    }
    return ""
  }

  private fun cleanDomain(raw: String): String {
    var domain = raw.lowercase()
    if (domain.startsWith("https://")) domain = domain.removePrefix("https://")
    if (domain.startsWith("http://")) domain = domain.removePrefix("http://")
    if (domain.startsWith("www.")) domain = domain.removePrefix("www.")
    val slashIdx = domain.indexOf('/')
    if (slashIdx != -1) domain = domain.substring(0, slashIdx)
    return domain
  }
}

