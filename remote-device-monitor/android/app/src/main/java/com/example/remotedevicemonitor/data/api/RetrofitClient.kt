package com.example.remotedevicemonitor.data.api

import com.example.remotedevicemonitor.BuildConfig
import com.example.remotedevicemonitor.data.local.KeystoreManager
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {

    private var cachedBaseUrl: String? = null
    private var cachedApiService: ApiService? = null

    fun create(keystoreManager: KeystoreManager): ApiService {
        val rawUrl = keystoreManager.getServerUrl().trim().removeSuffix("/")
        val serverUrl = if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
            "$rawUrl/"
        } else {
            "http://$rawUrl/"
        }

        if (cachedApiService != null && cachedBaseUrl == serverUrl) {
            return cachedApiService!!
        }

        val logging = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG)
                HttpLoggingInterceptor.Level.BODY
            else
                HttpLoggingInterceptor.Level.NONE
        }

        val client = OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(logging)
            // Attach Bearer token + Multi-IP automatic failover interceptor
            .addInterceptor { chain ->
                val request = chain.request()
                val token = keystoreManager.getAccessToken() ?: keystoreManager.getDeviceToken()
                val builder = request.newBuilder()
                    .addHeader("bypass-tunnel-reminder", "true")
                    .addHeader("ngrok-skip-browser-warning", "true")
                if (token != null) {
                    builder.addHeader("Authorization", "Bearer $token")
                }

                val builtRequest = builder.build()

                try {
                    val response = chain.proceed(builtRequest)
                    if (response.code != 503 && response.code != 502) {
                        return@addInterceptor response
                    }
                    response.close()
                } catch (_: Exception) {}

                // Failover logic across candidate IPs (e.g. 192.168.3.143, 10.224.255.24)
                val candidates = keystoreManager.getCandidateUrls()
                for (candidate in candidates) {
                    try {
                        val candidateHttp = if (candidate.startsWith("http://") || candidate.startsWith("https://")) candidate else "http://$candidate"
                        val candidateUrl = candidateHttp.toHttpUrlOrNull() ?: continue
                        val newHttpUrl = request.url.newBuilder()
                            .scheme(candidateUrl.scheme)
                            .host(candidateUrl.host)
                            .port(candidateUrl.port)
                            .build()
                        val failoverRequest = builder.url(newHttpUrl).build()
                        val response = chain.proceed(failoverRequest)
                        if (response.isSuccessful || response.code < 500) {
                            keystoreManager.saveServerUrl(candidateHttp)
                            return@addInterceptor response
                        }
                        response.close()
                    } catch (_: Exception) {}
                }

                // If failover attempts fail, proceed with original request
                chain.proceed(builtRequest)
            }
            .build()

        val apiService = Retrofit.Builder()
            .baseUrl(serverUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)

        cachedBaseUrl = serverUrl
        cachedApiService = apiService
        return apiService
    }

    fun invalidateCache() {
        cachedBaseUrl = null
        cachedApiService = null
    }
}
