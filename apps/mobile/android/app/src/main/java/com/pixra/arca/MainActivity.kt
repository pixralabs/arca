package com.pixra.arca

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ObjectAnimator
import android.content.ComponentName
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.animation.AccelerateInterpolator
import android.widget.EditText
import android.widget.TextView
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

    companion object {
        private var instance: MainActivity? = null
        private var isAppReady = false
        private var splashScreenViewRef: Any? = null

        fun hideSplashScreen() {
            isAppReady = true
            instance?.runOnUiThread {
                instance?.let { act ->
                    act.applySystemBars(act.resources.configuration)
                    act.dismissSplashScreen()
                }
            }
        }

        fun updateSystemBarsTheme(isDarkMode: Boolean) {
            instance?.runOnUiThread {
                instance?.setSystemBarsTheme(isDarkMode)
            }
        }
    }

    override fun getMainComponentName(): String = "ArcaMobile"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        instance = this
        isAppReady = false
        splashScreenViewRef = null

        // Suppress React Native debug loading banner ("Loading from 10.0.2.2:8081...")
        try {
            com.facebook.react.devsupport.DefaultDevLoadingViewImplementation.setDevLoadingEnabled(false)
        } catch (_: Throwable) {}

        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
            window.isStatusBarContrastEnforced = false
        }
        window.navigationBarColor = Color.TRANSPARENT
        window.statusBarColor = Color.TRANSPARENT

        applyThemeIcon(resources.configuration)
        applySystemBars(resources.configuration)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            splashScreen.setOnExitAnimationListener { splashScreenView ->
                splashScreenViewRef = splashScreenView
                if (isAppReady) {
                    dismissSplashScreen()
                }
            }
        }

        // Safety fallback: Dismiss after 5 seconds if React Native takes too long
        Handler(Looper.getMainLooper()).postDelayed({
            if (splashScreenViewRef != null) {
                hideSplashScreen()
            }
        }, 5000L)
    }

    private fun dismissSplashScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val splashView = splashScreenViewRef as? android.window.SplashScreenView ?: return
            splashScreenViewRef = null
            val fadeOut = ObjectAnimator.ofFloat(
                splashView,
                View.ALPHA,
                1f,
                0f
            )
            fadeOut.duration = 200L
            fadeOut.interpolator = AccelerateInterpolator()
            fadeOut.addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    splashView.remove()
                }
            })
            fadeOut.start()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        applyThemeIcon(newConfig)
        applySystemBars(newConfig)
    }

    private fun applySystemBars(config: Configuration) {
        try {
            val currentNightMode = config.uiMode and Configuration.UI_MODE_NIGHT_MASK
            val isDarkMode = currentNightMode == Configuration.UI_MODE_NIGHT_YES
            setSystemBarsTheme(isDarkMode)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun setSystemBarsTheme(isDarkMode: Boolean) {
        try {
            val bgColor = if (isDarkMode) Color.parseColor("#09090b") else Color.parseColor("#fafafa")
            window.setBackgroundDrawable(ColorDrawable(bgColor))
            window.navigationBarColor = Color.TRANSPARENT
            window.statusBarColor = Color.TRANSPARENT

            val insetsController = WindowCompat.getInsetsController(window, window.decorView)
            insetsController.isAppearanceLightNavigationBars = !isDarkMode
            insetsController.isAppearanceLightStatusBars = !isDarkMode

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                window.isNavigationBarContrastEnforced = false
                window.isStatusBarContrastEnforced = false
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun applyThemeIcon(config: Configuration) {
        try {
            val currentNightMode = config.uiMode and Configuration.UI_MODE_NIGHT_MASK
            val isDarkMode = currentNightMode == Configuration.UI_MODE_NIGHT_YES

            val pkg = packageName
            val pm = packageManager

            // Dark Mode -> Light Icon (img 1) for pop & clarity on dark backgrounds
            // Light Mode -> Dark Icon (img 2) for contrast on light backgrounds
            val targetEnableAlias = if (isDarkMode) "$pkg.MainActivityLight" else "$pkg.MainActivityDark"
            val targetDisableAlias = if (isDarkMode) "$pkg.MainActivityDark" else "$pkg.MainActivityLight"

            val enableComp = ComponentName(pkg, targetEnableAlias)
            val disableComp = ComponentName(pkg, targetDisableAlias)

            if (pm.getComponentEnabledSetting(enableComp) != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
                pm.setComponentEnabledSetting(
                    enableComp,
                    PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                    PackageManager.DONT_KILL_APP
                )
                pm.setComponentEnabledSetting(
                    disableComp,
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}
