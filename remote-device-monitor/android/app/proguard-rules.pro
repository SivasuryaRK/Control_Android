# Proguard rules for Remote Device Monitor

# Retrofit
-dontwarn retrofit2.**
-keep class retrofit2.** { *; }
-keepattributes Signature
-keepattributes Exceptions

# Gson
-keepattributes *Annotation*
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keep class com.example.remotedevicemonitor.data.model.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# Socket.IO
-keep class io.socket.** { *; }
-keep class org.json.** { *; }

# Android Keystore & Security Crypto
-keep class androidx.security.crypto.** { *; }
