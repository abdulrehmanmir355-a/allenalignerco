
"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useRouter } from "next/navigation";

const MAX_SIZE = 10 * 1024 * 1024;

const ALLOWED_EXTENSIONS = [
  ".stl",
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
];

type Props = {
  action: string;
};

export default function ClinicalFileUpload({
  action,
}: Props) {
  const router = useRouter();

  const inputRef = useRef<HTMLInputElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const [selected, setSelected] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
    };
  }, []);

  function selectFile(file: File | null) {
    setSelected(file);
    setMessage("");
    setSuccess(false);
    setProgress(null);
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) return;

    if (!selected) {
      setMessage("Please select a clinical file.");
      return;
    }

    const lowerName = selected.name.toLowerCase();

    if (
      !ALLOWED_EXTENSIONS.some((ext) =>
        lowerName.endsWith(ext)
      )
    ) {
      setMessage(
        "Allowed files: STL, PDF, JPG, JPEG and PNG."
      );
      return;
    }

    if (selected.size === 0) {
      setMessage("The selected file is empty.");
      return;
    }

    if (selected.size > MAX_SIZE) {
      setMessage("Maximum file size is 10 MB.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selected);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;

    setBusy(true);
    setProgress(0);
    setMessage("");
    setSuccess(false);

    xhr.open("POST", action, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        const percent = Math.round(
          (event.loaded / event.total) * 100
        );
        setProgress(percent);
      }
    };

    xhr.onload = () => {
      let result: { message?: string } = {};

      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        // Server did not return JSON.
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        setSuccess(true);
        setMessage(
          result.message || "Clinical file stored successfully."
        );
        setSelected(null);
        if (inputRef.current) {
          inputRef.current.value = "";
        }
        router.refresh();
      } else {
        setSuccess(false);
        setMessage(
          result.message ||
          `Upload failed. HTTP status: ${xhr.status}`
        );
      }
    };

    xhr.onerror = () => {
      setMessage(
        "Network interrupted. Refresh the case and check " +
        "whether the file was saved before retrying."
      );
    };

    xhr.onabort = () => {
      setMessage(
        "Upload cancelled. Check the case before retrying."
      );
      setProgress(null);
    };

    xhr.onloadend = () => {
      setBusy(false);
      xhrRef.current = null;
    };

    xhr.send(formData);
  }

  return (
    <form
      className="form-stack"
      onSubmit={upload}
    >
      <h3>Upload Clinical File</h3>

      <p className="fine-print">
        Select an STL dental scan, PDF clinical record,
        or JPG/PNG image from your computer.
      </p>

      <label>
        Choose clinical file

        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".stl,.pdf,.jpg,.jpeg,.png"
          disabled={busy}
          required
          onChange={(event) =>
            selectFile(event.target.files?.[0] ?? null)
          }
        />
      </label>

      {selected && (
        <div className="notice">
          <strong>Selected file:</strong>
          <p>{selected.name}</p>
          <p>
            Size:{" "}
            {(selected.size / (1024 * 1024)).toFixed(2)} MB
          </p>
        </div>
      )}

      {busy && (
        <div>
          <label htmlFor="clinical-upload-progress">
            Upload Progress
          </label>

          <progress
            id="clinical-upload-progress"
            value={progress ?? 0}
            max={100}
            style={{ width: "100%" }}
          />

          <p aria-live="polite">
            {progress === null
              ? "Preparing upload..."
              : progress < 100
                ? `${progress}% transferred`
                : "Transferred. Waiting for server confirmation..."}
          </p>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          className="button"
          type="submit"
          disabled={busy || !selected}
        >
          {busy ? "Uploading..." : "Upload Clinical File"}
        </button>

        {busy && (
          <button
            className="button"
            type="button"
            onClick={() => xhrRef.current?.abort()}
          >
            Cancel Upload
          </button>
        )}
      </div>

      {message && (
        <p
          className="notice"
          role="status"
          aria-live="polite"
          style={{
            borderLeft: `4px solid ${
              success ? "#15803d" : "#b45309"
            }`,
            padding: 12,
          }}
        >
          {message}
        </p>
      )}

      <p className="fine-print">
        Maximum 10 MB per file. Maximum 20 records per case.
        Files require an authenticated doctor account.
        Uploaded files are subject to server-side validation.
      </p>
    </form>
  );
}
