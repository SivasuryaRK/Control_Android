package com.example.remotedevicemonitor.ui.screenshare

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
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
import com.example.remotedevicemonitor.databinding.FragmentScreenShareBinding
import com.example.remotedevicemonitor.service.ScreenCaptureService
import com.example.remotedevicemonitor.ui.ViewModelFactory

class ScreenShareFragment : Fragment() {

    private var _binding: FragmentScreenShareBinding? = null
    private val binding get() = _binding!!

    private val viewModel: ScreenShareViewModel by viewModels {
        ViewModelFactory(requireContext())
    }

    private val mediaProjectionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK && result.data != null) {
            val intent = ScreenCaptureService.startIntent(
                requireContext(),
                result.resultCode,
                result.data!!
            )
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                requireContext().startForegroundService(intent)
            } else {
                requireContext().startService(intent)
            }
            Toast.makeText(requireContext(), R.string.screenshare_started, Toast.LENGTH_SHORT).show()
            viewModel.checkSharingStatus()
        } else {
            Toast.makeText(requireContext(), R.string.screenshare_denied, Toast.LENGTH_SHORT).show()
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentScreenShareBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupListeners()
        observeViewModel()
    }

    override fun onResume() {
        super.onResume()
        viewModel.checkSharingStatus()
    }

    private fun setupListeners() {
        binding.btnToggleShare.setOnClickListener {
            val isSharing = viewModel.isSharing.value == true
            if (isSharing) {
                viewModel.stopSharing()
                Toast.makeText(requireContext(), R.string.screenshare_stopped, Toast.LENGTH_SHORT).show()
            } else {
                val projMgr = requireContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
                mediaProjectionLauncher.launch(projMgr.createScreenCaptureIntent())
            }
        }

        binding.btnBack.setOnClickListener {
            findNavController().navigateUp()
        }
    }

    private fun observeViewModel() {
        viewModel.isSharing.observe(viewLifecycleOwner) { isSharing ->
            if (isSharing) {
                binding.btnToggleShare.setText(R.string.action_stop_sharing)
                binding.btnToggleShare.setBackgroundColor(
                    ContextCompat.getColor(requireContext(), R.color.status_error)
                )
                binding.tvShareStatusBadge.setText(R.string.status_sharing_active)
                binding.tvShareStatusBadge.setTextColor(
                    ContextCompat.getColor(requireContext(), R.color.status_online)
                )
                binding.ivPulseDot.setBackgroundResource(R.drawable.bg_status_dot_active)
            } else {
                binding.btnToggleShare.setText(R.string.action_start_sharing)
                binding.btnToggleShare.setBackgroundColor(
                    ContextCompat.getColor(requireContext(), R.color.accent_primary)
                )
                binding.tvShareStatusBadge.setText(R.string.status_sharing_idle)
                binding.tvShareStatusBadge.setTextColor(
                    ContextCompat.getColor(requireContext(), R.color.text_secondary)
                )
                binding.ivPulseDot.setBackgroundResource(R.drawable.bg_status_dot_idle)
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
