package com.pixra.arca

import android.os.Bundle
import android.view.WindowManager
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
    installSplashScreen()
    // Enable FLAG_SECURE prior to super.onCreate to block screenshots, screen recording,
    // and Android Recents thumbnail capture from frame 0.
    window?.setFlags(
      WindowManager.LayoutParams.FLAG_SECURE,
      WindowManager.LayoutParams.FLAG_SECURE
    )
    super.onCreate(null)
  }

  override fun onResume() {
    super.onResume()
    window?.setFlags(
      WindowManager.LayoutParams.FLAG_SECURE,
      WindowManager.LayoutParams.FLAG_SECURE
    )
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
