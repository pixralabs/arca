package com.pixra.arca

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Window
import android.view.WindowManager
import androidx.activity.SystemBarStyle
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
 * True Edge-to-Edge System Bars:
 * - Transparent status bar and navigation bar with NO contrast scrims or color bands.
 * - SystemBarStyle.dark(Color.TRANSPARENT) explicitly passed to enableEdgeToEdge().
 * - WindowCompat.setDecorFitsSystemWindows(win, false) and isNavigationBarContrastEnforced = false
 *   enforced across lifecycle hooks so pure OLED black (#000000) bleeds behind the navigation bar.
 */
class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "ArcaMobile"

  override fun onCreate(savedInstanceState: Bundle?) {
    requestWindowFeature(Window.FEATURE_NO_TITLE)
    actionBar?.hide()

    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT)
    )

    installSplashScreen()

    super.onCreate(null)

    window?.let { win ->
      applyEdgeToEdgeWindow(win)
    }
  }

  override fun onResume() {
    super.onResume()
    actionBar?.hide()
    window?.let { win ->
      applyEdgeToEdgeWindow(win)
    }
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      window?.let { win ->
        applyEdgeToEdgeWindow(win)
      }
    }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    window?.let { win ->
      applyEdgeToEdgeWindow(win)
    }
  }

  private fun applyEdgeToEdgeWindow(win: Window) {
    WindowCompat.setDecorFitsSystemWindows(win, false)
    win.statusBarColor = Color.TRANSPARENT
    win.navigationBarColor = Color.TRANSPARENT

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      win.isNavigationBarContrastEnforced = false
      win.isStatusBarContrastEnforced = false
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      win.navigationBarDividerColor = Color.TRANSPARENT
    }

    win.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION)
    win.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS)
    win.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
    win.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)

    val controller = WindowCompat.getInsetsController(win, win.decorView)
    controller.isAppearanceLightStatusBars = false
    controller.isAppearanceLightNavigationBars = false
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
