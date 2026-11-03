package com.pixra.arca

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ObjectAnimator
import android.content.ComponentName
import android.content.pm.PackageManager
import android.content.res.Configuration
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
                instance?.dismissSplashScreen()
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

        applyThemeIcon(resources.configuration)

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

        // Automatic content detection: When real UI components (TextView/EditText) render, dismiss splash
        val content: View = findViewById(android.R.id.content)
        content.viewTreeObserver.addOnGlobalLayoutListener(object : ViewTreeObserver.OnGlobalLayoutListener {
            override fun onGlobalLayout() {
                if (hasRenderedContent(content)) {
                    content.viewTreeObserver.removeOnGlobalLayoutListener(this)
                    hideSplashScreen()
                }
            }
        })
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
            fadeOut.duration = 250L
            fadeOut.interpolator = AccelerateInterpolator()
            fadeOut.addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    splashView.remove()
                }
            })
            fadeOut.start()
        }
    }

    private fun hasRenderedContent(view: View?): Boolean {
        if (view == null) return false
        if (view is TextView && view.text.isNotEmpty()) {
            return true
        }
        if (view is EditText) {
            return true
        }
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                if (hasRenderedContent(view.getChildAt(i))) {
                    return true
                }
            }
        }
        return false
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
