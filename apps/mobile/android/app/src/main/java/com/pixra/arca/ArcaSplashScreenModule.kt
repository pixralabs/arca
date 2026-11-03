package com.pixra.arca

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ArcaSplashScreenModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName(): String = "ArcaSplashScreen"

    @ReactMethod
    fun hide() {
        MainActivity.hideSplashScreen()
    }
}
