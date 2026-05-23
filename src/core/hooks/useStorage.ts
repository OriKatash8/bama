import { useState } from 'react';
import { uploadFile, type UploadProgress } from '@core/firebase/storage';

export function useStorage() {
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function upload(path: string, blob: Blob): Promise<string> {
    setIsUploading(true);
    setProgress(null);
    try {
      const downloadUrl = await uploadFile(path, blob, setProgress);
      setUrl(downloadUrl);
      return downloadUrl;
    } finally {
      setIsUploading(false);
    }
  }

  return { upload, progress, url, isUploading };
}
