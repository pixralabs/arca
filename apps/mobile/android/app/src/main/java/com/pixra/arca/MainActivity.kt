package com.pixra.arca

import android.content.ComponentName
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

    override fun getMainComponentName(): String = "ArcaMobile"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        applyThemeIcon(resources.configuration)
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

