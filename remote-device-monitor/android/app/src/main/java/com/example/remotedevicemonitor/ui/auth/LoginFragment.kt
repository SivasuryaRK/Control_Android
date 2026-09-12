package com.example.remotedevicemonitor.ui.auth

import android.app.AlertDialog
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.text.Editable
import android.text.TextWatcher
import android.widget.EditText
import android.widget.Toast
import androidx.core.view.isVisible
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.example.remotedevicemonitor.R
import com.example.remotedevicemonitor.data.api.RetrofitClient
import com.example.remotedevicemonitor.data.local.KeystoreManager
import com.example.remotedevicemonitor.data.model.Result
import com.example.remotedevicemonitor.databinding.FragmentLoginBinding
import com.example.remotedevicemonitor.ui.ViewModelFactory

class LoginFragment : Fragment() {

    private var _binding: FragmentLoginBinding? = null
    private val binding get() = _binding!!

    private lateinit var keystoreManager: KeystoreManager

    private val viewModel: AuthViewModel by viewModels {
        ViewModelFactory(requireContext())
    }

    enum class AuthMode {
        PAIR,
        LOGIN,
        REGISTER
    }

    private var currentMode = AuthMode.PAIR

    private val barcodeLauncher = registerForActivityResult(com.journeyapps.barcodescanner.ScanContract()) { result ->
        if (result.contents != null) {
            val raw = result.contents.trim()
            try {
                if (raw.startsWith("{") && raw.endsWith("}")) {
                    val json = org.json.JSONObject(raw)
                    val code = json.optString("code", json.optString("pairingCode", ""))
                    val server = json.optString("serverUrl", "")
                    if (server.isNotEmpty()) {
                        keystoreManager.saveServerUrl(server)
                        RetrofitClient.invalidateCache()
                        updateServerUrlDisplay()
                    }
                    if (code.isNotEmpty()) {
                        binding.etPairingCode.setText(code)
                        viewModel.pairWithCode(code)
                    }
                } else {
                    // Plain code or URL
                    binding.etPairingCode.setText(raw)
                    viewModel.pairWithCode(raw)
                }
            } catch (_: Exception) {
                binding.etPairingCode.setText(raw)
                viewModel.pairWithCode(raw)
            }
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentLoginBinding.inflate(inflater, container, false)
        keystoreManager = KeystoreManager(requireContext())
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        updateServerUrlDisplay()
        updateUiMode()
        setupListeners()
        setupPairingCodeAutoFormat()
        observeAuthState()
        observePairState()
    }

    private fun setupPairingCodeAutoFormat() {
        binding.etPairingCode.addTextChangedListener(object : TextWatcher {
            private var isFormatting = false

            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}

            override fun afterTextChanged(s: Editable?) {
                if (isFormatting || s == null) return

                isFormatting = true
                // Keep only alphanumeric characters and force uppercase
                val raw = s.toString().replace("[^A-Za-z0-9]".toRegex(), "").uppercase()

                val formatted = when {
                    raw.length <= 3 -> raw
                    raw.length <= 6 -> "${raw.substring(0, 3)}-${raw.substring(3)}"
                    else -> "${raw.substring(0, 3)}-${raw.substring(3, 6)}"
                }

                if (formatted != s.toString()) {
                    s.replace(0, s.length, formatted)
                    binding.etPairingCode.setSelection(s.length)
                }
                isFormatting = false
            }
        })
    }

    private fun updateServerUrlDisplay() {
        val currentUrl = keystoreManager.getServerUrl()
        binding.tvServerUrlDisplay.text = "Server: $currentUrl (tap to change)"
    }

    private fun showServerUrlDialog() {
        val currentUrl = keystoreManager.getServerUrl()
        val input = EditText(requireContext()).apply {
            setText(currentUrl)
            setSelection(text.length)
            setPadding(48, 32, 48, 32)
            hint = "e.g. http://192.168.1.4:3000"
        }

        AlertDialog.Builder(requireContext())
            .setTitle("Configure Server URL")
            .setMessage("Enter the IP & Port of your backend server (e.g. your computer's Wi-Fi IP address):")
            .setView(input)
            .setPositiveButton("Save") { _, _ ->
                val newUrl = input.text.toString().trim()
                if (newUrl.isNotEmpty()) {
                    val formatted = if (newUrl.startsWith("http://") || newUrl.startsWith("https://")) {
                        newUrl
                    } else {
                        "http://$newUrl"
                    }
                    keystoreManager.saveServerUrl(formatted)
                    RetrofitClient.invalidateCache()
                    updateServerUrlDisplay()
                    Toast.makeText(requireContext(), "Server URL updated to $formatted", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun setupListeners() {
        binding.btnServerConfig.setOnClickListener {
            showServerUrlDialog()
        }

        binding.tvServerUrlDisplay.setOnClickListener {
            showServerUrlDialog()
        }

        binding.btnScanQr.setOnClickListener {
            val options = com.journeyapps.barcodescanner.ScanOptions().apply {
                setDesiredBarcodeFormats(com.journeyapps.barcodescanner.ScanOptions.QR_CODE)
                setPrompt("Scan Website QR Code to Pair")
                setCameraId(0)
                setBeepEnabled(true)
                setBarcodeImageEnabled(false)
                setOrientationLocked(false)
            }
            barcodeLauncher.launch(options)
        }

        binding.btnSubmit.setOnClickListener {
            when (currentMode) {
                AuthMode.PAIR -> {
                    val code = binding.etPairingCode.text?.toString()?.trim().orEmpty()
                    if (code.isEmpty()) {
                        Toast.makeText(requireContext(), R.string.error_empty_pairing_code, Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    viewModel.pairWithCode(code)
                }
                AuthMode.LOGIN -> {
                    val email = binding.etEmail.text?.toString()?.trim().orEmpty()
                    val password = binding.etPassword.text?.toString()?.trim().orEmpty()
                    if (email.isEmpty() || password.isEmpty()) {
                        Toast.makeText(requireContext(), R.string.error_empty_fields, Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    viewModel.login(email, password)
                }
                AuthMode.REGISTER -> {
                    val name = binding.etName.text?.toString()?.trim().orEmpty()
                    val email = binding.etEmail.text?.toString()?.trim().orEmpty()
                    val password = binding.etPassword.text?.toString()?.trim().orEmpty()
                    if (name.isEmpty()) {
                        Toast.makeText(requireContext(), R.string.error_empty_name, Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    if (email.isEmpty() || password.isEmpty()) {
                        Toast.makeText(requireContext(), R.string.error_empty_fields, Toast.LENGTH_SHORT).show()
                        return@setOnClickListener
                    }
                    viewModel.register(name, email, password)
                }
            }
        }

        binding.tvToggleMode.setOnClickListener {
            currentMode = if (currentMode == AuthMode.LOGIN) AuthMode.REGISTER else AuthMode.LOGIN
            updateUiMode()
        }

        binding.tvTogglePairMode.setOnClickListener {
            currentMode = if (currentMode == AuthMode.PAIR) AuthMode.LOGIN else AuthMode.PAIR
            updateUiMode()
        }

        binding.btnBack.setOnClickListener {
            findNavController().navigateUp()
        }
    }

    private fun updateUiMode() {
        when (currentMode) {
            AuthMode.PAIR -> {
                binding.tilPairingCode.isVisible = true
                binding.btnScanQr.isVisible = true
                binding.tilName.isVisible = false
                binding.tilEmail.isVisible = false
                binding.tilPassword.isVisible = false
                binding.tvToggleMode.isVisible = false
                binding.tvTogglePairMode.setText(R.string.action_switch_to_login)

                binding.tvTitle.setText(R.string.title_pair)
                binding.tvSubtitle.setText(R.string.subtitle_pair)
                binding.btnSubmit.setText(R.string.action_pair_device)
            }
            AuthMode.LOGIN -> {
                binding.tilPairingCode.isVisible = false
                binding.btnScanQr.isVisible = false
                binding.tilName.isVisible = false
                binding.tilEmail.isVisible = true
                binding.tilPassword.isVisible = true
                binding.tvToggleMode.isVisible = true
                binding.tvToggleMode.setText(R.string.action_need_account)
                binding.tvTogglePairMode.setText(R.string.action_switch_to_pair)

                binding.tvTitle.setText(R.string.title_login)
                binding.tvSubtitle.setText(R.string.subtitle_login)
                binding.btnSubmit.setText(R.string.action_sign_in)
            }
            AuthMode.REGISTER -> {
                binding.tilPairingCode.isVisible = false
                binding.btnScanQr.isVisible = false
                binding.tilName.isVisible = true
                binding.tilEmail.isVisible = true
                binding.tilPassword.isVisible = true
                binding.tvToggleMode.isVisible = true
                binding.tvToggleMode.setText(R.string.action_already_have_account)
                binding.tvTogglePairMode.setText(R.string.action_switch_to_pair)

                binding.tvTitle.setText(R.string.title_register)
                binding.tvSubtitle.setText(R.string.subtitle_register)
                binding.btnSubmit.setText(R.string.action_create_account)
            }
        }
    }

    private fun observeAuthState() {
        viewModel.authState.observe(viewLifecycleOwner) { result ->
            when (result) {
                is Result.Loading -> {
                    binding.progressBar.isVisible = true
                    binding.btnSubmit.isEnabled = false
                }
                is Result.Success -> {
                    binding.progressBar.isVisible = false
                    binding.btnSubmit.isEnabled = true
                    Toast.makeText(requireContext(), R.string.login_success, Toast.LENGTH_SHORT).show()
                    findNavController().navigate(R.id.action_login_to_permissions)
                }
                is Result.Error -> {
                    binding.progressBar.isVisible = false
                    binding.btnSubmit.isEnabled = true
                    Toast.makeText(requireContext(), result.message, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun observePairState() {
        viewModel.pairState.observe(viewLifecycleOwner) { result ->
            when (result) {
                is Result.Loading -> {
                    binding.progressBar.isVisible = true
                    binding.btnSubmit.isEnabled = false
                }
                is Result.Success -> {
                    binding.progressBar.isVisible = false
                    binding.btnSubmit.isEnabled = true
                    Toast.makeText(requireContext(), R.string.pair_success, Toast.LENGTH_SHORT).show()
                    findNavController().navigate(R.id.action_login_to_permissions)
                }
                is Result.Error -> {
                    binding.progressBar.isVisible = false
                    binding.btnSubmit.isEnabled = true
                    Toast.makeText(requireContext(), result.message, Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
