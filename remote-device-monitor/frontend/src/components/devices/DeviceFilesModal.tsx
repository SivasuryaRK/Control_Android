import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Folder,
  File,
  Image as ImageIcon,
  Film,
  FileText,
  Download,
  ArrowLeft,
  RefreshCw,
  HardDrive,
  Camera,
  FolderDown,
  FileSpreadsheet,
  Search,
} from 'lucide-react';

interface FileItem {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  lastModified: number;
  mimeType?: string;
  thumbnail?: string;
}

interface DeviceFilesModalProps {
  deviceId: string;
  deviceName: string;
  socket: any;
  onClose: () => void;
}

const DeviceFilesModal: React.FC<DeviceFilesModalProps> = ({
  deviceId,
  deviceName,
  socket,
  onClose,
}) => {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewFile, setPreviewFile] = useState<{ name: string; dataUrl: string; mimeType: string; size: number } | null>(null);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  // Request directory contents from phone
  const loadDirectory = useCallback(
    (path?: string, filter: 'all' | 'photos' | 'downloads' | 'documents' = 'all') => {
      if (!socket) return;
      setLoading(true);
      setError(null);
      socket.emit('files:list', { deviceId, path, filter });
    },
    [deviceId, socket]
  );

  // Socket listener for file list & file downloads
  useEffect(() => {
    if (!socket) return;

    loadDirectory();

    const handleListResponse = (data: {
      deviceId: string;
      path: string;
      files: FileItem[];
      error?: string;
    }) => {
      if (data.deviceId !== deviceId) return;
      setLoading(false);
      if (data.error && (!data.files || data.files.length === 0)) {
        setError(data.error);
      } else {
        setCurrentPath(data.path);
        setFiles(data.files || []);
      }
    };

    const handleGetResponse = (data: {
      deviceId: string;
      path: string;
      name: string;
      size: number;
      mimeType?: string;
      dataUrl?: string;
      error?: string;
    }) => {
      if (data.deviceId !== deviceId) return;
      setDownloadingFile(null);

      if (data.error) {
        alert(`Error opening file: ${data.error}`);
        return;
      }

      if (data.dataUrl) {
        if (data.mimeType?.startsWith('image/')) {
          // Open preview modal
          setPreviewFile({
            name: data.name,
            dataUrl: data.dataUrl,
            mimeType: data.mimeType || 'image/jpeg',
            size: data.size,
          });
        } else {
          // Download directly
          const link = document.createElement('a');
          link.href = data.dataUrl;
          link.download = data.name;
          link.click();
        }
      }
    };

    socket.on('files:list:response', handleListResponse);
    socket.on('files:get:response', handleGetResponse);

    return () => {
      socket.off('files:list:response', handleListResponse);
      socket.off('files:get:response', handleGetResponse);
    };
  }, [deviceId, socket, loadDirectory]);

  const handleNavigate = (dirPath: string) => {
    setHistory((prev) => [...prev, currentPath]);
    loadDirectory(dirPath);
  };

  const handleBack = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    loadDirectory(prev);
  };

  const handleOpenFile = (file: FileItem) => {
    if (file.isDirectory) {
      handleNavigate(file.path);
    } else {
      setDownloadingFile(file.name);
      socket.emit('files:get', { deviceId, path: file.path, thumbnailOnly: false });
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFileIcon = (file: FileItem) => {
    if (file.isDirectory) return <Folder className="h-6 w-6 text-amber-400 fill-amber-400/20" />;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '')) {
      return <ImageIcon className="h-6 w-6 text-emerald-400" />;
    }
    if (['mp4', 'mkv', 'mov', 'avi'].includes(ext || '')) {
      return <Film className="h-6 w-6 text-rose-400" />;
    }
    if (['pdf', 'doc', 'docx', 'txt'].includes(ext || '')) {
      return <FileText className="h-6 w-6 text-cyan-400" />;
    }
    return <File className="h-6 w-6 text-slate-400" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="glass-modal w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col h-[85vh] bg-slate-900/95">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {deviceName} File Explorer & Photos
              </h3>
              <p className="text-xs text-slate-400 truncate max-w-md font-mono">
                {currentPath || 'Internal Storage'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadDirectory(currentPath)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Quick Shortcuts Bar ── */}
        <div className="px-6 py-2.5 bg-slate-950/60 border-b border-white/5 flex items-center gap-2 overflow-x-auto text-xs">
          <button
            onClick={() => loadDirectory(undefined, 'photos')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg transition"
          >
            <Camera className="h-3.5 w-3.5" /> Camera Photos (DCIM)
          </button>
          <button
            onClick={() => loadDirectory(undefined, 'downloads')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg transition"
          >
            <FolderDown className="h-3.5 w-3.5" /> Downloads
          </button>
          <button
            onClick={() => loadDirectory(undefined, 'documents')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg transition"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Documents
          </button>
          <button
            onClick={() => loadDirectory(undefined, 'all')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition"
          >
            <HardDrive className="h-3.5 w-3.5" /> Root Storage
          </button>
        </div>

        {/* ── Search & Navigation Bar ── */}
        <div className="px-6 py-3 bg-slate-900/50 border-b border-white/5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={handleBack}
              disabled={history.length === 0}
              className="p-1.5 rounded-lg bg-slate-800 border border-white/5 text-slate-300 disabled:opacity-30 hover:bg-slate-700 transition"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-slate-300 font-mono truncate max-w-sm">
              {currentPath.split('/').filter(Boolean).slice(-2).join(' / ') || 'Storage'}
            </span>
          </div>

          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/80 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* ── File Grid / List ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-3">
              <RefreshCw className="h-8 w-8 text-cyan-400 animate-spin" />
              <p className="text-sm text-slate-400">Loading device files...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 text-rose-400 space-y-2">
              <p className="font-semibold">{error}</p>
              <button
                onClick={() => loadDirectory(currentPath)}
                className="text-xs text-cyan-400 underline hover:text-white"
              >
                Retry
              </button>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2">
              <Folder className="h-12 w-12 text-slate-600" />
              <p className="text-sm">No files found in this folder</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
              {filteredFiles.map((file) => (
                <div
                  key={file.path}
                  onClick={() => handleOpenFile(file)}
                  className="group relative bg-slate-950/60 hover:bg-slate-800/80 border border-white/5 hover:border-cyan-500/30 rounded-2xl p-3.5 flex flex-col items-center text-center cursor-pointer transition-all shadow-md hover:shadow-cyan-500/10"
                >
                  {!file.isDirectory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDownloadingFile(file.name);
                        socket.emit('files:get', { deviceId, path: file.path, thumbnailOnly: false });
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-500 text-cyan-400 hover:text-slate-950 opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                      title="Download file"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <div className="p-3 mb-2 rounded-xl bg-slate-900 group-hover:scale-105 transition-transform flex items-center justify-center">
                    {getFileIcon(file)}
                  </div>
                  <p className="text-xs font-semibold text-slate-200 truncate w-full group-hover:text-cyan-300">
                    {file.name}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {file.isDirectory ? 'Folder' : formatFileSize(file.size)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Status Bar / Downloading indicator ── */}
        {downloadingFile && (
          <div className="px-6 py-2 bg-cyan-950/80 border-t border-cyan-500/30 flex items-center gap-2 text-xs text-cyan-300">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Fetching {downloadingFile} from phone...
          </div>
        )}
      </div>

      {/* ── Photo Preview Modal ── */}
      {previewFile && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg animate-fadeIn"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-slate-900 border border-white/20 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-slate-950">
              <span className="text-sm font-bold text-white truncate">{previewFile.name}</span>
              <div className="flex items-center gap-2">
                <a
                  href={previewFile.dataUrl}
                  download={previewFile.name}
                  className="p-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-1 transition"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
                <button
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 text-slate-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-4 flex items-center justify-center bg-black">
              <img
                src={previewFile.dataUrl}
                alt={previewFile.name}
                className="max-h-[70vh] max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceFilesModal;
