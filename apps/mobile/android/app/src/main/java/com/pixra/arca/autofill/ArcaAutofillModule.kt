package com.pixra.arca.autofill

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.autofill.AutofillManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ArcaAutofillModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ArcaAutofillModule"

  @ReactMethod
  fun isAutofillEnabled(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val afm = reactContext.getSystemService(AutofillManager::class.java)
        val enabled = afm?.hasEnabledAutofillServices() ?: false
        promise.resolve(enabled)
      } else {
        promise.resolve(false)
      }
    } catch (e: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun openAutofillSettings(promise: Promise) {
    try {
      val activity = reactContext.currentActivity
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val intent = Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).apply {
          data = Uri.parse("package:${reactContext.packageName}")
          if (activity == null) {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
        }
        try {
          if (activity != null) {
            activity.startActivity(intent)
          } else {
            reactContext.startActivity(intent)
          }
          promise.resolve(true)
        } catch (_: Exception) {
          // Fallback to standard Autofill settings page
          val fallbackIntent = Intent("android.settings.REQUEST_SET_AUTOFILL_SERVICE").apply {
            data = Uri.parse("package:${reactContext.packageName}")
            if (activity == null) {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          }
          if (activity != null) {
            activity.startActivity(fallbackIntent)
          } else {
            reactContext.startActivity(fallbackIntent)
          }
          promise.resolve(true)
        }
      } else {
        promise.reject("ERR_NOT_SUPPORTED", "Autofill requires Android 8.0 (API 26) or higher")
      }
    } catch (e: Exception) {
      promise.reject("ERR_OPEN_SETTINGS", e.message ?: "Failed to open autofill settings", e)
    }
  }

  @ReactMethod
  fun setAutofillDek(dekHex: String, promise: Promise) {
    try {
      ArcaAutofillBridge.storeDek(reactContext, dekHex)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ERR_STORE_DEK", e.message ?: "Failed to store DEK for autofill", e)
    }
  }

  @ReactMethod
  fun clearAutofillDek(promise: Promise) {
    try {
      ArcaAutofillBridge.clearDek(reactContext)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ERR_CLEAR_DEK", e.message ?: "Failed to clear DEK", e)
    }
  }
}

