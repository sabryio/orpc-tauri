import { Button } from "@orpc-tauri/ui/components/button";
import { Card } from "@orpc-tauri/ui/components/card";
import { ScrollArea } from "@orpc-tauri/ui/components/scroll-area";
import { Upload, FileCheck, X } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dropzone,
  DropzoneContent,
  DropzoneEmptyState,
} from "@/components/dropzone";
import { orpc } from "@/rpc";

interface UploadResult {
  success: boolean;
  size: number;
  filename: string;
  mime_type?: string;
}

export function FileUploadTab() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<
    Array<{ file: File; result: UploadResult }>
  >([]);

  const uploadFileMutation = useMutation(
    orpc.file.uploadFile.mutationOptions({
      onSuccess: (data) => {
        toast.success(`Uploaded: ${data.filename} (${formatBytes(data.size)})`);
      },
      onError: (error: any) => {
        toast.error(`Upload failed: ${error.message || "Unknown error"}`);
      },
    }),
  );

  const handleDrop = (acceptedFiles: File[]) => {
    setSelectedFiles(acceptedFiles);
  };

  const handleUpload = async () => {
    for (const file of selectedFiles) {
      try {
        // Convert File to Uint8Array (no base64 needed!)
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        const result = await uploadFileMutation.mutateAsync({
          input: {
            content: uint8Array,
            filename: file.name,
          },
        });

        setUploadedFiles((prev) => [...prev, { file, result }]);
      } catch (error) {
        console.error("Upload failed:", error);
      }
    }
    setSelectedFiles([]);
  };

  const handleClear = () => {
    setSelectedFiles([]);
  };

  const handleRemoveUploaded = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      {/* Upload Section */}
      <Card className="p-6 border-primary/30 bg-card flex flex-col">
        <h3 className="text-sm font-semibold text-primary mb-4">
          Upload Files
        </h3>

        <Dropzone
          src={selectedFiles.length > 0 ? selectedFiles : undefined}
          onDrop={handleDrop}
          maxFiles={5}
          maxSize={10 * 1024 * 1024} // 10MB
          className="mb-4"
        >
          <DropzoneEmptyState />
          <DropzoneContent />
        </Dropzone>

        {selectedFiles.length > 0 && (
          <>
            <div className="space-y-2 mb-4 flex-1 min-h-0 overflow-auto">
              {selectedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-card/50 border border-primary/20 rounded"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.size)} • {file.type || "unknown"}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleUpload}
                disabled={uploadFileMutation.isPending}
                className="flex-1 glow-hover"
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadFileMutation.isPending ? "Uploading..." : "Upload"}
              </Button>
              <Button
                onClick={handleClear}
                variant="outline"
                className="border-primary/50"
              >
                <X className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* Upload History */}
      <Card className="p-6 border-primary/30 bg-card flex flex-col">
        <h3 className="text-sm font-semibold text-primary mb-4">
          Upload History
        </h3>

        {uploadedFiles.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No files uploaded yet
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2">
              {uploadedFiles.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start justify-between p-3 bg-card/50 border border-primary/20 rounded hover:border-primary/50 transition-all"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <FileCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono truncate">
                        {item.result.filename}
                      </p>
                      <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                        <p>Size: {formatBytes(item.result.size)}</p>
                        {item.result.mime_type && (
                          <p>Type: {item.result.mime_type}</p>
                        )}
                        <p className="text-success">✓ Upload successful</p>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveUploaded(index)}
                    className="shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>
    </div>
  );
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
