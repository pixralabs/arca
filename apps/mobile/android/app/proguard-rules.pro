# React Native ProGuard Rules

# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt

# Keep our interfaces so they can be used by other ProGuard rules.
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters

# Do not strip any method/class that is annotated with @DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keep @com.facebook.proguard.annotations.DoNotStripAny class * {
    *;
}
-keep @com.facebook.jni.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.jni.annotations.DoNotStrip *;
}
-keep @com.facebook.jni.annotations.DoNotStripAny class * {
    *;
}

-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
  void set*(***);
  *** get*();
}

-keep class * implements com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }

-keepclassmembers,includedescriptorclasses class * { native <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }

# React Native & Hermes
-keep class com.facebook.react.** { *; }
-dontwarn com.facebook.react.**
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }
-keep,includedescriptorclasses class com.facebook.react.turbomodule.core.** { *; }
-keep,includedescriptorclasses class com.facebook.react.internal.turbomodule.core.** { *; }
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.hermes.**
-keep class com.facebook.jni.** { *; }

# SoLoader & Merged So Mapping
-keep class com.facebook.soloader.** { *; }
-dontwarn com.facebook.soloader.**
-keep class com.facebook.react.soloader.** { *; }
-keepclassmembers class com.facebook.react.soloader.** { *; }

# Okio / OkHttp
-keep class sun.misc.Unsafe { *; }
-dontwarn java.nio.file.*
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn okio.**
-dontwarn okhttp3.**

# Yoga
-keep,allowobfuscation @interface com.facebook.yoga.annotations.DoNotStrip
-keep @com.facebook.yoga.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.yoga.annotations.DoNotStrip *;
}

# Op-SQLite
-keep class com.op.sqlite.** { *; }
-keepclassmembers class com.op.sqlite.** { *; }

# React Native Biometrics / Keychain / Screens / Security
-keep class com.rnbiometrics.** { *; }
-keep class com.oblador.keychain.** { *; }
-keep class androidx.security.crypto.** { *; }
-dontwarn androidx.security.crypto.**
-keep class androidx.biometric.** { *; }
-dontwarn androidx.biometric.**
-keep class com.swmansion.rnscreens.** { *; }

# Pixra Arca Native Security & Sodium JSI
-keep class com.pixra.arca.** { *; }
-keepclassmembers class com.pixra.arca.** { *; }
-keep class com.standardnotes.sodium.** { *; }
-dontwarn com.standardnotes.sodium.**
-keepclassmembers class * { native <methods>; }

# Vision Camera
-keep class com.mrousavy.camera.** { *; }
-keepclassmembers class com.mrousavy.camera.** { *; }

# ViewShot
-keep class fr.greweb.reactnativeviewshot.** { *; }
-keepclassmembers class fr.greweb.reactnativeviewshot.** { *; }

# Reanimated
-keep class com.swmansion.reanimated.** { *; }
-keepclassmembers class com.swmansion.reanimated.** { *; }

# CodePush & AppCenter
-keep class com.microsoft.codepush.react.** { *; }
-keepclassmembers class com.microsoft.codepush.react.** { *; }
-keep class com.microsoft.appcenter.** { *; }
-dontwarn com.microsoft.appcenter.**
-dontwarn com.microsoft.codepush.react.**
-dontwarn com.nimbusds.jose.**

# JailMonkey / RootBeer Anti-Tamper
-keep class com.gantix.JailMonkey.** { *; }
-dontwarn com.gantix.JailMonkey.**
-keep class com.scottyab.rootbeer.** { *; }
-dontwarn com.scottyab.rootbeer.**
