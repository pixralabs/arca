package com.pixra.arca

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Window
import android.view.WindowManager
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * Arca Mobile — MainActivity (`MainActivity.kt`)
 *
 * Security Hardening & Edge-to-Edge:
 * - Completely transparent status bar and navigation bar with NO dark contrast scrims
 *   (enforceNavigationBarContrast = false) for seamless edge-to-edge floating gesture controls.
 * - Enforces zero-flash splash loading via installSplashScreen().
 */
class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "ArcaMobile"

  override fun onCreate(savedInstanceState: Bundle?) {
    requestWindowFeature(Window.FEATURE_NO_TITLE)
    actionBar?.hide()
    enableEdgeToEdge()
    installSplashScreen()

    window?.let { win ->
      WindowCompat.setDecorFitsSystemWindows(win, false)
      win.statusBarColor = Color.TRANSPARENT
      win.navigationBarColor = Color.TRANSPARENT
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        win.isNavigationBarContrastEnforced = false
        win.isStatusBarContrastEnforced = false
      }
      // FLAG_SECURE disabled to allow screenshots for user feedback and UI review
      win.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    super.onCreate(null)
  }

  override fun onResume() {
    super.onResume()
    actionBar?.hide()
    window?.let { win ->
      win.statusBarColor = Color.TRANSPARENT
      win.navigationBarColor = Color.TRANSPARENT
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        win.isNavigationBarContrastEnforced = false
        win.isStatusBarContrastEnforced = false
      }
      // FLAG_SECURE disabled to allow screenshots for user feedback and UI review
      win.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
