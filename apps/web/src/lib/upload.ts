/**
 * The direct-to-storage PUT from the Step 8 flow. XMLHttpRequest rather than
 * fetch because only XHR reports upload progress. The browser sets
 * Content-Length from the body; Content-Type is set to the file's own type —
 * both must match the presigned signature exactly, or storage answers 403.
 */
export function uploadToStorage(
  url: string,
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        // 403 here means the signature disagreed — type or size deviated.
        reject(new Error(`storage rejected the upload (${String(xhr.status)})`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('storage upload failed'));
    });

    xhr.send(file);
  });
}
