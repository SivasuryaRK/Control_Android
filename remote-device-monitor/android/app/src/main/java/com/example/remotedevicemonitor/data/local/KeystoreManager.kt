package com.example.remotedevicemonitor.data.local

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * KeystoreManager — stores sensitive credentials in EncryptedSharedPreferences
 * backed by Android Keystore. No secrets are hardcoded.
 */
class KeystoreManager(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        PREFS_FILE,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    // ── Access token ───────────────────────────────────────────────

    fun saveAccessToken(token: String) = prefs.edit().putString(KEY_ACCESS_TOKEN, token).apply()
    fun getAccessToken(): String?       = prefs.getString(KEY_ACCESS_TOKEN, null)
    fun clearAccessToken()              = prefs.edit().remove(KEY_ACCESS_TOKEN).apply()

    // ── Refresh token ──────────────────────────────────────────────

    fun saveRefreshToken(token: String) = prefs.edit().putString(KEY_REFRESH_TOKEN, token).apply()
    fun getRefreshToken(): String?       = prefs.getString(KEY_REFRESH_TOKEN, null)
    fun clearRefreshToken()              = prefs.edit().remove(KEY_REFRESH_TOKEN).apply()

    // ── Device ID & Token ──────────────────────────────────────────

    fun saveDeviceId(id: String) = prefs.edit().putString(KEY_DEVICE_ID, id).apply()
    fun getDeviceId(): String?   = prefs.getString(KEY_DEVICE_ID, null)

    fun saveDeviceToken(token: String) = prefs.edit().putString(KEY_DEVICE_TOKEN, token).apply()
    fun getDeviceToken(): String?       = prefs.getString(KEY_DEVICE_TOKEN, null)
    fun clearDeviceToken()              = prefs.edit().remove(KEY_DEVICE_TOKEN).apply()

    // ── User info (non-sensitive, stored for convenience) ──────────

    fun saveUserId(id: String)    = prefs.edit().putString(KEY_USER_ID, id).apply()
    fun getUserId(): String?      = prefs.getString(KEY_USER_ID, null)

    fun saveUserName(name: String) = prefs.edit().putString(KEY_USER_NAME, name).apply()
    fun getUserName(): String?     = prefs.getString(KEY_USER_NAME, null)

    fun saveUserEmail(email: String) = prefs.edit().putString(KEY_USER_EMAIL, email).apply()
    fun getUserEmail(): String?      = prefs.getString(KEY_USER_EMAIL, null)

    fun saveServerUrl(url: String) = prefs.edit().putString(KEY_SERVER_URL, url.trim().removeSuffix("/")).apply()
    fun getServerUrl(): String = prefs.getString(KEY_SERVER_URL, null)?.trim()?.removeSuffix("/") ?: com.example.remotedevicemonitor.BuildConfig.SERVER_BASE_URL.trim().removeSuffix("/")

    fun getCandidateUrls(): List<String> {
        val configured = getServerUrl()
        val list = mutableListOf<String>()
        if (configured.isNotEmpty()) list.add(configured)
        val defaults = listOf(
            "http://192.168.1.4:3000",
            "http://192.168.1.6:3000",
            "http://10.109.216.24:3000",
            "http://192.168.3.143:3000",
            "http://10.0.2.2:3000"
        )
        for (d in defaults) {
            if (!list.contains(d)) list.add(d)
        }

        // Dynamically append candidates on current Wi-Fi subnet (e.g. 192.168.1.X)
        val subnet = getLocalWifiSubnetPrefix()
        if (subnet != null) {
            val commonHosts = listOf(4, 6, 2, 3, 5, 7, 8, 9, 10, 11, 12, 15, 20, 50, 100, 101, 102)
            for (h in commonHosts) {
                val candidate = "http://$subnet.$h:3000"
                if (!list.contains(candidate)) {
                    list.add(candidate)
                }
            }
        }
        return list
    }

    private fun getLocalWifiSubnetPrefix(): String? {
        try {
            val interfaces = java.net.NetworkInterface.getNetworkInterfaces()
            while (interfaces.hasMoreElements()) {
                val iface = interfaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                val addrs = iface.inetAddresses
                while (addrs.hasMoreElements()) {
                    val addr = addrs.nextElement()
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        val host = addr.hostAddress
                        if (host != null && host.contains(".")) {
                            val parts = host.split(".")
                            if (parts.size == 4) {
                                return "${parts[0]}.${parts[1]}.${parts[2]}"
                            }
                        }
                    }
                }
            }
        } catch (_: Exception) {}
        return null
    }

    // ── Paired state ────────────────────────────────────────────────

    /**
     * True if the device has been paired (has a deviceId + at least one auth token).
     * Used by the service to decide whether to start monitoring on boot.
     */
    fun isPaired(): Boolean =
        getDeviceId() != null && (getDeviceToken() != null || getAccessToken() != null)

    // ── Clear credentials ───────────────────────────────────────────

    /** Clears all stored data (full logout + unpair). */
    fun clearAll() = prefs.edit().clear().apply()

    /**
     * Clears auth credentials only (access + device tokens, device ID, user info)
     * but keeps server URL for future pairing attempts.
     */
    fun clearCredentialsOnly() {
        prefs.edit()
            .remove(KEY_ACCESS_TOKEN)
            .remove(KEY_REFRESH_TOKEN)
            .remove(KEY_DEVICE_ID)
            .remove(KEY_DEVICE_TOKEN)
            .remove(KEY_USER_ID)
            .remove(KEY_USER_NAME)
            .remove(KEY_USER_EMAIL)
            .apply()
    }


    companion object {
        private const val PREFS_FILE        = "rdm_secure_prefs"
        private const val KEY_ACCESS_TOKEN  = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_DEVICE_ID     = "device_id"
        private const val KEY_DEVICE_TOKEN  = "device_token"
        private const val KEY_USER_ID       = "user_id"
        private const val KEY_USER_NAME     = "user_name"
        private const val KEY_USER_EMAIL    = "user_email"
        private const val KEY_SERVER_URL    = "server_url"
    }
}
