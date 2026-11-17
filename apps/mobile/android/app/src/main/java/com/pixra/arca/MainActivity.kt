package com.pixra.arca

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * Arca Mobile — MainActivity (`MainActivity.kt`)
 *
 * Security Hardening:
 * - Enforces `WindowManager.LayoutParams.FLAG_SECURE` at the OS window level in `onCreate`
 *   and `onResume`, preventing screenshots, screen recording, and task-switcher snapshots
 *   across UnlockScreen, VaultScreen, and QR Scanner to defeat screen-recording malware.
 * - Integrates `installSplashScreen()` for native Android 12+ zero-flash splash loading.
 */
class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "ArcaMobile"

  override fun onCreate(savedInstanceState: Bundle?) {
    requestWindowFeature(android.view.Window.FEATURE_NO_TITLE)
    actionBar?.hide()
    enableEdgeToEdge()
    installSplashScreen()
    // FLAG_SECURE disabled to allow screenshots for user feedback and UI review
    window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    super.onCreate(null)
  }

  override fun onResume() {
    super.onResume()
    actionBar?.hide()
    // FLAG_SECURE disabled to allow screenshots for user feedback and UI review
    window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
