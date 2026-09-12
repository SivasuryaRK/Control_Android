package com.example.remotedevicemonitor.data.repository

import com.example.remotedevicemonitor.data.api.ApiService
import com.example.remotedevicemonitor.data.local.KeystoreManager
import com.example.remotedevicemonitor.data.model.*
import com.google.gson.Gson
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class AuthRepository(
    private val api: ApiService,
    private val keystore: KeystoreManager
) {
    private val gson = Gson()

    suspend fun register(name: String, email: String, password: String): Result<AuthResponse> =
        withContext(Dispatchers.IO) {
            runCatching {
                val response = api.register(
                    RegisterRequest(name, email, password, password)
                )
                if (response.isSuccessful) {
                    val body = response.body()!!
                    keystore.saveAccessToken(body.accessToken)
                    keystore.saveRefreshToken(body.refreshToken)
                    keystore.saveUserId(body.user.id)
                    keystore.saveUserName(body.user.name)
                    keystore.saveUserEmail(body.user.email)
                    Result.Success(body)
                } else {
                    val errorBody = response.errorBody()?.string()
                    val apiError  = runCatching {
                        gson.fromJson(errorBody, ApiError::class.java)
                    }.getOrNull()
                    Result.Error(apiError?.error ?: apiError?.message ?: "Registration failed", response.code())
                }
            }.getOrElse { e ->
                Result.Error(e.message ?: "Network error")
            }
        }

    suspend fun login(email: String, password: String): Result<AuthResponse> =
        withContext(Dispatchers.IO) {
            runCatching {
                val response = api.login(LoginRequest(email, password))
                if (response.isSuccessful) {
                    val body = response.body()!!
                    keystore.saveAccessToken(body.accessToken)
                    keystore.saveRefreshToken(body.refreshToken)
                    keystore.saveUserId(body.user.id)
                    keystore.saveUserName(body.user.name)
                    keystore.saveUserEmail(body.user.email)
                    Result.Success(body)
                } else {
                    val errorBody = response.errorBody()?.string()
                    val apiError  = runCatching {
                        gson.fromJson(errorBody, ApiError::class.java)
                    }.getOrNull()
                    Result.Error(apiError?.error ?: apiError?.message ?: "Login failed", response.code())
                }
            }.getOrElse { e ->
                Result.Error(e.message ?: "Network error")
            }
        }

    suspend fun logout(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            api.logout()
        }
        keystore.clearAll()
        Result.Success(Unit)
    }

    suspend fun refreshToken(): Result<RefreshResponse> = withContext(Dispatchers.IO) {
        val refreshToken = keystore.getRefreshToken()
            ?: return@withContext Result.Error("No refresh token")
        runCatching {
            val response = api.refresh(RefreshRequest(refreshToken))
            if (response.isSuccessful) {
                val body = response.body()!!
                keystore.saveAccessToken(body.accessToken)
                keystore.saveRefreshToken(body.refreshToken)
                Result.Success(body)
            } else {
                keystore.clearAll()
                Result.Error("Session expired. Please log in again.", response.code())
            }
        }.getOrElse { e -> Result.Error(e.message ?: "Network error") }
    }

    fun isLoggedIn() = keystore.getAccessToken() != null
}
