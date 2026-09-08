import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { UploadCloud, FileCheck2, X } from 'lucide-react';

interface FileUploadFieldProps {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  existingFileName?: string | null;
  accept?: string;
  hint?: string;
}

// Styled wrapper around a native <input type="file"> plus drag-and-drop —
// still backed by the native picker (so camera roll/"Files" etc. all still
// work), but a file can now also be dropped straight onto the box.
export function FileUploadField({ label, file, onChange, existingFileName, accept = '.pdf,.png,.jpg,.jpeg', hint }: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const displayName = file?.name || existingFileName;

  const acceptedExtensions = accept.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
  const isAccepted = (name: string) => acceptedExtensions.length === 0 || acceptedExtensions.some((ext) => name.toLowerCase().endsWith(ext));

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && isAccepted(dropped.name)) onChange(dropped);
  };

  return (
    <div>
      <label className="label">{label}</label>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex items-center gap-2 border border-dashed rounded-lg px-3 py-2.5 cursor-pointer transition-colors ${
          dragging ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400 hover:bg-primary-50/40'
        }`}
      >
        {displayName ? <FileCheck2 size={16} className="text-success-600 flex-shrink-0" /> : <UploadCloud size={16} className="text-gray-400 flex-shrink-0" />}
        <span className={`text-sm truncate flex-1 ${displayName ? 'text-gray-700' : 'text-gray-400'}`}>
          {displayName || (dragging ? 'Drop file to upload' : 'Click or drag & drop to upload (PDF, PNG, JPG)')}
        </span>
        {file && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); if (inputRef.current) inputRef.current.value = ''; }}
            className="text-gray-400 hover:text-danger-600 flex-shrink-0"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
    </div>
  );
}
