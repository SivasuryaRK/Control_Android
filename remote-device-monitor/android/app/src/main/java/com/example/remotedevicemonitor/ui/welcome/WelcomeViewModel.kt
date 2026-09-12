package com.example.remotedevicemonitor.ui.welcome

import androidx.lifecycle.ViewModel
import com.example.remotedevicemonitor.data.local.KeystoreManager

class WelcomeViewModel(private val keystoreManager: KeystoreManager) : ViewModel() {
    fun isAlreadyLoggedIn() = keystoreManager.isPaired()
}

