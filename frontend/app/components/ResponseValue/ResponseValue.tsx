"use client";

import { useState } from "react";

type Props = {
  value: unknown;
  imageSize?: number;
};

function isImageDataUrl(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value)
  );
}

export default function ResponseValue({
  value,
  imageSize = 120,
}: Props) {
  const [imageOpen, setImageOpen] = useState(false);

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (isImageDataUrl(value)) {
    return (
      <>
        <button
          type="button"
          onClick={() => setImageOpen(true)}
          aria-label="Expand participant image"
          style={{
            padding: 0,
            border: 0,
            background: "transparent",
            cursor: "zoom-in",
          }}
        >
          <img
            src={value}
            alt="Participant response"
            style={{
              width: imageSize,
              height: imageSize,
              objectFit: "cover",
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              display: "block",
            }}
          />
        </button>

        {imageOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Participant image preview"
            onClick={() => setImageOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "24px",
              background: "rgba(0, 0, 0, 0.78)",
            }}
          >
            <button
              type="button"
              aria-label="Close image preview"
              onClick={() => setImageOpen(false)}
              style={{
                position: "fixed",
                top: "20px",
                right: "24px",
                width: "42px",
                height: "42px",
                border: 0,
                borderRadius: "50%",
                background: "rgba(255, 255, 255, 0.95)",
                fontSize: "26px",
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              ×
            </button>

            <img
              src={value}
              alt="Participant response enlarged"
              onClick={(event) => event.stopPropagation()}
              style={{
                maxWidth: "95vw",
                maxHeight: "90vh",
                objectFit: "contain",
                borderRadius: "12px",
                boxShadow:
                  "0 20px 60px rgba(0, 0, 0, 0.45)",
                background: "#ffffff",
              }}
            />
          </div>
        )}
      </>
    );
  }

  if (typeof value === "object") {
    return (
      <span>
        {JSON.stringify(value)}
      </span>
    );
  }

  return <span>{String(value)}</span>;
}