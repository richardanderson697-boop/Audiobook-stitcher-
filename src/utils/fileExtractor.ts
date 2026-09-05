/**
 * Safely extracts files from DataTransfer, supporting recursive directory traversal
 * for dropped folders and multi-file selections without triggering file handle revocation.
 */
export async function extractFilesFromDataTransfer(dataTransfer: DataTransfer | null): Promise<File[]> {
  if (!dataTransfer) return [];

  // Synchronously capture standard files list immediately while drag data store is active
  const immediateFiles: File[] = dataTransfer.files ? Array.from(dataTransfer.files) : [];

  // Check if any items are directories
  let hasDirectory = false;
  const entries: any[] = [];

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file') {
        try {
          const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
          if (entry) {
            entries.push(entry);
            if (entry.isDirectory) {
              hasDirectory = true;
            }
          }
        } catch {
          // ignore error if webkitGetAsEntry is not supported
        }
      }
    }
  }

  // If no directories are present, return the immediate files directly!
  // This avoids Chromium's async DataTransfer handle revocation for multi-file drops.
  if (!hasDirectory && immediateFiles.length > 0) {
    return immediateFiles;
  }

  const files: File[] = [];

  if (entries.length > 0) {
    const entryPromises: Promise<void>[] = [];

    const readEntryRecursively = async (entry: any): Promise<void> => {
      if (!entry) return;
      if (entry.isFile) {
        return new Promise<void>((resolve) => {
          entry.file(
            (f: File) => {
              if (f && f.size >= 0) files.push(f);
              resolve();
            },
            () => resolve()
          );
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        return new Promise<void>((resolve) => {
          const readNextBatch = () => {
            dirReader.readEntries(
              async (batchEntries: any[]) => {
                if (!batchEntries || batchEntries.length === 0) {
                  resolve();
                } else {
                  for (const child of batchEntries) {
                    await readEntryRecursively(child);
                  }
                  readNextBatch();
                }
              },
              () => resolve()
            );
          };
          readNextBatch();
        });
      }
    };

    for (const entry of entries) {
      entryPromises.push(readEntryRecursively(entry));
    }

    if (entryPromises.length > 0) {
      await Promise.all(entryPromises);
      if (files.length > 0) {
        return files;
      }
    }
  }

  return immediateFiles;
}
