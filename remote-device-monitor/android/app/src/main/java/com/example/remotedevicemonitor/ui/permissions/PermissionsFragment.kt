package com.example.remotedevicemonitor.ui.permissions

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.example.remotedevicemonitor.R
import com.example.remotedevicemonitor.databinding.FragmentPermissionsBinding
import com.example.remotedevicemonitor.ui.ViewModelFactory

class PermissionsFragment : Fragment() {

    private var _binding: FragmentPermissionsBinding? = null
    private val binding get() = _binding!!

    private val viewModel: PermissionsViewModel by viewModels {
        ViewModelFactory(requireContext())
    }

    /** All permissions requested in one shot */
    private val requiredPermissions: Array<String> by lazy {
        buildList {
            // Notifications (Android 13+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
            // Foreground service (Android 9+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                add(Manifest.permission.FOREGROUND_SERVICE)
            }
        }.toTypedArray()
    }

    private val requestAllPermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val allGranted = results.values.all { it }
        viewModel.checkPermissions()
        if (allGranted) {
            // All permissions granted — go straight to the dashboard
            findNavController().navigate(R.id.action_permissions_to_status)
        } else {
            val denied = results.filter { !it.value }.keys.joinToString(", ") {
                it.substringAfterLast(".")
            }
            Toast.makeText(
                requireContext(),
                "Some permissions denied: $denied",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPermissionsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupListeners()
        observeViewModel()
    }

    override fun onResume() {
        super.onResume()
        viewModel.checkPermissions()
    }

    private fun setupListeners() {
        // Single button that requests ALL permissions at once
        binding.btnGrantNotifications.setOnClickListener {
            if (requiredPermissions.isEmpty()) {
                Toast.makeText(requireContext(), R.string.permission_already_granted, Toast.LENGTH_SHORT).show()
            } else {
                requestAllPermissionsLauncher.launch(requiredPermissions)
            }
        }

        binding.btnOpenSettings.setOnClickListener {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", requireContext().packageName, null)
            }
            startActivity(intent)
        }

        binding.btnContinue.setOnClickListener {
            findNavController().navigate(R.id.action_permissions_to_status)
        }

        binding.btnBack.setOnClickListener {
            findNavController().navigateUp()
        }
    }

    private fun observeViewModel() {
        viewModel.permissionsState.observe(viewLifecycleOwner) { state ->
            if (state.notificationGranted) {
                binding.tvNotificationStatus.setText(R.string.status_granted)
                binding.tvNotificationStatus.setTextColor(
                    ContextCompat.getColor(requireContext(), R.color.status_online)
                )
                binding.btnGrantNotifications.isEnabled = false
                binding.btnGrantNotifications.setText(R.string.status_granted)
            } else {
                binding.tvNotificationStatus.setText(R.string.status_not_granted)
                binding.tvNotificationStatus.setTextColor(
                    ContextCompat.getColor(requireContext(), R.color.status_warning)
                )
                binding.btnGrantNotifications.isEnabled = true
                binding.btnGrantNotifications.text = "Grant All Permissions"
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
